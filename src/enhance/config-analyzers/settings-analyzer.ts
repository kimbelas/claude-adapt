/**
 * Analyzes `.claude/settings.json` against detected tooling.
 *
 * Checks `permissions.allowedCommands` for missing CLI tool entries
 * based on frameworks and files discovered in the repository.
 */

import type { ConfigSuggestion } from '../types.js';
import type { RepoProfile } from '../../types.js';
import type { FileIndex } from '../../core/context/file-index.js';

interface SettingsJson {
  permissions?: {
    allowedCommands?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export class SettingsAnalyzer {
  analyze(
    settingsContent: string | null,
    profile: RepoProfile,
    fileIndex: FileIndex,
  ): ConfigSuggestion[] {
    if (settingsContent === null) {
      return [];
    }

    let settings: SettingsJson;
    try {
      settings = JSON.parse(settingsContent) as SettingsJson;
    } catch {
      return [];
    }

    const suggestions: ConfigSuggestion[] = [];
    const allowed = settings.permissions?.allowedCommands ?? [];

    if (this.isSupabaseDetected(profile, fileIndex)) {
      if (!this.hasCommandPattern(allowed, ['npx supabase', 'supabase'])) {
        suggestions.push({
          id: 'settings-supabase-cli',
          title: 'Allow Supabase CLI commands',
          description:
            'Supabase is detected in this project but its CLI is not in allowedCommands. ' +
            'Adding it lets Claude run migrations, generate types, and manage edge functions.',
          pointsGain: 4,
          draftContent: JSON.stringify(
            { permissions: { allowedCommands: ['npx supabase *'] } },
            null,
            2,
          ),
          targetFile: '.claude/settings.json',
          evidence: this.getSupabaseEvidence(profile, fileIndex),
        });
      }
    }

    if (this.isPrismaDetected(profile)) {
      if (!this.hasCommandPattern(allowed, ['npx prisma'])) {
        suggestions.push({
          id: 'settings-prisma-cli',
          title: 'Allow Prisma CLI commands',
          description:
            'Prisma is detected but its CLI is not in allowedCommands. ' +
            'Adding it lets Claude run migrations, generate the client, and seed the database.',
          pointsGain: 3,
          draftContent: JSON.stringify(
            { permissions: { allowedCommands: ['npx prisma *'] } },
            null,
            2,
          ),
          targetFile: '.claude/settings.json',
          evidence: ['prisma detected in project frameworks'],
        });
      }
    }

    if (this.isDockerDetected(fileIndex)) {
      if (!this.hasCommandPattern(allowed, ['docker'])) {
        suggestions.push({
          id: 'settings-docker',
          title: 'Allow Docker commands',
          description:
            'Docker configuration files are present but `docker` is not in allowedCommands. ' +
            'Adding it lets Claude build images, manage containers, and run compose.',
          pointsGain: 2,
          draftContent: JSON.stringify(
            { permissions: { allowedCommands: ['docker *'] } },
            null,
            2,
          ),
          targetFile: '.claude/settings.json',
          evidence: this.getDockerEvidence(fileIndex),
        });
      }
    }

    return suggestions;
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

  private isPrismaDetected(profile: RepoProfile): boolean {
    return profile.frameworks.some(
      (f) => f.name.toLowerCase() === 'prisma',
    );
  }

  private isDockerDetected(fileIndex: FileIndex): boolean {
    return (
      fileIndex.exists('docker-compose.yml') ||
      fileIndex.exists('docker-compose.yaml') ||
      fileIndex.exists('Dockerfile')
    );
  }

  // ---------------------------------------------------------------------------
  // Command matching
  // ---------------------------------------------------------------------------

  /**
   * Returns true if any of the given prefixes match an entry in allowedCommands.
   * A prefix like `"npx supabase"` matches `"npx supabase *"` or `"npx supabase migrate"`.
   */
  private hasCommandPattern(allowed: string[], prefixes: string[]): boolean {
    return prefixes.some((prefix) =>
      allowed.some((cmd) => cmd.startsWith(prefix)),
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

  private getDockerEvidence(fileIndex: FileIndex): string[] {
    const evidence: string[] = [];
    if (fileIndex.exists('docker-compose.yml')) evidence.push('docker-compose.yml');
    if (fileIndex.exists('docker-compose.yaml')) evidence.push('docker-compose.yaml');
    if (fileIndex.exists('Dockerfile')) evidence.push('Dockerfile');
    return evidence;
  }
}
