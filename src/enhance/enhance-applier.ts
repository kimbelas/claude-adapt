/**
 * Applies enhance suggestions to existing CLAUDE.md and .claude/ config files.
 *
 * Uses ClaudeMdParser and ClaudeMdSerializer for CLAUDE.md modifications.
 * NEVER modifies existing handwritten content — only appends or adds new sections.
 */

import { ClaudeMdParser } from '../skills/mergers/claude-md-parser.js';
import type { Section, SectionTree } from '../skills/mergers/claude-md-parser.js';
import { ClaudeMdSerializer } from '../skills/mergers/claude-md-serializer.js';
import type { EnhanceSuggestion, ConfigSuggestion } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApplyResult {
  /** Updated CLAUDE.md content (null if no CLAUDE.md changes). */
  claudeMd: string | null;
  /** Map of config file relative paths to their new content. */
  configFiles: Map<string, string>;
  /** Count of suggestions applied. */
  appliedCount: number;
  /** Suggestions that could not be applied. */
  skipped: string[];
}

// ---------------------------------------------------------------------------
// EnhanceApplier
// ---------------------------------------------------------------------------

export class EnhanceApplier {
  private parser = new ClaudeMdParser();
  private serializer = new ClaudeMdSerializer();

  /**
   * Apply suggestions to existing CLAUDE.md content and config files.
   */
  apply(
    existingContent: string,
    suggestions: EnhanceSuggestion[],
    configSuggestions: ConfigSuggestion[],
    existingConfigs: Map<string, string>,
  ): ApplyResult {
    const result: ApplyResult = {
      claudeMd: null,
      configFiles: new Map(),
      appliedCount: 0,
      skipped: [],
    };

    if (suggestions.length === 0 && configSuggestions.length === 0) {
      return result;
    }

    // Apply CLAUDE.md suggestions
    if (suggestions.length > 0) {
      const tree = this.parser.parse(existingContent);
      const modified = this.applySuggestions(tree, suggestions, result);
      if (modified) {
        result.claudeMd = this.serializer.serialize(tree);
      }
    }

    // Apply config file suggestions — accumulate changes per file
    // so multiple suggestions targeting the same file build on each other
    const configState = new Map<string, string>(existingConfigs);

    for (const cs of configSuggestions) {
      const applied = this.applyConfigSuggestion(cs, configState);
      if (applied) {
        configState.set(cs.targetFile, applied);
        result.configFiles.set(cs.targetFile, applied);
        result.appliedCount++;
      } else {
        result.skipped.push(cs.id);
      }
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // CLAUDE.md suggestion application
  // -----------------------------------------------------------------------

  private applySuggestions(
    tree: SectionTree,
    suggestions: EnhanceSuggestion[],
    result: ApplyResult,
  ): boolean {
    let modified = false;

    for (const suggestion of suggestions) {
      switch (suggestion.category) {
        case 'missing':
        case 'environment':
        case 'routes':
        case 'security':
        case 'tasks': {
          if (suggestion.targetSection) {
            const applied = this.appendToSection(tree, suggestion);
            if (applied) {
              modified = true;
              result.appliedCount++;
            } else {
              result.skipped.push(suggestion.id);
            }
          } else {
            this.addNewSection(tree, suggestion);
            modified = true;
            result.appliedCount++;
          }
          break;
        }
        case 'incomplete': {
          const applied = this.appendToSection(tree, suggestion);
          if (applied) {
            modified = true;
            result.appliedCount++;
          } else {
            // Fallback: add as new section if target not found
            this.addNewSection(tree, suggestion);
            modified = true;
            result.appliedCount++;
          }
          break;
        }
        case 'stale': {
          const applied = this.updateStaleContent(tree, suggestion);
          if (applied) {
            modified = true;
            result.appliedCount++;
          } else {
            result.skipped.push(suggestion.id);
          }
          break;
        }
        default:
          result.skipped.push(suggestion.id);
      }
    }

    return modified;
  }

  /**
   * Add a new section to the tree at the top level (level 2).
   */
  private addNewSection(tree: SectionTree, suggestion: EnhanceSuggestion): void {
    const title = this.extractTitle(suggestion.draftContent) || suggestion.title;
    const content = this.extractContent(suggestion.draftContent);

    const section: Section = {
      id: this.slugify(suggestion.id),
      title,
      level: 2,
      content,
      source: `enhance:${suggestion.id}`,
      children: [],
      startLine: -1,
      endLine: -1,
    };

    tree.sections.push(section);
  }

  /**
   * Append draft content to an existing section.
   */
  private appendToSection(
    tree: SectionTree,
    suggestion: EnhanceSuggestion,
  ): boolean {
    if (!suggestion.targetSection) return false;

    const sections = ClaudeMdParser.flatten(tree.sections);
    const targetSlug = this.slugify(suggestion.targetSection);
    const target = sections.find(
      (s) => this.slugify(s.title) === targetSlug || this.slugify(s.id) === targetSlug,
    );

    if (!target) return false;

    const marker = `<!-- claude-adapt:enhance:${suggestion.id} -->`;
    const newContent = suggestion.draftContent.startsWith('#')
      ? this.extractContent(suggestion.draftContent)
      : suggestion.draftContent;

    if (target.content.trim()) {
      target.content = target.content.trim() + '\n\n' + marker + '\n' + newContent;
    } else {
      target.content = marker + '\n' + newContent;
    }

    return true;
  }

  /**
   * Update stale content by appending a note about the correct value.
   */
  private updateStaleContent(
    tree: SectionTree,
    suggestion: EnhanceSuggestion,
  ): boolean {
    if (!suggestion.targetSection) {
      // For stale suggestions without a target, append to the most relevant section
      // Try to find any section mentioning the stale item
      const sections = ClaudeMdParser.flatten(tree.sections);
      for (const section of sections) {
        if (section.content.toLowerCase().includes(suggestion.evidence[0]?.toLowerCase() ?? '')) {
          const marker = `<!-- claude-adapt:enhance:${suggestion.id} -->`;
          section.content = section.content.trim() + '\n\n' + marker + '\n' + suggestion.draftContent;
          return true;
        }
      }
      return false;
    }

    return this.appendToSection(tree, suggestion);
  }

  // -----------------------------------------------------------------------
  // Config file suggestion application
  // -----------------------------------------------------------------------

  private applyConfigSuggestion(
    suggestion: ConfigSuggestion,
    existingConfigs: Map<string, string>,
  ): string | null {
    const targetFile = suggestion.targetFile;

    // Handle settings.json updates
    if (targetFile.endsWith('settings.json')) {
      return this.applySettingsSuggestion(suggestion, existingConfigs.get(targetFile) ?? null);
    }

    // Handle mcp.json updates
    if (targetFile.endsWith('mcp.json')) {
      return this.applyMcpSuggestion(suggestion, existingConfigs.get(targetFile) ?? null);
    }

    // Handle command files (new files)
    if (targetFile.includes('commands/')) {
      return suggestion.draftContent;
    }

    // Handle hook files (new files)
    if (targetFile.includes('hooks/')) {
      return suggestion.draftContent;
    }

    return null;
  }

  private applySettingsSuggestion(
    suggestion: ConfigSuggestion,
    existing: string | null,
  ): string | null {
    try {
      const settings = existing ? JSON.parse(existing) : { permissions: {} };

      if (!settings.permissions) {
        settings.permissions = {};
      }
      if (!settings.permissions.allowedCommands) {
        settings.permissions.allowedCommands = [];
      }

      // Parse the draft content as JSON and merge allowedCommands
      try {
        const draft = JSON.parse(suggestion.draftContent);
        const commands: string[] = draft?.permissions?.allowedCommands ?? [];
        for (const cmd of commands) {
          if (!settings.permissions.allowedCommands.includes(cmd)) {
            settings.permissions.allowedCommands.push(cmd);
          }
        }
      } catch {
        return null;
      }

      return JSON.stringify(settings, null, 2) + '\n';
    } catch {
      return null;
    }
  }

  private applyMcpSuggestion(
    suggestion: ConfigSuggestion,
    existing: string | null,
  ): string | null {
    try {
      const mcp = existing ? JSON.parse(existing) : { mcpServers: {} };

      if (!mcp.mcpServers) {
        mcp.mcpServers = {};
      }

      // Parse draft content and extract server entries
      // Draft may have { mcpServers: { name: config } } or { name: config }
      try {
        const draftConfig = JSON.parse(suggestion.draftContent);
        if (draftConfig && typeof draftConfig === 'object') {
          // Unwrap mcpServers wrapper if present
          const servers = draftConfig.mcpServers ?? draftConfig;
          for (const [key, value] of Object.entries(servers)) {
            if (!mcp.mcpServers[key]) {
              mcp.mcpServers[key] = value;
            }
          }
        }
      } catch {
        // Draft content isn't valid JSON; skip
        return null;
      }

      return JSON.stringify(mcp, null, 2) + '\n';
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  /**
   * Extract heading title from draft content (first line starting with #).
   */
  private extractTitle(draftContent: string): string | null {
    const match = draftContent.match(/^#{1,6}\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract body content from draft (everything after the first heading line).
   */
  private extractContent(draftContent: string): string {
    const lines = draftContent.split('\n');
    const headingIndex = lines.findIndex((l) => /^#{1,6}\s+/.test(l));
    if (headingIndex >= 0) {
      return lines
        .slice(headingIndex + 1)
        .join('\n')
        .trim();
    }
    return draftContent.trim();
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
