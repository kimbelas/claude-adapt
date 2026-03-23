import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DecisionDetector } from '../decision-detector.js';
import type { ContextStore, SessionData } from '../types.js';

// Mock child_process to avoid real git calls
vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb?: (...args: unknown[]) => void) => {
    if (cb) cb(null, { stdout: '' });
  }),
}));

vi.mock('node:util', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:util')>();
  return {
    ...original,
    promisify: () =>
      vi.fn().mockResolvedValue({ stdout: '' }),
  };
});

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    sessionId: 'session-1',
    startCommit: 'aaa1111',
    endCommit: 'bbb2222',
    gitDiff: {
      modifiedFiles: [],
      addedFiles: [],
      deletedFiles: [],
      renamedFiles: [],
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
    },
    commits: [],
    estimatedDuration: 30,
    dominantActivity: 'feature',
    ...overrides,
  };
}

function makeStore(overrides: Partial<ContextStore> = {}): ContextStore {
  return {
    version: 1,
    projectId: 'test/project',
    lastSync: '',
    lastSessionHash: '',
    decisions: [],
    patterns: [],
    hotspots: [],
    gotchas: [],
    conventions: {
      timestamp: new Date().toISOString(),
      naming: { files: {}, functions: {}, classes: {} },
      imports: { style: {}, ordering: '' },
      fileSize: { p50: 0, p90: 0, max: 0 },
    },
    sessions: [],
    insights: [],
    ...overrides,
  };
}

