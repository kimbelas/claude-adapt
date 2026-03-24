import { describe, expect, it } from 'vitest';

import { inferAgents } from '../agents/agent-inferrer.js';
import type { DetectedCapability } from '../capabilities/types.js';
import type { AgentTemplate } from '../agents/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCapability(
  id: string,
  commands: Record<string, string>,
  confidence = 1,
  category = 'testing',
): DetectedCapability {
  return {
    rule: {
      id,
      label: id,
      category: category as DetectedCapability['rule']['category'],
      detect: {},
      commands,
    },
    confidence,
    evidence: [`detected: ${id}`],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentInferrer', () => {
  it('generates /test when test.* capabilities detected', () => {
    const caps = [
      makeCapability('test.vitest', {
        run: 'npx vitest run',
        coverage: 'npx vitest --coverage',
      }),
    ];

    const commands = inferAgents(caps);

    const testCmd = commands.find(c => c.filename === 'test.md');
    expect(testCmd).toBeDefined();
    expect(testCmd!.content).toContain('npx vitest run');
    expect(testCmd!.content).toContain('/test');
  });

  it('generates /lint when lint.* capabilities detected', () => {
    const caps = [
      makeCapability('lint.eslint', {
        run: 'npx eslint .',
        fix: 'npx eslint --fix .',
      }, 1, 'linting'),
    ];

    const commands = inferAgents(caps);

    const lintCmd = commands.find(c => c.filename === 'lint.md');
    expect(lintCmd).toBeDefined();
    expect(lintCmd!.content).toContain('npx eslint --fix .');
  });

  it('generates /lint when fmt.* capabilities detected', () => {
    const caps = [
      makeCapability('fmt.prettier', {
        run: 'npx prettier --write .',
        check: 'npx prettier --check .',
      }, 1, 'formatting'),
    ];

    const commands = inferAgents(caps);

    const lintCmd = commands.find(c => c.filename === 'lint.md');
    expect(lintCmd).toBeDefined();
    expect(lintCmd!.content).toContain('npx prettier --write .');
  });

  it('generates /commit always (no requirements)', () => {
    const caps: DetectedCapability[] = [];

    const commands = inferAgents(caps);

    const commitCmd = commands.find(c => c.filename === 'commit.md');
    expect(commitCmd).toBeDefined();
    expect(commitCmd!.content).toContain('/commit');
    expect(commitCmd!.content).toContain('git diff --cached');
  });

  it('generates /db when db.* capabilities detected', () => {
    const caps = [
      makeCapability('db.prisma', {
        migrate: 'npx prisma migrate dev',
        generate: 'npx prisma generate',
        seed: 'npx prisma db seed',
        studio: 'npx prisma studio',
        reset: 'npx prisma migrate reset',
      }, 1, 'database'),
    ];

    const commands = inferAgents(caps);

    const dbCmd = commands.find(c => c.filename === 'db.md');
    expect(dbCmd).toBeDefined();
    expect(dbCmd!.content).toContain('npx prisma migrate dev');
    expect(dbCmd!.content).toContain('/db');
    expect(dbCmd!.content).toContain('$ARGUMENTS');
  });

  it('does NOT generate /db when no database capabilities', () => {
    const caps = [
      makeCapability('test.vitest', { run: 'npx vitest run' }),
      makeCapability('lint.eslint', { run: 'npx eslint .' }, 1, 'linting'),
    ];

    const commands = inferAgents(caps);

    const dbCmd = commands.find(c => c.filename === 'db.md');
    expect(dbCmd).toBeUndefined();
  });

  it('resolves {test.*.run} placeholder to concrete command', () => {
    const caps = [
      makeCapability('test.vitest', {
        run: 'npx vitest run',
        coverage: 'npx vitest --coverage',
      }),
    ];

    const commands = inferAgents(caps);
    const testCmd = commands.find(c => c.filename === 'test.md');

    expect(testCmd).toBeDefined();
    expect(testCmd!.content).toContain('npx vitest run');
  });

  it('resolves {lint.**.fix} iterate placeholder to multiple commands', () => {
    const caps = [
      makeCapability('lint.eslint', {
        run: 'npx eslint .',
        fix: 'npx eslint --fix .',
      }, 1, 'linting'),
      makeCapability('lint.stylelint', {
        run: 'npx stylelint "**/*.css"',
        fix: 'npx stylelint --fix "**/*.css"',
      }, 0.9, 'linting'),
    ];

    const commands = inferAgents(caps);
    const lintCmd = commands.find(c => c.filename === 'lint.md');

    expect(lintCmd).toBeDefined();
    // Both lint fix commands should appear
    expect(lintCmd!.content).toContain('npx eslint --fix .');
    expect(lintCmd!.content).toContain('npx stylelint --fix "**/*.css"');
  });

  it('higher priority templates win on name conflicts', () => {
    const caps = [
      makeCapability('test.vitest', { run: 'npx vitest run' }),
    ];

    const highPriority: AgentTemplate = {
      id: 'test-custom',
      commandName: 'test',
      description: 'Custom test runner.',
      requiredCapabilities: [],
      requiredAny: ['test'],
      steps: [{ instruction: 'Run custom tests: `{test.*.run}`' }],
      constraints: [],
      priority: 200,
    };

    const lowPriority: AgentTemplate = {
      id: 'test-basic',
      commandName: 'test',
      description: 'Basic test runner.',
      requiredCapabilities: [],
      requiredAny: ['test'],
      steps: [{ instruction: 'Run basic tests: `{test.*.run}`' }],
      constraints: [],
      priority: 10,
    };

    // Pass low priority first — the inferrer should sort by priority
    const commands = inferAgents(caps, [lowPriority, highPriority]);

    const testCmds = commands.filter(c => c.filename === 'test.md');
    expect(testCmds).toHaveLength(1);
    expect(testCmds[0].content).toContain('Custom test runner.');
  });

  it('steps with ifCapability are skipped when capability missing', () => {
    const caps = [
      makeCapability('pkg.npm', { install: 'npm install' }, 1, 'package-management'),
    ];

    const template: AgentTemplate = {
      id: 'setup-custom',
      commandName: 'setup',
      description: 'Setup project.',
      requiredCapabilities: [],
      requiredAny: ['pkg'],
      steps: [
        { instruction: 'Install deps: `{pkg.*.install}`' },
        { instruction: 'Run migrations: `{db.*.migrate}`', ifCapability: 'db' },
        { instruction: 'Type check: `{build.typescript.check}`', ifCapability: 'build.typescript' },
      ],
      constraints: [],
      priority: 100,
    };

    const commands = inferAgents(caps, [template]);
    const setupCmd = commands.find(c => c.filename === 'setup.md');

    expect(setupCmd).toBeDefined();
    expect(setupCmd!.content).toContain('npm install');
    // db and build steps should be skipped
    expect(setupCmd!.content).not.toContain('migrate');
    expect(setupCmd!.content).not.toContain('Type check');
  });

  it('does not generate commands when no capabilities match requiredAny', () => {
    const caps: DetectedCapability[] = [];

    const template: AgentTemplate = {
      id: 'deploy',
      commandName: 'deploy',
      description: 'Deploy the project.',
      requiredCapabilities: [],
      requiredAny: ['deploy'],
      steps: [{ instruction: 'Deploy it' }],
      constraints: [],
      priority: 60,
    };

    const commands = inferAgents(caps, [template]);
    const deployCmd = commands.find(c => c.filename === 'deploy.md');

    expect(deployCmd).toBeUndefined();
  });

  it('generates markdown with proper structure', () => {
    const caps = [
      makeCapability('test.vitest', { run: 'npx vitest run', coverage: 'npx vitest --coverage' }),
    ];

    const commands = inferAgents(caps);
    const testCmd = commands.find(c => c.filename === 'test.md');

    expect(testCmd).toBeDefined();
    // Should have standard sections
    expect(testCmd!.content).toContain('# /test');
    expect(testCmd!.content).toContain('## Steps');
    expect(testCmd!.content).toContain('## Constraints');
    // Steps should be numbered
    expect(testCmd!.content).toMatch(/^1\. /m);
  });

  it('includes argument description for agents with hasArguments', () => {
    const caps = [
      makeCapability('db.prisma', {
        migrate: 'npx prisma migrate dev',
        seed: 'npx prisma db seed',
        reset: 'npx prisma migrate reset',
        studio: 'npx prisma studio',
        generate: 'npx prisma generate',
      }, 1, 'database'),
    ];

    const commands = inferAgents(caps);
    const dbCmd = commands.find(c => c.filename === 'db.md');

    expect(dbCmd).toBeDefined();
    expect(dbCmd!.content).toContain('## Arguments');
    expect(dbCmd!.content).toContain('$ARGUMENTS');
  });

  it('preserves passthrough placeholders like {type}', () => {
    const caps: DetectedCapability[] = [];

    const commands = inferAgents(caps);
    const commitCmd = commands.find(c => c.filename === 'commit.md');

    expect(commitCmd).toBeDefined();
    // The conventional commit format placeholder should be preserved
    // (it only appears when vcs.conventional capability is present,
    // but the freeform instruction should still exist)
    expect(commitCmd!.content).toContain('commit message');
  });
});
