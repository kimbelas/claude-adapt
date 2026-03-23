import { describe, it, expect } from 'vitest';

import { QualityScorer } from '../quality-scorer.js';
import type { Section } from '../../skills/mergers/claude-md-parser.js';
import type { RepoProfile } from '../../types.js';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeSection(title: string, content: string = ''): Section {
  return {
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title,
    level: 2,
    content,
    source: 'manual',
    children: [],
    startLine: 0,
    endLine: 10,
  };
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QualityScorer', () => {
  const scorer = new QualityScorer();

  it('scores empty sections as 0', () => {
    const result = scorer.score([], '', makeProfile());

    expect(result.coverage).toBe(0);
    expect(result.depth).toBe(0);
    expect(result.specificity).toBe(0);
    expect(result.accuracy).toBe(15);
    expect(result.freshness).toBe(15);
    expect(result.total).toBe(30);
  });

  it('scores section coverage correctly', () => {
    const sections = [
      makeSection('Tech Stack'),
      makeSection('Architecture'),
      makeSection('Testing'),
      makeSection('Conventions'),
      makeSection('Security'),
    ];

    const result = scorer.score(sections, '', makeProfile());

    expect(result.coverage).toBe(15); // 5/10 * 30
  });

  it('scores full coverage as 30', () => {
    const sections = [
      makeSection('Tech Stack'),
      makeSection('Architecture'),
      makeSection('Conventions'),
      makeSection('Testing'),
      makeSection('Common Tasks'),
      makeSection('Environment Variables'),
      makeSection('Security'),
      makeSection('Gotchas'),
      makeSection('Routes'),
      makeSection('Overview'),
    ];

    const result = scorer.score(sections, '', makeProfile());

    expect(result.coverage).toBe(30);
  });

  it('recognizes section aliases', () => {
    const sections = [makeSection('Code Style')];

    const result = scorer.score(sections, '', makeProfile());

    // 'code-style' is an alias for 'conventions', so it should count as 1 match
    expect(result.coverage).toBe(3); // 1/10 * 30
  });

  it('scores content depth based on average lines', () => {
    const fifteenLines = Array.from({ length: 15 }, (_, i) => `Line ${i + 1}`).join('\n');
    const fiveLines = Array.from({ length: 5 }, (_, i) => `Line ${i + 1}`).join('\n');

    const deepSections = [
      makeSection('Section A', fifteenLines),
      makeSection('Section B', fifteenLines),
    ];
    const shallowSections = [
      makeSection('Section A', fiveLines),
      makeSection('Section B', fiveLines),
    ];

    const deepResult = scorer.score(deepSections, '', makeProfile());
    const shallowResult = scorer.score(shallowSections, '', makeProfile());

    expect(deepResult.depth).toBe(20); // avgLines = 15 >= 10 → full marks
    expect(shallowResult.depth).toBe(10); // avgLines = 5 → (5/10) * 20
  });

  it('scores specificity for code fences', () => {
    const sections = [makeSection('Example', '```\nconst x = 1;\n```')];

    const result = scorer.score(sections, '', makeProfile());

    expect(result.specificity).toBeGreaterThanOrEqual(5);
  });

  it('scores specificity for file paths', () => {
    const sections = [makeSection('Files', 'See src/components/Header.tsx for details')];

    const result = scorer.score(sections, '', makeProfile());

    expect(result.specificity).toBeGreaterThanOrEqual(5);
  });

  it('scores specificity for shell commands', () => {
    const sections = [makeSection('Build', 'npm run build')];

    const result = scorer.score(sections, '', makeProfile());

    expect(result.specificity).toBeGreaterThanOrEqual(5);
  });

  it('scores specificity for table syntax', () => {
    const sections = [makeSection('Config', '| Column | Value |')];

    const result = scorer.score(sections, '', makeProfile());

    expect(result.specificity).toBeGreaterThanOrEqual(5);
  });

  it('scores accuracy when all frameworks mentioned', () => {
    const profile = makeProfile({
      frameworks: [
        { name: 'React', confidence: 1 },
        { name: 'Next.js', confidence: 1 },
      ],
    });
    const content = 'We use React and Next.js for the frontend.';

    const result = scorer.score([], content, profile);

    expect(result.accuracy).toBe(15);
  });

  it('reduces accuracy when frameworks not mentioned', () => {
    const profile = makeProfile({
      frameworks: [
        { name: 'React', confidence: 1 },
        { name: 'Next.js', confidence: 1 },
      ],
    });
    const content = 'We use React for the frontend.';

    const result = scorer.score([], content, profile);

    expect(result.accuracy).toBe(7.5); // 1/2 * 15
  });

  it('gives full accuracy with no frameworks', () => {
    const profile = makeProfile({ frameworks: [] });

    const result = scorer.score([], '', profile);

    expect(result.accuracy).toBe(15);
  });

  it('scores freshness for matching versions', () => {
    const profile = makeProfile({
      frameworks: [{ name: 'Next.js', version: '15.0.0', confidence: 1 }],
    });
    const content = 'Next.js v15.0.0';

    const result = scorer.score([], content, profile);

    expect(result.freshness).toBe(15);
  });

  it('reduces freshness for mismatched versions', () => {
    const profile = makeProfile({
      frameworks: [{ name: 'Next.js', version: '15.0.0', confidence: 1 }],
    });
    const content = 'Next.js v14.0.0';

    const result = scorer.score([], content, profile);

    expect(result.freshness).toBe(0); // 0/1 * 15
  });

  it('total is clamped to 0-100', () => {
    const result = scorer.score([], '', makeProfile());

    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it('returns QualityBreakdown with all fields', () => {
    const result = scorer.score([], '', makeProfile());

    expect(result).toHaveProperty('coverage');
    expect(result).toHaveProperty('depth');
    expect(result).toHaveProperty('specificity');
    expect(result).toHaveProperty('accuracy');
    expect(result).toHaveProperty('freshness');
    expect(result).toHaveProperty('total');
  });
});
