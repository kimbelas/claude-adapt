import { describe, it, expect } from 'vitest';
import { GapAnalyzer } from '../gap-analyzer.js';
import type { GapContext } from '../types.js';
import type { SectionTree, Section } from '../../skills/mergers/claude-md-parser.js';
import type { RepoProfile } from '../../types.js';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeProfile(overrides?: Partial<RepoProfile>): RepoProfile {
  return {
    languages: [],
    frameworks: [],
    tooling: { linters: [], formatters: [], ci: [], bundlers: [], testRunners: [] },
    structure: { monorepo: false, depth: 3, entryPoints: [] },
    packageManager: 'npm',
    ...overrides,
  };
}

function makeFileIndex(files: Record<string, string> = {}): any {
  return {
    glob(pattern: string) {
      // Simplified glob matching that handles **/ as "any path prefix including none"
      const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*\//g, '(.+/)?')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*');
      const regex = new RegExp(`^${escaped}$`);
      return Object.keys(files)
        .filter(p => regex.test(p))
        .map(p => ({ relativePath: p, path: p, size: 100, lines: 10, hash: 'abc', extension: '.ts' }));
    },
    read(path: string) { return files[path] ?? undefined; },
    exists(path: string) { return path in files; },
    getAllEntries() { return Object.keys(files).map(p => ({ relativePath: p })); },
    getFileCount() { return Object.keys(files).length; },
  };
}

function makeSection(title: string, content: string = '', children: Section[] = []): Section {
  return {
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title,
    level: 2,
    content,
    source: 'manual',
    children,
    startLine: 0,
    endLine: 10,
  };
}