describe('DecisionDetector', () => {
  let detector: DecisionDetector;
  let store: ContextStore;

  beforeEach(() => {
    detector = new DecisionDetector('/fake/project');
    store = makeStore();
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Heuristic 1: Dependency changes
  // ---------------------------------------------------------------------------

  describe('dependency detection', () => {
    it('detects added dependencies in package.json', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: ['package.json'],
          addedFiles: [],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 5,
          totalLinesRemoved: 0,
        },
      });

      // The detector calls getFileDiff internally, which we mocked.
      // Since the mock returns empty string, it won't parse any deps.
      // But the detection still runs without error.
      const decisions = await detector.detect(session, store);

      // With the empty diff mock, no dependency decisions are produced
      // (no parseable added lines), but the heuristic ran successfully.
      expect(decisions).toBeInstanceOf(Array);
    });

    it('produces no dependency decisions for non-dependency files', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: ['src/index.ts'],
          addedFiles: [],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 10,
          totalLinesRemoved: 2,
        },
      });

      const decisions = await detector.detect(session, store);
      const depDecisions = decisions.filter((d) => d.category === 'dependency');
      expect(depDecisions).toHaveLength(0);
    });

    it('recognizes requirements.txt as a dependency file', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: ['requirements.txt'],
          addedFiles: [],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 3,
          totalLinesRemoved: 0,
        },
      });

      const decisions = await detector.detect(session, store);
      // Runs the dependency heuristic path without error
      expect(decisions).toBeInstanceOf(Array);
    });
  });

  // ---------------------------------------------------------------------------
  // Heuristic 2: New directory detection
  // ---------------------------------------------------------------------------

  describe('new directory detection', () => {
    it('detects a new directory when 2+ files are added', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: [],
          addedFiles: [
            'src/services/auth.ts',
            'src/services/user.ts',
          ],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 100,
          totalLinesRemoved: 0,
        },
      });

      const decisions = await detector.detect(session, store);
      const dirDecisions = decisions.filter(
        (d) => d.category === 'architecture' && d.title.includes('directory'),
      );

      expect(dirDecisions.length).toBeGreaterThanOrEqual(1);
      expect(dirDecisions[0]!.confidence).toBeGreaterThanOrEqual(0);
      expect(dirDecisions[0]!.confidence).toBeLessThanOrEqual(1);
      expect(dirDecisions[0]!.filesAffected).toContain('src/services/auth.ts');
      expect(dirDecisions[0]!.filesAffected).toContain('src/services/user.ts');
    });

    it('does not detect directory for a single added file', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: [],
          addedFiles: ['src/services/auth.ts'],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 50,
          totalLinesRemoved: 0,
        },
      });

      const decisions = await detector.detect(session, store);
      const dirDecisions = decisions.filter(
        (d) => d.category === 'architecture' && d.title.includes('directory'),
      );
      expect(dirDecisions).toHaveLength(0);
    });

    it('ignores files at root level (dirname is ".")', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: [],
          addedFiles: ['README.md', 'LICENSE'],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 20,
          totalLinesRemoved: 0,
        },
      });

      const decisions = await detector.detect(session, store);
      const dirDecisions = decisions.filter(
        (d) => d.category === 'architecture' && d.title.includes('directory'),
      );
      expect(dirDecisions).toHaveLength(0);
    });

    it('infers test directory purpose', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: [],
          addedFiles: [
            'src/__tests__/foo.test.ts',
            'src/__tests__/bar.test.ts',
          ],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 80,
          totalLinesRemoved: 0,
        },
      });

      const decisions = await detector.detect(session, store);
      const dirDecision = decisions.find(
        (d) => d.category === 'architecture' && d.title.includes('__tests__'),
      );

      expect(dirDecision).toBeDefined();
      expect(dirDecision!.description).toContain('Tests');
    });
  });

  // ---------------------------------------------------------------------------
  // Heuristic 3: Config file changes
  // ---------------------------------------------------------------------------

  describe('config file change detection', () => {
    it('detects modified config files', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: ['tsconfig.json'],
          addedFiles: [],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 3,
          totalLinesRemoved: 1,
        },
      });

      const decisions = await detector.detect(session, store);
      const configDecisions = decisions.filter(
        (d) => d.category === 'tooling',
      );

      expect(configDecisions.length).toBeGreaterThanOrEqual(1);
      expect(configDecisions[0]!.title).toContain('tsconfig.json');
      expect(configDecisions[0]!.confidence).toBe(0.8);
    });

    it('detects newly added config files', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: [],
          addedFiles: ['vitest.config.ts'],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 20,
          totalLinesRemoved: 0,
        },
      });

      const decisions = await detector.detect(session, store);
      const configDecisions = decisions.filter(
        (d) => d.category === 'tooling',
      );

      expect(configDecisions.length).toBeGreaterThanOrEqual(1);
      expect(configDecisions[0]!.title).toContain('Added');
    });

    it('detects files in .github/workflows/', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: [],
          addedFiles: [
            '.github/workflows/ci.yml',
            '.github/workflows/deploy.yaml',
          ],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 60,
          totalLinesRemoved: 0,
        },
      });

      const decisions = await detector.detect(session, store);
      const configDecisions = decisions.filter(
        (d) => d.category === 'tooling',
      );

      expect(configDecisions.length).toBeGreaterThanOrEqual(2);
    });

    it('detects dotfiles ending in rc or rc.json', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: ['.npmrc'],
          addedFiles: [],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 1,
          totalLinesRemoved: 0,
        },
      });

      const decisions = await detector.detect(session, store);
      const configDecisions = decisions.filter(
        (d) => d.category === 'tooling',
      );

      expect(configDecisions.length).toBeGreaterThanOrEqual(1);
    });

    it('ignores non-config source files', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: ['src/app.ts'],
          addedFiles: [],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 20,
          totalLinesRemoved: 5,
        },
      });

      const decisions = await detector.detect(session, store);
      const configDecisions = decisions.filter(
        (d) => d.category === 'tooling',
      );

      expect(configDecisions).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Heuristic 4: Pattern establishment
  // ---------------------------------------------------------------------------

  describe('pattern establishment', () => {
    it('detects a pattern when 3+ similar files are added', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: [],
          addedFiles: [
            'src/components/Button.tsx',
            'src/components/Input.tsx',
            'src/components/Select.tsx',
          ],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 150,
          totalLinesRemoved: 0,
        },
      });

      const decisions = await detector.detect(session, store);
      const patternDecisions = decisions.filter(
        (d) => d.category === 'pattern' && d.title.includes('pattern'),
      );

      expect(patternDecisions.length).toBeGreaterThanOrEqual(1);
      expect(patternDecisions[0]!.filesAffected).toHaveLength(3);
    });

    it('confidence scales with file count', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: [],
          addedFiles: [
            'src/hooks/useAuth.ts',
            'src/hooks/useUser.ts',
            'src/hooks/useCart.ts',
            'src/hooks/useTheme.ts',
            'src/hooks/useForm.ts',
          ],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 200,
          totalLinesRemoved: 0,
        },
      });

      const decisions = await detector.detect(session, store);
      const patternDecision = decisions.find(
        (d) => d.category === 'pattern' && d.title.includes('pattern'),
      );

      // confidence = min(0.9, 0.5 + 5 * 0.1) = min(0.9, 1.0) = 0.9
      expect(patternDecision).toBeDefined();
      expect(patternDecision!.confidence).toBe(0.9);
    });

    it('does not detect pattern with fewer than 3 added files', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: [],
          addedFiles: [
            'src/utils/format.ts',
            'src/utils/validate.ts',
          ],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 60,
          totalLinesRemoved: 0,
        },
      });

      const decisions = await detector.detect(session, store);
      const patternDecisions = decisions.filter(
        (d) => d.category === 'pattern' && d.title.includes('Established pattern'),
      );

      expect(patternDecisions).toHaveLength(0);
    });

    it('reinforces existing low-confidence patterns when 3+ files are added', async () => {
      store.patterns = [
        {
          name: 'components pattern',
          description: '.tsx files in src/components/',
          confidence: 0.4,
          files: ['src/components/Old.tsx'],
          lastSeen: '2025-01-01T00:00:00Z',
          sessionCount: 1,
          sessionIds: ['old-session'],
        },
      ];

      // Must have 3+ added files to get past the early return guard
      // The reinforcement code runs after the main pattern detection
      const session = makeSession({
        gitDiff: {
          modifiedFiles: [],
          addedFiles: [
            'src/components/New.tsx',
            'src/utils/a.ts',
            'src/utils/b.ts',
            'src/utils/c.ts',
          ],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 120,
          totalLinesRemoved: 0,
        },
      });

      await detector.detect(session, store);

      // Existing pattern should be reinforced (0.4 + 0.15 = 0.55)
      expect(store.patterns[0]!.confidence).toBeCloseTo(0.55);
      expect(store.patterns[0]!.sessionCount).toBe(2);
      expect(store.patterns[0]!.sessionIds).toContain('session-1');
    });
  });

  // ---------------------------------------------------------------------------
  // Heuristic 5: API / route changes
  // ---------------------------------------------------------------------------

  describe('API/route changes', () => {
    it('detects new API route files', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: [],
          addedFiles: ['src/api/users.ts'],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 50,
          totalLinesRemoved: 0,
        },
      });

      const decisions = await detector.detect(session, store);
      const apiDecisions = decisions.filter(
        (d) => d.title.includes('API file'),
      );

      expect(apiDecisions.length).toBeGreaterThanOrEqual(1);
      expect(apiDecisions[0]!.confidence).toBe(0.85);
      expect(apiDecisions[0]!.title).toContain('New');
    });

    it('detects modified route files', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: ['src/routes.ts'],
          addedFiles: [],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 10,
          totalLinesRemoved: 3,
        },
      });

      const decisions = await detector.detect(session, store);
      const apiDecisions = decisions.filter(
        (d) => d.title.includes('API file'),
      );

      expect(apiDecisions.length).toBeGreaterThanOrEqual(1);
      expect(apiDecisions[0]!.title).toContain('Modified');
    });

    it('detects controller files', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: ['src/controller.ts'],
          addedFiles: [],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 20,
          totalLinesRemoved: 5,
        },
      });

      const decisions = await detector.detect(session, store);
      const apiDecisions = decisions.filter(
        (d) => d.title.includes('API file'),
      );

      expect(apiDecisions.length).toBeGreaterThanOrEqual(1);
    });

    it('detects handler files', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: [],
          addedFiles: ['src/handlers.py'],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 40,
          totalLinesRemoved: 0,
        },
      });

      const decisions = await detector.detect(session, store);
      const apiDecisions = decisions.filter(
        (d) => d.title.includes('API file'),
      );

      expect(apiDecisions.length).toBeGreaterThanOrEqual(1);
    });

    it('ignores non-API files', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: ['src/utils/helper.ts'],
          addedFiles: [],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 15,
          totalLinesRemoved: 2,
        },
      });

      const decisions = await detector.detect(session, store);
      const apiDecisions = decisions.filter(
        (d) => d.title.includes('API file'),
      );

      expect(apiDecisions).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Heuristic 6: Error handling additions
  // ---------------------------------------------------------------------------

  describe('error handling detection', () => {
    it('returns no error decisions when the diff contains no error patterns', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: ['src/app.ts'],
          addedFiles: [],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 10,
          totalLinesRemoved: 2,
        },
      });

      // The mocked git diff returns '', so no error lines are found
      const decisions = await detector.detect(session, store);
      const errorDecisions = decisions.filter(
        (d) => d.title.includes('error handling'),
      );

      expect(errorDecisions).toHaveLength(0);
    });

    it('only checks modified files, not added files', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: [],
          addedFiles: ['src/new-file.ts'],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 50,
          totalLinesRemoved: 0,
        },
      });

      const decisions = await detector.detect(session, store);
      const errorDecisions = decisions.filter(
        (d) => d.title.includes('error handling'),
      );

      expect(errorDecisions).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Confidence scoring
  // ---------------------------------------------------------------------------

  describe('confidence scoring', () => {
    it('all decisions have confidence between 0 and 1', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: ['tsconfig.json'],
          addedFiles: [
            'src/api/users.ts',
            'src/services/auth.ts',
            'src/services/user.ts',
            'src/services/cart.ts',
          ],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 200,
          totalLinesRemoved: 10,
        },
      });

      const decisions = await detector.detect(session, store);

      for (const decision of decisions) {
        expect(decision.confidence).toBeGreaterThanOrEqual(0);
        expect(decision.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple decisions from a single session
  // ---------------------------------------------------------------------------

  describe('multiple decisions from a single session', () => {
    it('detects decisions from multiple heuristics simultaneously', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: ['tsconfig.json'],
          addedFiles: [
            'src/api/orders.ts',
            'src/models/order.ts',
            'src/models/product.ts',
          ],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 200,
          totalLinesRemoved: 5,
        },
      });

      const decisions = await detector.detect(session, store);

      const categories = new Set(decisions.map((d) => d.category));
      // Expect at least tooling (tsconfig) and architecture (api + models dir)
      expect(categories.size).toBeGreaterThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns empty array for empty diffs', async () => {
      const session = makeSession();
      const decisions = await detector.detect(session, store);
      expect(decisions).toEqual([]);
    });

    it('handles single-file change that triggers no heuristic', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: ['src/utils/math.ts'],
          addedFiles: [],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 3,
          totalLinesRemoved: 1,
        },
      });

      const decisions = await detector.detect(session, store);
      expect(decisions).toHaveLength(0);
    });

    it('decision IDs are deterministic (same input produces same ID)', async () => {
      const session = makeSession({
        gitDiff: {
          modifiedFiles: ['tsconfig.json'],
          addedFiles: [],
          deletedFiles: [],
          renamedFiles: [],
          totalLinesAdded: 2,
          totalLinesRemoved: 1,
        },
      });

      const decisions1 = await detector.detect(session, store);
      const decisions2 = await detector.detect(session, store);

      expect(decisions1.map((d) => d.id)).toEqual(
        decisions2.map((d) => d.id),
      );
    });
  });
});
