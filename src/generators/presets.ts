/**
 * Safety presets for Claude Code configuration.
 *
 * Each preset provides a base set of ClaudeSettings that the
 * settings generator uses as a starting point before layering
 * on project-specific detected tools and patterns.
 *
 * - minimal:  Maximum autonomy, few restrictions. Good for solo devs
 *             or experimental projects.
 * - standard: Balanced safety. Allows common dev tools, blocks
 *             destructive operations. Default for most projects.
 * - strict:   Maximum guardrails. Denies broad tool categories,
 *             blocks all destructive commands. Good for production
 *             codebases or team environments.
 */

import type { ClaudeSettings, Preset } from './types.js';

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

const MINIMAL_SETTINGS: ClaudeSettings = {
  permissions: {
    allowedTools: [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
      'WebSearch',
      'WebFetch',
    ],
    deniedTools: [],
    allowedCommands: [
      'npm *',
      'npx *',
      'yarn *',
      'pnpm *',
      'bun *',
      'git *',
      'node *',
      'tsx *',
      'python *',
      'pip *',
      'cargo *',
      'go *',
      'make *',
      'docker *',
      'curl *',
    ],
    deniedCommands: [
      'rm -rf /',
      'rm -rf /*',
      'sudo rm -rf *',
      'mkfs *',
      ':(){:|:&};:',
    ],
  },
  behavior: {
    autoFormat: true,
    autoLint: false,
    autoTest: false,
    commitStyle: 'freeform',
  },
};

const STANDARD_SETTINGS: ClaudeSettings = {
  permissions: {
    allowedTools: [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
    ],
    deniedTools: [],
    allowedCommands: [
      'npm run *',
      'npm test',
      'npm install',
      'npx *',
      'yarn run *',
      'yarn test',
      'yarn add *',
      'pnpm run *',
      'pnpm test',
      'pnpm add *',
      'bun run *',
      'bun test',
      'git status',
      'git diff *',
      'git log *',
      'git add *',
      'git commit *',
      'git branch *',
      'git checkout *',
      'git switch *',
      'git stash *',
      'node *',
      'tsx *',
      'python *',
      'cargo test *',
      'cargo build *',
      'go test *',
      'go build *',
      'make *',
    ],
    deniedCommands: [
      'rm -rf /',
      'rm -rf /*',
      'sudo rm -rf *',
      'git push --force',
      'git push -f',
      'git reset --hard',
      'git clean -fd',
      'docker system prune -a',
      'docker rm -f *',
      'DROP DATABASE *',
      'DROP TABLE *',
      'TRUNCATE *',
      'npm publish',
      'yarn publish',
      ':(){:|:&};:',
      'mkfs *',
      'dd if=*',
    ],
  },
  behavior: {
    autoFormat: true,
    autoLint: true,
    autoTest: false,
    commitStyle: 'freeform',
  },
};

const STRICT_SETTINGS: ClaudeSettings = {
  permissions: {
    allowedTools: [
      'Read',
      'Edit',
      'Glob',
      'Grep',
    ],
    deniedTools: [
      'WebFetch',
    ],
    allowedCommands: [
      'npm run lint',
      'npm run format',
      'npm test',
      'npx prettier *',
      'npx eslint *',
      'git status',
      'git diff *',
      'git log *',
      'git add *',
    ],
    deniedCommands: [
      'rm -rf *',
      'rm -r *',
      'sudo *',
      'git push *',
      'git push --force',
      'git push -f',
      'git reset --hard',
      'git clean *',
      'git checkout -- .',
      'docker *',
      'docker system prune *',
      'docker rm *',
      'DROP DATABASE *',
      'DROP TABLE *',
      'TRUNCATE *',
      'DELETE FROM *',
      'npm publish',
      'npm unpublish *',
      'yarn publish',
      'npx *',
      'pip install *',
      'curl * | sh',
      'curl * | bash',
      'wget * | sh',
      ':(){:|:&};:',
      'mkfs *',
      'dd if=*',
      'chmod 777 *',
      'chown *',
    ],
  },
  behavior: {
    autoFormat: true,
    autoLint: true,
    autoTest: true,
    commitStyle: 'conventional',
  },
};

// ---------------------------------------------------------------------------
// Preset lookup
// ---------------------------------------------------------------------------

const PRESETS: Record<Preset, ClaudeSettings> = {
  minimal: MINIMAL_SETTINGS,
  standard: STANDARD_SETTINGS,
  strict: STRICT_SETTINGS,
};

/**
 * Returns a deep clone of the base settings for the given preset.
 *
 * Callers receive a fresh copy they can freely mutate without
 * affecting the preset template.
 */
export function getPresetSettings(preset: Preset): ClaudeSettings {
  const base = PRESETS[preset];
  if (!base) {
    throw new Error(`Unknown preset: ${preset}`);
  }
  return structuredClone(base);
}

/** Returns all valid preset names. */
export function getPresetNames(): Preset[] {
  return ['minimal', 'standard', 'strict'];
}

/** Returns a short description for the preset. */
export function getPresetDescription(preset: Preset): string {
  switch (preset) {
    case 'minimal':
      return 'Maximum autonomy, few restrictions. Best for solo devs or experiments.';
    case 'standard':
      return 'Balanced safety. Allows common tools, blocks destructive operations.';
    case 'strict':
      return 'Maximum guardrails. Denies broad tool categories, blocks all destructive commands.';
  }
}
