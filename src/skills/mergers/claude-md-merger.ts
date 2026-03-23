/**
 * CLAUDE.md merge engine.
 *
 * Merges skill-contributed sections into an existing CLAUDE.md section
 * tree using topological sorting (Kahn's algorithm), priority-based
 * placement resolution, and conflict detection.
 */

import { ClaudeMdParser } from './claude-md-parser.js';
import { ClaudeMdSerializer } from './claude-md-serializer.js';
import type { Section, SectionTree } from './claude-md-parser.js';
import type {
  Conflict,
  MergeOperation,
  MergeResult,
  RollbackPlan,
  SkillSection,
} from '../types.js';

// ---------------------------------------------------------------------------
// ClaudeMdMerger
// ---------------------------------------------------------------------------

export class ClaudeMdMerger {
  private readonly parser: ClaudeMdParser;
  private readonly serializer: ClaudeMdSerializer;

  constructor() {
    this.parser = new ClaudeMdParser();
    this.serializer = new ClaudeMdSerializer();
  }

  /**
   * Merge skill sections into existing CLAUDE.md content.
   *
   * @param existingContent - Current CLAUDE.md content
   * @param skillSections  - Sections contributed by the skill
   * @param skillName      - Name of the skill being installed
   * @param priority       - Merge priority (higher = later)
   * @returns MergeResult with new content, operations, conflicts, rollback
   */
  merge(
    existingContent: string,
    skillSections: SkillSection[],
    skillName: string,
    priority: number,
  ): MergeResult {
    const tree = this.parser.parse(existingContent);
    const operations: MergeOperation[] = [];
    const conflicts: Conflict[] = [];

    // Topological sort: if section A references B as anchor, B comes first
    const sorted = this.topologicalSort(skillSections);

    for (const section of sorted) {
      const result = this.mergeSection(tree, section, skillName, priority);

      if (result.type === 'conflict') {
        conflicts.push(result.conflict);
      } else {
        operations.push(result.operation);
      }
    }

    const newContent = this.serializer.serialize(tree);

    const rollback: RollbackPlan = {
      operations: [
        { type: 'restore', target: 'CLAUDE.md', originalContent: existingContent },
      ],
    };

    return { content: newContent, operations, conflicts, rollback };
  }

  // -----------------------------------------------------------------------
  // Section merge logic
  // -----------------------------------------------------------------------