function makeContext(overrides: Partial<GapContext> = {}): GapContext {
  const tree: SectionTree = overrides.tree ?? { sections: [], preamble: '' };
  const sections = overrides.sections ?? tree.sections;
  const sectionTitles = overrides.sectionTitles ?? new Set(sections.map(s => s.id));
  const sectionContent = overrides.sectionContent ?? sections.map(s => s.content).join('\n');

  return {
    tree,
    sections,
    sectionTitles,
    sectionContent,
    profile: overrides.profile ?? makeProfile(),
    scoreResult: overrides.scoreResult ?? null,
    fileIndex: overrides.fileIndex ?? makeFileIndex(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GapAnalyzer', () => {
  const analyzer = new GapAnalyzer();

  it('returns empty array when all sections exist and nothing is missing', () => {
    const sections = [
      makeSection('Tech Stack'),
      makeSection('Architecture'),
      makeSection('Conventions'),
      makeSection('Testing'),
      makeSection('Common Tasks'),
      makeSection('Gotchas'),
      makeSection('Environment Variables'),
      makeSection('Security'),
      makeSection('Routes'),
    ];

    const ctx = makeContext({
      tree: { sections, preamble: '' },
      profile: makeProfile(),
      fileIndex: makeFileIndex(),
    });

    const suggestions = analyzer.analyze(ctx);

    expect(suggestions.length).toBe(0);
  });

  it('MissingEnvironmentVarsRule: suggests env section when .env files exist', () => {
    const ctx = makeContext({
      fileIndex: makeFileIndex({
        '.env.example': 'NEXT_PUBLIC_API_URL=\nDATABASE_URL=',
      }),
    });

    const suggestions = analyzer.analyze(ctx);
    const envSuggestion = suggestions.find(s => s.id === 'missing-env-vars');

    expect(envSuggestion).toBeDefined();
    expect(envSuggestion!.category).toBe('environment');
    expect(envSuggestion!.priority).toBe('high');
    expect(envSuggestion!.draftContent).toContain('NEXT_PUBLIC_API_URL');
    expect(envSuggestion!.draftContent).toContain('DATABASE_URL');
  });

  it('MissingEnvironmentVarsRule: skips when env section already exists', () => {
    const sections = [makeSection('Environment Variables')];

    const ctx = makeContext({
      tree: { sections, preamble: '' },
      fileIndex: makeFileIndex({
        '.env.example': 'NEXT_PUBLIC_API_URL=\nDATABASE_URL=',
      }),
    });

    const suggestions = analyzer.analyze(ctx);
    const envSuggestion = suggestions.find(s => s.id === 'missing-env-vars');

    expect(envSuggestion).toBeUndefined();
  });

  it('MissingRouteStructureRule: suggests routes when app router pages exist', () => {
    const ctx = makeContext({
      fileIndex: makeFileIndex({
        'app/page.tsx': '',
        'app/dashboard/page.tsx': '',
      }),
    });

    const suggestions = analyzer.analyze(ctx);
    const routeSuggestion = suggestions.find(s => s.id === 'missing-routes');

    expect(routeSuggestion).toBeDefined();
  });

  it('MissingSecurityPolicyRule: suggests security when Supabase detected', () => {
    const ctx = makeContext({
      profile: makeProfile({
        frameworks: [{ name: 'Supabase', version: '2.0', confidence: 1 }],
      }),
    });

    const suggestions = analyzer.analyze(ctx);
    const securitySuggestion = suggestions.find(s => s.id === 'missing-security');

    expect(securitySuggestion).toBeDefined();
  });

  it('MissingSecurityPolicyRule: skips when security keywords exist', () => {
    const ctx = makeContext({
      profile: makeProfile({
        frameworks: [{ name: 'Supabase', version: '2.0', confidence: 1 }],
      }),
      sectionContent: 'security policies and rls',
    });

    const suggestions = analyzer.analyze(ctx);
    const securitySuggestion = suggestions.find(s => s.id === 'missing-security');

    expect(securitySuggestion).toBeUndefined();
  });

  it('MissingTechStackRule: suggests tech stack section', () => {
    const ctx = makeContext({
      profile: makeProfile({
        languages: [{ name: 'TypeScript', percentage: 80, fileCount: 50 }],
        frameworks: [{ name: 'Next.js', version: '15.0.0', confidence: 1 }],
      }),
    });

    const suggestions = analyzer.analyze(ctx);
    const techStackSuggestion = suggestions.find(s => s.id === 'missing-tech-stack');

    expect(techStackSuggestion).toBeDefined();
    expect(techStackSuggestion!.draftContent).toContain('Next.js');
  });

  it('MissingTestingRule: suggests testing section when test runners detected', () => {
    const ctx = makeContext({
      profile: makeProfile({
        tooling: { linters: [], formatters: [], ci: [], bundlers: [], testRunners: ['vitest'] },
      }),
    });

    const suggestions = analyzer.analyze(ctx);
    const testingSuggestion = suggestions.find(s => s.id === 'missing-testing');

    expect(testingSuggestion).toBeDefined();
  });

  it('MissingConventionsRule: suggests conventions when linter detected', () => {
    const ctx = makeContext({
      profile: makeProfile({
        tooling: { linters: ['ESLint'], formatters: [], ci: [], bundlers: [], testRunners: [] },
      }),
    });

    const suggestions = analyzer.analyze(ctx);
    const conventionsSuggestion = suggestions.find(s => s.id === 'missing-conventions');

    expect(conventionsSuggestion).toBeDefined();
  });

  it('IncompleteFrameworksRule: flags unmentioned frameworks', () => {
    const sections = [makeSection('Tech Stack', 'We use Next.js for our frontend')];

    const ctx = makeContext({
      tree: { sections, preamble: '' },
      profile: makeProfile({
        frameworks: [
          { name: 'Next.js', version: '15.0.0', confidence: 1 },
          { name: 'Tailwind', version: '3.0.0', confidence: 1 },
        ],
      }),
    });

    const suggestions = analyzer.analyze(ctx);
    const incompleteSuggestion = suggestions.find(s => s.id === 'incomplete-frameworks');

    expect(incompleteSuggestion).toBeDefined();
    expect(incompleteSuggestion!.draftContent).toContain('Tailwind');
  });

  it('StaleFrameworkVersionRule: detects outdated versions', () => {
    const sections = [makeSection('Tech Stack', 'We use Next.js v14.0.0')];

    const ctx = makeContext({
      tree: { sections, preamble: '' },
      profile: makeProfile({
        frameworks: [{ name: 'Next.js', version: '15.0.0', confidence: 1 }],
      }),
    });

    const suggestions = analyzer.analyze(ctx);
    const staleSuggestion = suggestions.find(s => s.id === 'stale-framework-version');

    expect(staleSuggestion).toBeDefined();
  });

  it('MissingSupabaseRlsRule: suggests RLS when Supabase detected without RLS docs', () => {
    const ctx = makeContext({
      fileIndex: makeFileIndex({
        'package.json': JSON.stringify({
          dependencies: { '@supabase/supabase-js': '^2.0.0' },
        }),
      }),
    });

    const suggestions = analyzer.analyze(ctx);
    const rlsSuggestion = suggestions.find(s => s.id === 'missing-supabase-rls');

    expect(rlsSuggestion).toBeDefined();
  });

  it('suggestions are sorted by priority then pointsGain', () => {
    // Trigger multiple rules across priority tiers:
    // - high: missing-env-vars (12pts), missing-security (8pts), missing-supabase-rls (8pts)
    // - medium: missing-testing (6pts), missing-tasks (5pts), missing-conventions (5pts)
    // - low: stale-framework-version (2pts)
    const sections = [makeSection('Tech Stack', 'We use Next.js v13.0.0')];

    const ctx = makeContext({
      tree: { sections, preamble: '' },
      profile: makeProfile({
        frameworks: [{ name: 'Supabase', version: '2.0', confidence: 1 }],
        tooling: {
          linters: ['ESLint'],
          formatters: [],
          ci: [],
          bundlers: [],
          testRunners: ['vitest'],
        },
      }),
      fileIndex: makeFileIndex({
        '.env.example': 'API_KEY=',
        'package.json': JSON.stringify({
          dependencies: { '@supabase/supabase-js': '^2.0.0' },
          scripts: { build: 'tsc', dev: 'tsc -w', test: 'vitest', lint: 'eslint .' },
        }),
      }),
    });

    const suggestions = analyzer.analyze(ctx);

    // Verify sorting: high-priority items come before medium, medium before low
    const priorities = suggestions.map(s => s.priority);
    const highEnd = priorities.lastIndexOf('high');
    const mediumStart = priorities.indexOf('medium');
    const mediumEnd = priorities.lastIndexOf('medium');
    const lowStart = priorities.indexOf('low');

    if (highEnd !== -1 && mediumStart !== -1) {
      expect(highEnd).toBeLessThan(mediumStart);
    }
    if (mediumEnd !== -1 && lowStart !== -1) {
      expect(mediumEnd).toBeLessThan(lowStart);
    }

    // Within same priority, higher pointsGain should come first
    for (let i = 1; i < suggestions.length; i++) {
      if (suggestions[i].priority === suggestions[i - 1].priority) {
        expect(suggestions[i - 1].pointsGain).toBeGreaterThanOrEqual(suggestions[i].pointsGain);
      }
    }
  });

  it('MissingCommonTasksRule: suggests tasks from package.json scripts', () => {
    const ctx = makeContext({
      fileIndex: makeFileIndex({
        'package.json': JSON.stringify({
          scripts: { build: 'tsc', dev: 'tsc -w', test: 'vitest', lint: 'eslint .' },
        }),
      }),
    });

    const suggestions = analyzer.analyze(ctx);
    const tasksSuggestion = suggestions.find(s => s.id === 'missing-tasks');

    expect(tasksSuggestion).toBeDefined();
    expect(tasksSuggestion!.draftContent).toContain('build');
    expect(tasksSuggestion!.draftContent).toContain('dev');
    expect(tasksSuggestion!.draftContent).toContain('test');
    expect(tasksSuggestion!.draftContent).toContain('lint');
  });
});
