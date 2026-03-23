/**
 * Analyzes `.claude/mcp.json` for missing MCP server entries.
 *
 * Suggests MCP servers for Supabase, databases, and browser testing
 * based on detected frameworks and dependencies.
 */

import type { ConfigSuggestion } from '../types.js';
import type { RepoProfile } from '../../types.js';
import type { FileIndex } from '../../core/context/file-index.js';

interface McpConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

export class McpAnalyzer {
  analyze(
    mcpContent: string | null,
    profile: RepoProfile,
    fileIndex: FileIndex,
  ): ConfigSuggestion[] {
    const configuredServers = this.parseConfiguredServers(mcpContent);
    const suggestions: ConfigSuggestion[] = [];

    if (this.isSupabaseDetected(profile, fileIndex)) {
      if (!this.hasServer(configuredServers, ['supabase'])) {
        suggestions.push({
          id: 'mcp-supabase',
          title: 'Add Supabase MCP server',
          description:
            'Supabase is detected in this project but no Supabase MCP server is configured. ' +
            'Adding one gives Claude direct access to your Supabase project for database queries, ' +
            'auth management, and storage operations.',
          pointsGain: 3,
          draftContent: JSON.stringify(
            {
              mcpServers: {
                supabase: {
                  command: 'npx',
                  args: ['-y', '@supabase/mcp-server'],
                },
              },
            },
            null,
            2,
          ),
          targetFile: '.claude/mcp.json',
          evidence: this.getSupabaseEvidence(profile, fileIndex),
        });
      }
    }

    if (this.isDatabaseDetected(profile)) {
      if (!this.hasServer(configuredServers, ['database', 'db', 'postgres', 'postgresql', 'mysql', 'sql'])) {
        suggestions.push({
          id: 'mcp-database',
          title: 'Add database MCP server',
          description:
            'A database dependency is detected but no database MCP server is configured. ' +
            'Adding one lets Claude query your database schema and run read-only queries for debugging.',
          pointsGain: 2,
          draftContent: JSON.stringify(
            {
              mcpServers: {
                database: {
                  command: 'npx',
                  args: ['-y', '@anthropic/mcp-server-postgres'],
                },
              },
            },
            null,
            2,
          ),
          targetFile: '.claude/mcp.json',
          evidence: this.getDatabaseEvidence(profile),
        });
      }
    }

    if (this.isPlaywrightDetected(profile)) {
      if (!this.hasServer(configuredServers, ['browser', 'playwright'])) {
        suggestions.push({
          id: 'mcp-browser',
          title: 'Add browser MCP server for Playwright',
          description:
            'Playwright is detected but no browser MCP server is configured. ' +
            'Adding one lets Claude interact with browser pages for testing and debugging.',
          pointsGain: 2,
          draftContent: JSON.stringify(
            {
              mcpServers: {
                browser: {
                  command: 'npx',
                  args: ['-y', '@anthropic/mcp-server-playwright'],
                },
              },
            },
            null,
            2,
          ),
          targetFile: '.claude/mcp.json',
          evidence: ['playwright detected in test runners'],
        });
      }
    }

    return suggestions;
  }

  // ---------------------------------------------------------------------------
  // MCP config parsing
  // ---------------------------------------------------------------------------

  private parseConfiguredServers(mcpContent: string | null): Set<string> {
    if (mcpContent === null) {
      return new Set();
    }

    try {
      const config = JSON.parse(mcpContent) as McpConfig;
      const servers = config.mcpServers ?? {};
      return new Set(Object.keys(servers).map((k) => k.toLowerCase()));
    } catch {
      return new Set();
    }
  }

  /**
   * Returns true if any of the given names match a configured server.
   */
  private hasServer(configured: Set<string>, names: string[]): boolean {
    return names.some((name) => configured.has(name));
  }

  // ---------------------------------------------------------------------------
  // Detection helpers
  // ---------------------------------------------------------------------------

  private isSupabaseDetected(profile: RepoProfile, fileIndex: FileIndex): boolean {
    const frameworkMatch = profile.frameworks.some(
      (f) => f.name.toLowerCase().includes('supabase'),
    );
    if (frameworkMatch) return true;

    const packageJson = fileIndex.read('package.json');
    if (packageJson && packageJson.includes('@supabase/')) {
      return true;
    }

    return false;
  }

  private isDatabaseDetected(profile: RepoProfile): boolean {
    const dbIndicators = ['pg', 'postgres', 'postgresql', 'mysql', 'mysql2', 'prisma', 'drizzle', 'typeorm', 'sequelize', 'knex'];
    return profile.frameworks.some((f) =>
      dbIndicators.includes(f.name.toLowerCase()),
    );
  }

  private isPlaywrightDetected(profile: RepoProfile): boolean {
    return profile.tooling.testRunners.some((r) =>
      r.toLowerCase().includes('playwright'),
    );
  }

  // ---------------------------------------------------------------------------
  // Evidence helpers
  // ---------------------------------------------------------------------------

  private getSupabaseEvidence(profile: RepoProfile, fileIndex: FileIndex): string[] {
    const evidence: string[] = [];
    const fw = profile.frameworks.find((f) =>
      f.name.toLowerCase().includes('supabase'),
    );
    if (fw) evidence.push(`framework: ${fw.name}`);

    const packageJson = fileIndex.read('package.json');
    if (packageJson && packageJson.includes('@supabase/')) {
      evidence.push('package.json contains @supabase/ dependency');
    }

    return evidence;
  }

  private getDatabaseEvidence(profile: RepoProfile): string[] {
    const dbIndicators = new Set(['pg', 'postgres', 'postgresql', 'mysql', 'mysql2', 'prisma', 'drizzle', 'typeorm', 'sequelize', 'knex']);
    return profile.frameworks
      .filter((f) => dbIndicators.has(f.name.toLowerCase()))
      .map((f) => `framework: ${f.name}`);
  }
}