  private mergeSection(
    tree: SectionTree,
    section: SkillSection,
    skillName: string,
    priority: number,
  ): { type: 'success'; operation: MergeOperation } | { type: 'conflict'; conflict: Conflict } {
    const sourceMarker = `skill:${skillName}:${section.id}`;
    const { placement } = section;

    // Check for existing section with same ID
    const existing = this.findSection(tree, section.id);

    if (existing) {
      if (existing.source === sourceMarker) {
        // Same skill, same section — update in place
        existing.content = section.content;
        existing.title = section.title;
        return {
          type: 'success',
          operation: {
            type: 'modify',
            target: 'CLAUDE.md',
            content: section.content,
            marker: sourceMarker,
          },
        };
      }

      // Different source — conflict
      return {
        type: 'conflict',
        conflict: {
          type: 'section',
          id: section.id,
          existingSource: existing.source,
          incomingSource: sourceMarker,
          message:
            `Section "${section.id}" already exists (source: ${existing.source}). ` +
            `Skill "${skillName}" cannot overwrite it.`,
        },
      };
    }

    // Create new section node
    const newNode: Section = {
      id: section.id,
      title: section.title,
      level: 2,
      content: section.content,
      source: sourceMarker,
      children: [],
      startLine: -1,
      endLine: -1,
      priority,
    };

    // Resolve placement: section > after > before > position fallback
    if (placement.section) {
      const target = this.findSection(tree, placement.section);
      if (target) {
        newNode.level = target.level + 1;
        this.insertByPriority(target.children, newNode);
        return {
          type: 'success',
          operation: {
            type: 'insert',
            target: 'CLAUDE.md',
            content: section.content,
            anchor: placement.section,
            position: 'within',
            marker: sourceMarker,
          },
        };
      }
    }

    if (placement.after) {
      const anchor = this.findSection(tree, placement.after);
      if (anchor) {
        const siblings = this.getSiblings(tree, placement.after);
        if (siblings) {
          const anchorIdx = siblings.findIndex(s => s.id === placement.after);
          if (anchorIdx !== -1) {
            // Insert respecting priority among other skill sections after this anchor
            let insertIdx = anchorIdx + 1;
            while (
              insertIdx < siblings.length &&
              siblings[insertIdx].source?.startsWith('skill:') &&
              (siblings[insertIdx].priority ?? 50) <= priority
            ) {
              insertIdx++;
            }

            newNode.level = anchor.level;
            siblings.splice(insertIdx, 0, newNode);
            return {
              type: 'success',
              operation: {
                type: 'insert',
                target: 'CLAUDE.md',
                content: section.content,
                anchor: placement.after,
                position: 'after',
                marker: sourceMarker,
              },
            };
          }
        }
      }
    }

    if (placement.before) {
      const anchor = this.findSection(tree, placement.before);
      if (anchor) {
        const siblings = this.getSiblings(tree, placement.before);
        if (siblings) {
          const anchorIdx = siblings.findIndex(s => s.id === placement.before);
          if (anchorIdx !== -1) {
            newNode.level = anchor.level;
            siblings.splice(anchorIdx, 0, newNode);
            return {
              type: 'success',
              operation: {
                type: 'insert',
                target: 'CLAUDE.md',
                content: section.content,
                anchor: placement.before,
                position: 'before',
                marker: sourceMarker,
              },
            };
          }
        }
      }
    }

    // Fallback: top or bottom of root sections
    if (placement.position === 'top') {
      tree.sections.unshift(newNode);
    } else {
      tree.sections.push(newNode);
    }

    return {
      type: 'success',
      operation: {
        type: 'append',
        target: 'CLAUDE.md',
        content: section.content,
        position: placement.position === 'top' ? 'before' : 'after',
        marker: sourceMarker,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Topological sort using Kahn's algorithm
  // -----------------------------------------------------------------------

  /**
   * Sort skill sections so that if section A references section B
   * as an anchor (after/before), B is processed first.
   */
  private topologicalSort(sections: SkillSection[]): SkillSection[] {
    const sectionIds = new Set(sections.map(s => s.id));
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize
    for (const s of sections) {
      graph.set(s.id, []);
      inDegree.set(s.id, 0);
    }

    // Build edges: if section A is "after: B" and B is in this batch,
    // then B -> A (B must come first)
    for (const s of sections) {
      const anchor = s.placement.after || s.placement.before;
      if (anchor && sectionIds.has(anchor)) {
        graph.get(anchor)!.push(s.id);
        inDegree.set(s.id, (inDegree.get(s.id) ?? 0) + 1);
      }
    }

    // Kahn's algorithm
    const queue = [...inDegree.entries()]
      .filter(([, deg]) => deg === 0)
      .map(([id]) => id);
    const result: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      for (const next of graph.get(current) ?? []) {
        const newDeg = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, newDeg);
        if (newDeg === 0) {
          queue.push(next);
        }
      }
    }

    // If there are cycles, append remaining sections in original order
    if (result.length < sections.length) {
      for (const s of sections) {
        if (!result.includes(s.id)) {
          result.push(s.id);
        }
      }
    }

    const sectionMap = new Map(sections.map(s => [s.id, s]));
    return result.map(id => sectionMap.get(id)!);
  }

  // -----------------------------------------------------------------------
  // Tree traversal helpers
  // -----------------------------------------------------------------------

  /**
   * Find a section by ID anywhere in the tree (depth-first).
   */
  private findSection(tree: SectionTree, id: string): Section | null {
    for (const section of tree.sections) {
      const found = this.findInSection(section, id);
      if (found) return found;
    }
    return null;
  }

  private findInSection(section: Section, id: string): Section | null {
    if (section.id === id) return section;
    for (const child of section.children) {
      const found = this.findInSection(child, id);
      if (found) return found;
    }
    return null;
  }

  /**
   * Get the sibling array that contains a section with the given ID.
   * Returns the root sections array or a parent's children array.
   */
  private getSiblings(tree: SectionTree, id: string): Section[] | null {
    // Check root level
    if (tree.sections.some(s => s.id === id)) {
      return tree.sections;
    }

    // Check children recursively
    return this.findSiblingsInChildren(tree.sections, id);
  }

  private findSiblingsInChildren(
    sections: Section[],
    id: string,
  ): Section[] | null {
    for (const section of sections) {
      if (section.children.some(c => c.id === id)) {
        return section.children;
      }
      const found = this.findSiblingsInChildren(section.children, id);
      if (found) return found;
    }
    return null;
  }

  /**
   * Insert a section into a list respecting priority ordering.
   */
  private insertByPriority(siblings: Section[], newNode: Section): void {
    const priority = newNode.priority ?? 50;

    let insertIdx = siblings.length;
    for (let i = 0; i < siblings.length; i++) {
      if ((siblings[i].priority ?? 50) > priority) {
        insertIdx = i;
        break;
      }
    }

    siblings.splice(insertIdx, 0, newNode);
  }
}
