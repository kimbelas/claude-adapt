/**
 * CLAUDE.md section tree serializer.
 *
 * Converts a SectionTree back into markdown text with source-tracking
 * markers for skill-contributed sections. End markers are placed after
 * sections for clean surgical removal.
 */

import type { Section, SectionTree } from './claude-md-parser.js';

// ---------------------------------------------------------------------------
// ClaudeMdSerializer
// ---------------------------------------------------------------------------

export class ClaudeMdSerializer {
  /**
   * Serialize a section tree back to markdown string.
   */
  serialize(tree: SectionTree): string {
    const lines: string[] = [];

    if (tree.preamble.trim()) {
      lines.push(tree.preamble.trim());
      lines.push('');
    }

    for (const section of tree.sections) {
      this.serializeSection(section, lines);
    }

    // Ensure single trailing newline
    let result = lines.join('\n');
    result = result.trimEnd() + '\n';

    return result;
  }

  // -----------------------------------------------------------------------
  // Recursive section serializer
  // -----------------------------------------------------------------------

  private serializeSection(section: Section, lines: string[]): void {
    const isSkillSection = section.source && section.source !== 'manual';

    // Source tracking marker (hidden from rendered markdown)
    if (isSkillSection) {
      lines.push(`<!-- claude-adapt:source:${section.source} -->`);
    }

    // Heading
    const heading = `${'#'.repeat(section.level)} ${section.title}`;
    lines.push(heading);
    lines.push('');

    // Body content
    if (section.content.trim()) {
      lines.push(section.content.trim());
      lines.push('');
    }

    // Children (recursive)
    for (const child of section.children) {
      this.serializeSection(child, lines);
    }

    // End marker for clean removal
    if (isSkillSection) {
      lines.push(`<!-- claude-adapt:end:${section.source} -->`);
      lines.push('');
    }
  }
}
