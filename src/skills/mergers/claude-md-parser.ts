/**
 * CLAUDE.md section tree parser.
 *
 * Parses a CLAUDE.md file into a hierarchical section tree based on
 * markdown headings (# through ######). Extracts source-tracking
 * markers left by skill installs so sections can be attributed
 * back to their originating skill.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Section {
  /** Slug identifier, either extracted from a marker or derived from title. */
  id: string;
  /** The heading text (without the `#` prefix). */
  title: string;
  /** Heading level (1-6). */
  level: number;
  /** Body content below the heading (excluding child sections). */
  content: string;
  /** Origin: "manual" for user-written, "skill:<name>:<id>" for skill-contributed. */
  source: string;
  /** Nested child sections. */
  children: Section[];
  /** First line index (0-based) of this section in the source. */
  startLine: number;
  /** Last line index (0-based, inclusive) of this section body. */
  endLine: number;
  /** Merge priority (used for ordering skill-contributed sections). */
  priority?: number;
}

export interface SectionTree {
  /** Top-level sections. */
  sections: Section[];
  /** Content before the first heading. */
  preamble: string;
}

// ---------------------------------------------------------------------------
// Source marker patterns
// ---------------------------------------------------------------------------

const SOURCE_MARKER_RE = /<!--\s*claude-adapt:source:(.+?)\s*-->/;
const END_MARKER_RE = /<!--\s*claude-adapt:end:(.+?)\s*-->/;
const HEADING_RE = /^(#{1,6})\s+(.+)$/;

// ---------------------------------------------------------------------------
// ClaudeMdParser
// ---------------------------------------------------------------------------

export class ClaudeMdParser {
  /**
   * Parse CLAUDE.md content into a section tree.
   */
  parse(content: string): SectionTree {
    const lines = content.split('\n');
    const root: SectionTree = { sections: [], preamble: '' };
    const stack: Section[] = [];

    // Collect preamble (lines before first heading)
    let firstHeadingLine = lines.length;
    for (let i = 0; i < lines.length; i++) {
      if (HEADING_RE.test(lines[i])) {
        firstHeadingLine = i;
        // Check if the line immediately before the heading is a source marker
        if (i > 0 && SOURCE_MARKER_RE.test(lines[i - 1])) {
          firstHeadingLine = i - 1;
        }
        break;
      }
    }
    root.preamble = lines.slice(0, firstHeadingLine).join('\n').trimEnd();

    // Parse sections
    for (let i = firstHeadingLine; i < lines.length; i++) {
      const headingMatch = lines[i].match(HEADING_RE);
      if (!headingMatch) continue;

      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      const id = this.extractId(lines, i) || this.slugify(title);
      const source = this.extractSource(lines, i);

      const section: Section = {
        id,
        title,
        level,
        content: '',
        source: source || 'manual',
        children: [],
        startLine: i,
        endLine: -1,
      };

      // Pop stack until we find a parent with lower level
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      if (stack.length === 0) {
        root.sections.push(section);
      } else {
        stack[stack.length - 1].children.push(section);
      }

      stack.push(section);
    }

    // Populate content for each section
    this.populateContent(root, lines);

    return root;
  }

  // -----------------------------------------------------------------------
  // Source marker extraction
  // -----------------------------------------------------------------------

  /**
   * Look for a source marker comment on the line immediately before
   * the heading. Format: <!-- claude-adapt:source:skill:name:section-id -->
   */
  private extractSource(lines: string[], headingLine: number): string | null {
    if (headingLine > 0) {
      const prev = lines[headingLine - 1];
      const match = prev.match(SOURCE_MARKER_RE);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * Try to extract a stable ID from a source marker on the line before
   * the heading. Falls back to null so the caller can slugify the title.
   */
  private extractId(lines: string[], headingLine: number): string | null {
    if (headingLine > 0) {
      const prev = lines[headingLine - 1];
      const match = prev.match(SOURCE_MARKER_RE);
      if (match) {
        // Source format: "skill:<skillName>:<sectionId>"
        const parts = match[1].split(':');
        if (parts.length >= 3) {
          return parts.slice(2).join(':');
        }
      }
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Content population
  // -----------------------------------------------------------------------

  /**
   * Walk all sections and fill in the `content` and `endLine` fields
   * by collecting lines between this heading and the next heading
   * at the same or higher level.
   */
  private populateContent(tree: SectionTree, lines: string[]): void {
    const allSections = this.flattenSections(tree.sections);

    for (let i = 0; i < allSections.length; i++) {
      const section = allSections[i];
      const startContentLine = section.startLine + 1;

      // Find the end boundary: next heading at same or higher level,
      // or end marker for skill sections, or EOF
      let endLine = lines.length - 1;

      for (let j = startContentLine; j < lines.length; j++) {
        // Check for end marker matching this section
        const endMatch = lines[j].match(END_MARKER_RE);
        if (endMatch && section.source !== 'manual' && endMatch[1] === section.source) {
          endLine = j - 1;
          break;
        }

        // Check for next heading at same or higher level
        const headingMatch = lines[j].match(HEADING_RE);
        if (headingMatch) {
          const nextLevel = headingMatch[1].length;
          if (nextLevel <= section.level) {
            // Back up past any source marker on the line before the heading
            endLine = j - 1;
            if (endLine >= startContentLine && SOURCE_MARKER_RE.test(lines[endLine])) {
              endLine--;
            }
            break;
          }

          // If this is a child heading, check if it belongs to a known child
          // and skip past it (children are parsed separately)
          const isChildSection = section.children.some(c => c.startLine === j);
          if (isChildSection) {
            continue;
          }
        }
      }

      section.endLine = endLine;

      // Collect body lines (exclude child section headings and their content)
      const bodyLines: string[] = [];
      const childStarts = new Set(section.children.map(c => c.startLine));

      let skipUntilLevel = -1;
      for (let j = startContentLine; j <= endLine; j++) {
        // Skip end markers
        if (END_MARKER_RE.test(lines[j])) continue;

        const hm = lines[j].match(HEADING_RE);
        if (hm) {
          const hl = hm[1].length;
          if (hl > section.level) {
            // This is content within a child; skip it
            skipUntilLevel = hl;
            continue;
          } else {
            skipUntilLevel = -1;
          }
        }

        if (skipUntilLevel > 0) continue;

        // Skip source markers for child sections
        if (SOURCE_MARKER_RE.test(lines[j])) {
          const nextLine = j + 1;
          if (nextLine < lines.length && childStarts.has(nextLine)) continue;
        }

        if (!childStarts.has(j)) {
          bodyLines.push(lines[j]);
        }
      }

      section.content = bodyLines.join('\n').trim();
    }
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  /**
   * Flatten a section tree into a depth-first ordered array.
   */
  static flatten(sections: Section[]): Section[] {
    return ClaudeMdParser.flattenImpl(sections);
  }

  private flattenSections(sections: Section[]): Section[] {
    return ClaudeMdParser.flattenImpl(sections);
  }

  private static flattenImpl(sections: Section[]): Section[] {
    const result: Section[] = [];
    for (const section of sections) {
      result.push(section);
      result.push(...ClaudeMdParser.flattenImpl(section.children));
    }
    return result;
  }

  /**
   * Convert a heading title into a URL-friendly slug identifier.
   */
  slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
