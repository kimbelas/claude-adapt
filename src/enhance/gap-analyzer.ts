/**
 * Rule-based gap analysis engine for `claude-adapt enhance`.
 *
 * Compares existing CLAUDE.md sections against detected repo characteristics
 * and returns ranked suggestions for improvements. Each rule is a small class
 * implementing GapRule that checks one specific aspect of coverage.
 */

import semver from 'semver';

import type { EnhanceSuggestion, GapContext, GapRule, SuggestionPriority } from './types.js';

// ---------------------------------------------------------------------------
// Section alias map for fuzzy title matching
// ---------------------------------------------------------------------------

const SECTION_ALIASES: Record<string, string[]> = {
  'tech-stack': ['stack', 'technology', 'technologies', 'tech', 'dependencies'],
  'environment-variables': ['environment', 'env', 'env-vars', 'configuration'],
  'security': ['security-policies', 'rls', 'row-level-security', 'auth'],
  'architecture': ['design', 'system-design', 'structure', 'overview'],
  'testing': ['tests', 'test', 'test-strategy', 'quality'],
  'common-tasks': ['tasks', 'scripts', 'commands', 'npm-scripts'],
  'gotchas': ['pitfalls', 'caveats', 'known-issues', 'warnings'],
  'conventions': ['code-conventions', 'coding-standards', 'style', 'code-style'],
  'routes': ['routing', 'route-structure', 'api-routes', 'pages', 'endpoints'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a section matching `sectionKey` exists in the parsed
 * CLAUDE.md. Checks the canonical key plus all known aliases.
 */
function hasSection(ctx: GapContext, sectionKey: string): boolean {
  const titles = ctx.sectionTitles;

  if (titles.has(sectionKey)) return true;

  const aliases = SECTION_ALIASES[sectionKey];
  if (aliases) {
    for (const alias of aliases) {
      if (titles.has(alias)) return true;
    }
  }

  return false;
}

/**
 * Check whether the concatenated section content contains any of the
 * provided keywords (case-insensitive).
 */
function hasKeyword(ctx: GapContext, ...keywords: string[]): boolean {
  const content = ctx.sectionContent.toLowerCase();
  return keywords.some((kw) => content.includes(kw.toLowerCase()));
}

/**
 * Find the existing section title that matches a canonical key,
 * so we can point `targetSection` at the real heading text.
 */
function findSectionTitle(ctx: GapContext, sectionKey: string): string | null {
  for (const section of ctx.sections) {
    const slug = section.id;
    if (slug === sectionKey) return section.title;

    const aliases = SECTION_ALIASES[sectionKey];
    if (aliases?.includes(slug)) return section.title;
  }
  return null;
}

/**
 * Map priority strings to numeric values for sorting (lower = higher priority).
 */
function priorityOrder(p: SuggestionPriority): number {
  switch (p) {
    case 'high':
      return 0;
    case 'medium':
      return 1;
    case 'low':
      return 2;
  }
}

// ---------------------------------------------------------------------------
// Rules — Missing sections (high priority)
// ---------------------------------------------------------------------------

class MissingEnvironmentVarsRule implements GapRule {
  id = 'missing-env-vars';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    const envFiles = ctx.fileIndex.glob('**/.env*');
    const dockerFiles = ctx.fileIndex.glob('**/docker-compose*');

    if (envFiles.length === 0 && dockerFiles.length === 0) return null;
    if (hasSection(ctx, 'environment-variables')) return null;

    const evidence = [
      ...envFiles.map((f) => f.relativePath),
      ...dockerFiles.map((f) => f.relativePath),
    ];

    // Try to extract variable names from .env.example or .env.local or any .env
    let variables: string[] = [];
    const envExampleContent =
      ctx.fileIndex.read('.env.example') ??
      ctx.fileIndex.read('.env.local');

    if (envExampleContent) {
      const matches = envExampleContent.matchAll(/^([A-Z][A-Z0-9_]+)=/gm);
      variables = [...matches].map((m) => m[1]);
    } else {
      // Try the first .env file found
      for (const f of envFiles) {
        const content = ctx.fileIndex.read(f.relativePath);
        if (content) {
          const matches = content.matchAll(/^([A-Z][A-Z0-9_]+)=/gm);
          variables = [...matches].map((m) => m[1]);
          break;
        }
      }
    }

    let draftContent = '## Environment Variables\n\n';
    if (variables.length > 0) {
      draftContent += '| Variable | Description | Required |\n';
      draftContent += '|----------|-------------|----------|\n';
      for (const v of variables) {
        draftContent += `| \`${v}\` | TODO | Yes |\n`;
      }
    } else {
      draftContent += 'Document required environment variables here.\n';
    }

    return {
      id: this.id,
      category: 'environment',
      priority: 'high',
      title: 'Add Environment Variables section',
      description:
        'Environment files were detected but CLAUDE.md has no section documenting them. ' +
        'Claude Code needs to know which variables are required and what they do.',
      pointsGain: 12,
      draftContent,
      targetSection: null,
      evidence,
    };
  }
}

class MissingRouteStructureRule implements GapRule {
  id = 'missing-routes';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    // Check for various route patterns
    const appRouterFiles = ctx.fileIndex.glob('**/app/**/page.tsx')
      .concat(ctx.fileIndex.glob('**/app/**/page.ts'))
      .concat(ctx.fileIndex.glob('**/app/**/page.jsx'))
      .concat(ctx.fileIndex.glob('**/app/**/page.js'));

    const pagesRouterFiles = ctx.fileIndex.glob('**/pages/**/*.tsx')
      .concat(ctx.fileIndex.glob('**/pages/**/*.ts'))
      .concat(ctx.fileIndex.glob('**/pages/**/*.jsx'))
      .concat(ctx.fileIndex.glob('**/pages/**/*.js'))
      .filter((f) => !f.relativePath.includes('_app.') && !f.relativePath.includes('_document.'));

    const genericRoutes = ctx.fileIndex.glob('**/routes/**/*.ts')
      .concat(ctx.fileIndex.glob('**/routes/**/*.js'));

    const allRouteFiles = [...appRouterFiles, ...pagesRouterFiles, ...genericRoutes];
    if (allRouteFiles.length === 0) return null;
    if (hasSection(ctx, 'routes')) return null;

    const routePaths = allRouteFiles
      .slice(0, 15)
      .map((f) => f.relativePath);

    let draftContent = '## Route Structure\n\n';
    for (const route of routePaths) {
      draftContent += `- \`${route}\`\n`;
    }
    if (allRouteFiles.length > 15) {
      draftContent += `\n_...and ${allRouteFiles.length - 15} more routes._\n`;
    }

    return {
      id: this.id,
      category: 'routes',
      priority: 'high',
      title: 'Add Route Structure section',
      description:
        'Route files were detected but CLAUDE.md has no section documenting the route structure. ' +
        'Claude Code benefits from knowing the URL/route layout.',
      pointsGain: 10,
      draftContent,
      targetSection: null,
      evidence: [`${allRouteFiles.length} route file(s) found`],
    };
  }
}

class MissingSecurityPolicyRule implements GapRule {
  id = 'missing-security';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    const hasSupabase = ctx.profile.frameworks.some(
      (fw) => fw.name.toLowerCase().includes('supabase'),
    );
    const hasDatabaseDeps = ctx.profile.frameworks.some(
      (fw) =>
        fw.name.toLowerCase().includes('prisma') ||
        fw.name.toLowerCase().includes('drizzle') ||
        fw.name.toLowerCase().includes('knex') ||
        fw.name.toLowerCase().includes('typeorm') ||
        fw.name.toLowerCase().includes('sequelize') ||
        fw.name.toLowerCase().includes('mongoose'),
    );

    if (!hasSupabase && !hasDatabaseDeps) return null;
    if (hasSection(ctx, 'security')) return null;
    if (hasKeyword(ctx, 'security', 'rls', 'row-level', 'authorization')) return null;

    let draftContent = '## Security\n\n';
    if (hasSupabase) {
      draftContent +=
        '- Always use the appropriate Supabase client type (server vs. client)\n' +
        '- Never expose service role keys in client-side code\n' +
        '- Ensure Row Level Security (RLS) is enabled on every table\n' +
        '- Validate user input on the server side before database operations\n';
    } else {
      draftContent +=
        '- Validate and sanitize all user input\n' +
        '- Use parameterized queries to prevent SQL injection\n' +
        '- Apply the principle of least privilege for database access\n' +
        '- Never expose database credentials in client-side code\n';
    }

    return {
      id: this.id,
      category: 'security',
      priority: 'high',
      title: 'Add Security Policy section',
      description:
        'Database or backend framework detected but CLAUDE.md has no security guidelines. ' +
        'Claude Code should follow explicit security policies when generating data-access code.',
      pointsGain: 8,
      draftContent,
      targetSection: null,
      evidence: [
        hasSupabase ? 'Supabase detected' : 'Database framework detected',
      ],
    };
  }
}

class MissingArchitectureRule implements GapRule {
  id = 'missing-architecture';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    if (hasSection(ctx, 'architecture')) return null;

    const { profile } = ctx;
    let draftContent = '## Architecture\n\n';

    if (profile.languages.length > 0) {
      draftContent += '### Languages\n\n';
      for (const lang of profile.languages) {
        draftContent += `- **${lang.name}** — ${lang.percentage}% (${lang.fileCount} files)\n`;
      }
      draftContent += '\n';
    }

    if (profile.frameworks.length > 0) {
      draftContent += '### Frameworks\n\n';
      for (const fw of profile.frameworks) {
        const version = fw.version ? ` v${fw.version}` : '';
        draftContent += `- ${fw.name}${version}\n`;
      }
      draftContent += '\n';
    }

    if (profile.packageManager !== 'unknown') {
      draftContent += `### Package Manager\n\n${profile.packageManager}\n\n`;
    }

    if (profile.structure.entryPoints.length > 0) {
      draftContent += '### Entry Points\n\n';
      for (const ep of profile.structure.entryPoints) {
        draftContent += `- \`${ep}\`\n`;
      }
      draftContent += '\n';
    }

    return {
      id: this.id,
      category: 'missing',
      priority: 'high',
      title: 'Add Architecture section',
      description:
        'No architecture overview found. Claude Code works best when it understands the ' +
        'project structure, languages, frameworks, and entry points.',
      pointsGain: 8,
      draftContent,
      targetSection: null,
      evidence: ['Detection results from repo scan'],
    };
  }
}

class MissingTestingRule implements GapRule {
  id = 'missing-testing';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    const { testRunners } = ctx.profile.tooling;
    if (testRunners.length === 0) return null;
    if (hasSection(ctx, 'testing')) return null;

    let draftContent = '## Testing\n\n';
    draftContent += `**Test runner${testRunners.length > 1 ? 's' : ''}:** ${testRunners.join(', ')}\n\n`;
    draftContent += '### Running Tests\n\n';
    for (const runner of testRunners) {
      const cmd = runner.toLowerCase();
      draftContent += `- \`npx ${cmd}\`\n`;
    }

    return {
      id: this.id,
      category: 'missing',
      priority: 'medium',
      title: 'Add Testing section',
      description:
        'Test runners were detected but CLAUDE.md has no testing section. ' +
        'Claude Code needs to know how to run tests and what conventions to follow.',
      pointsGain: 6,
      draftContent,
      targetSection: null,
      evidence: testRunners.map((r) => `Test runner: ${r}`),
    };
  }
}

class MissingCommonTasksRule implements GapRule {
  id = 'missing-tasks';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    const packageJsonContent = ctx.fileIndex.read('package.json');
    if (!packageJsonContent) return null;

    let scripts: Record<string, string>;
    try {
      const pkg = JSON.parse(packageJsonContent) as { scripts?: Record<string, string> };
      if (!pkg.scripts || Object.keys(pkg.scripts).length === 0) return null;
      scripts = pkg.scripts;
    } catch {
      return null;
    }

    if (hasSection(ctx, 'common-tasks')) return null;

    let draftContent = '## Common Tasks\n\n';
    for (const [name, cmd] of Object.entries(scripts)) {
      draftContent += `- \`npm run ${name}\` — ${cmd}\n`;
    }

    return {
      id: this.id,
      category: 'tasks',
      priority: 'medium',
      title: 'Add Common Tasks section',
      description:
        'npm scripts were found in package.json but CLAUDE.md has no common tasks section. ' +
        'Claude Code should know the available commands.',
      pointsGain: 5,
      draftContent,
      targetSection: null,
      evidence: ['package.json'],
    };
  }
}

class MissingGotchasRule implements GapRule {
  id = 'missing-gotchas';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    if (hasSection(ctx, 'gotchas')) return null;
    if (!ctx.scoreResult || ctx.scoreResult.total >= 70) return null;

    const weakCategories: string[] = [];
    for (const [category, catScore] of Object.entries(ctx.scoreResult.categories)) {
      if (catScore.raw < 0.5) {
        weakCategories.push(category);
      }
    }

    if (weakCategories.length === 0) return null;

    let draftContent = '## Gotchas\n\n';
    draftContent += 'Areas that need attention (based on score analysis):\n\n';
    for (const cat of weakCategories) {
      draftContent += `- **${cat}**: Scored below expectations — document known issues and workarounds\n`;
    }

    return {
      id: this.id,
      category: 'missing',
      priority: 'low',
      title: 'Add Gotchas section',
      description:
        'Score is below 70 and several categories are weak. A gotchas section helps ' +
        'Claude Code avoid known pitfalls.',
      pointsGain: 4,
      draftContent,
      targetSection: null,
      evidence: weakCategories.map((c) => `Weak category: ${c}`),
    };
  }
}

class MissingTechStackRule implements GapRule {
  id = 'missing-tech-stack';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    if (hasSection(ctx, 'tech-stack')) return null;

    const { profile } = ctx;
    let draftContent = '## Tech Stack\n\n';

    if (profile.languages.length > 0) {
      draftContent += '### Languages\n\n';
      for (const lang of profile.languages) {
        draftContent += `- **${lang.name}** — ${lang.percentage}%\n`;
      }
      draftContent += '\n';
    }

    if (profile.frameworks.length > 0) {
      draftContent += '### Frameworks & Libraries\n\n';
      for (const fw of profile.frameworks) {
        const version = fw.version ? ` v${fw.version}` : '';
        draftContent += `- ${fw.name}${version}\n`;
      }
      draftContent += '\n';
    }

    if (profile.packageManager !== 'unknown') {
      draftContent += `### Package Manager\n\n${profile.packageManager}\n`;
    }

    return {
      id: this.id,
      category: 'missing',
      priority: 'medium',
      title: 'Add Tech Stack section',
      description:
        'No tech stack section found. Listing languages, frameworks, and versions helps ' +
        'Claude Code generate idiomatic code.',
      pointsGain: 7,
      draftContent,
      targetSection: null,
      evidence: ['Detection results from repo scan'],
    };
  }
}

class MissingConventionsRule implements GapRule {
  id = 'missing-conventions';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    const { linters, formatters } = ctx.profile.tooling;
    if (linters.length === 0 && formatters.length === 0) return null;
    if (hasSection(ctx, 'conventions')) return null;

    let draftContent = '## Conventions\n\n';
    if (linters.length > 0) {
      draftContent += `**Linters:** ${linters.join(', ')}\n\n`;
    }
    if (formatters.length > 0) {
      draftContent += `**Formatters:** ${formatters.join(', ')}\n\n`;
    }
    draftContent += 'Run linting/formatting before committing:\n\n';
    draftContent += '```bash\n';
    if (linters.includes('eslint') || linters.includes('ESLint')) {
      draftContent += 'npm run lint\n';
    }
    if (formatters.includes('prettier') || formatters.includes('Prettier')) {
      draftContent += 'npm run format\n';
    }
    draftContent += '```\n';

    return {
      id: this.id,
      category: 'missing',
      priority: 'medium',
      title: 'Add Conventions section',
      description:
        'Linters and/or formatters were detected but CLAUDE.md has no conventions section. ' +
        'Claude Code should know the code style tools in use.',
      pointsGain: 5,
      draftContent,
      targetSection: null,
      evidence: [...linters, ...formatters].map((t) => `Tool: ${t}`),
    };
  }
}

// ---------------------------------------------------------------------------
// Rules — Incomplete sections (medium priority)
// ---------------------------------------------------------------------------

class IncompleteFrameworksRule implements GapRule {
  id = 'incomplete-frameworks';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    if (ctx.profile.frameworks.length === 0) return null;

    const unmentioned = ctx.profile.frameworks.filter(
      (fw) => !hasKeyword(ctx, fw.name.toLowerCase()),
    );

    if (unmentioned.length === 0) return null;

    const targetSection = findSectionTitle(ctx, 'tech-stack');

    let draftContent = 'The following frameworks were detected but are not mentioned:\n\n';
    for (const fw of unmentioned) {
      const version = fw.version ? ` v${fw.version}` : '';
      draftContent += `- ${fw.name}${version}\n`;
    }

    return {
      id: this.id,
      category: 'incomplete',
      priority: 'medium',
      title: 'Document unmentioned frameworks',
      description:
        'Some detected frameworks are not mentioned in any section. ' +
        'Claude Code generates better code when it knows all frameworks in use.',
      pointsGain: 4,
      draftContent,
      targetSection,
      evidence: unmentioned.map((fw) => `Framework: ${fw.name}`),
    };
  }
}

class IncompleteTestRunnersRule implements GapRule {
  id = 'incomplete-test-runners';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    const { testRunners } = ctx.profile.tooling;
    if (testRunners.length <= 1) return null;

    const unmentioned = testRunners.filter(
      (runner) => !hasKeyword(ctx, runner.toLowerCase()),
    );

    if (unmentioned.length === 0) return null;

    const targetSection = findSectionTitle(ctx, 'testing');

    let draftContent = 'The following test runners were detected but are not mentioned:\n\n';
    for (const runner of unmentioned) {
      draftContent += `- ${runner}\n`;
    }

    return {
      id: this.id,
      category: 'incomplete',
      priority: 'medium',
      title: 'Document all test runners',
      description:
        'Multiple test runners were detected but not all are mentioned in CLAUDE.md. ' +
        'Claude Code needs to know which runner to use for which test type.',
      pointsGain: 3,
      draftContent,
      targetSection,
      evidence: unmentioned.map((r) => `Test runner: ${r}`),
    };
  }
}

class IncompleteLinterRule implements GapRule {
  id = 'incomplete-linter';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    const { linters } = ctx.profile.tooling;
    if (linters.length === 0) return null;

    const unmentioned = linters.filter(
      (linter) => !hasKeyword(ctx, linter.toLowerCase()),
    );

    if (unmentioned.length === 0) return null;

    const targetSection = findSectionTitle(ctx, 'conventions');

    let draftContent = 'The following linters were detected but are not mentioned:\n\n';
    for (const linter of unmentioned) {
      draftContent += `- ${linter}\n`;
    }

    return {
      id: this.id,
      category: 'incomplete',
      priority: 'low',
      title: 'Document detected linters',
      description:
        'Linters are configured but not documented in the conventions section. ' +
        'Claude Code should know which linters to respect.',
      pointsGain: 2,
      draftContent,
      targetSection,
      evidence: unmentioned.map((l) => `Linter: ${l}`),
    };
  }
}

// ---------------------------------------------------------------------------
// Rules — Stale information (low priority)
// ---------------------------------------------------------------------------

class StaleFrameworkVersionRule implements GapRule {
  id = 'stale-framework-version';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    const staleFrameworks: { name: string; documented: string; detected: string }[] = [];

    for (const fw of ctx.profile.frameworks) {
      if (!fw.version) continue;

      const cleanDetected = semver.coerce(fw.version)?.version;
      if (!cleanDetected) continue;

      // Search for version-like strings near the framework name in content
      const contentLower = ctx.sectionContent.toLowerCase();
      const fwNameLower = fw.name.toLowerCase();
      const nameIdx = contentLower.indexOf(fwNameLower);
      if (nameIdx === -1) continue;

      // Look for a version string within 100 characters of the framework name
      const vicinity = ctx.sectionContent.slice(nameIdx, nameIdx + 100);
      const versionMatch = vicinity.match(/v?(\d+\.\d+(?:\.\d+)?)/);
      if (!versionMatch) continue;

      const cleanDocumented = semver.coerce(versionMatch[1])?.version;
      if (!cleanDocumented) continue;

      if (cleanDocumented !== cleanDetected && semver.neq(cleanDocumented, cleanDetected)) {
        staleFrameworks.push({
          name: fw.name,
          documented: cleanDocumented,
          detected: cleanDetected,
        });
      }
    }

    if (staleFrameworks.length === 0) return null;

    let draftContent = 'The following framework versions appear outdated in CLAUDE.md:\n\n';
    for (const sf of staleFrameworks) {
      draftContent += `- **${sf.name}**: documented v${sf.documented}, detected v${sf.detected}\n`;
    }

    return {
      id: this.id,
      category: 'stale',
      priority: 'low',
      title: 'Update stale framework versions',
      description:
        'Some framework versions documented in CLAUDE.md differ from what was detected. ' +
        'Stale version info can cause Claude Code to generate incompatible code.',
      pointsGain: 2,
      draftContent,
      targetSection: findSectionTitle(ctx, 'tech-stack'),
      evidence: staleFrameworks.map(
        (sf) => `${sf.name}: documented v${sf.documented} vs detected v${sf.detected}`,
      ),
    };
  }
}

class StalePackageManagerRule implements GapRule {
  id = 'stale-package-manager';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    const detected = ctx.profile.packageManager;
    if (detected === 'unknown') return null;

    const contentLower = ctx.sectionContent.toLowerCase();
    const managers = ['npm', 'yarn', 'pnpm', 'bun'] as const;

    // Check which package managers are mentioned in the content
    const mentioned = managers.filter((m) => contentLower.includes(m));
    if (mentioned.length === 0) return null;

    // If the detected manager is already mentioned, nothing stale
    if (mentioned.includes(detected)) return null;

    // A different package manager is mentioned but not the detected one
    const draftContent =
      `CLAUDE.md mentions **${mentioned.join(', ')}** but the detected package manager is **${detected}**.\n\n` +
      `Update references to use \`${detected}\` commands instead.\n`;

    return {
      id: this.id,
      category: 'stale',
      priority: 'low',
      title: 'Update package manager references',
      description:
        'The package manager referenced in CLAUDE.md differs from what was detected. ' +
        'Claude Code may use the wrong package manager for install/run commands.',
      pointsGain: 1,
      draftContent,
      targetSection: null,
      evidence: [`Detected: ${detected}, mentioned: ${mentioned.join(', ')}`],
    };
  }
}

// ---------------------------------------------------------------------------
// Rules — Security-specific
// ---------------------------------------------------------------------------

class MissingSupabaseRlsRule implements GapRule {
  id = 'missing-supabase-rls';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    // Check if Supabase is detected via framework name
    const supabaseFramework = ctx.profile.frameworks.some(
      (fw) => fw.name.toLowerCase().includes('supabase'),
    );

    // Check if Supabase is a dependency in package.json
    let supabaseDep = false;
    const packageJsonContent = ctx.fileIndex.read('package.json');
    if (packageJsonContent) {
      try {
        const pkg = JSON.parse(packageJsonContent) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };
        supabaseDep = '@supabase/supabase-js' in allDeps;
      } catch {
        // Invalid package.json, skip
      }
    }

    if (!supabaseFramework && !supabaseDep) return null;
    if (hasKeyword(ctx, 'rls', 'row-level-security', 'row level security')) return null;

    const draftContent =
      '## Supabase Row Level Security\n\n' +
      '- **Every table must have RLS enabled** — no exceptions\n' +
      '- Write RLS policies that restrict access to the authenticated user\'s own data\n' +
      '- Use `auth.uid()` in policies to reference the current user\n' +
      '- Test policies by querying as different user roles\n' +
      '- Never bypass RLS with the service role client in user-facing code\n' +
      '- When creating new tables, always include:\n' +
      '  ```sql\n' +
      '  ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;\n' +
      '  ```\n';

    return {
      id: this.id,
      category: 'security',
      priority: 'high',
      title: 'Add Supabase RLS policy section',
      description:
        'Supabase is detected but CLAUDE.md has no mention of Row Level Security. ' +
        'RLS must be enabled on every table to prevent unauthorized data access.',
      pointsGain: 8,
      draftContent,
      targetSection: null,
      evidence: [
        supabaseFramework ? 'Supabase detected in frameworks' : '@supabase/supabase-js in package.json',
      ],
    };
  }
}

class MissingAuthPolicyRule implements GapRule {
  id = 'missing-auth-policy';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    const authFrameworkNames = [
      'next-auth', 'nextauth', 'auth.js', '@auth/',
      'passport', 'clerk', 'supabase',
    ];

    const hasAuthFramework = ctx.profile.frameworks.some((fw) => {
      const nameLower = fw.name.toLowerCase();
      return authFrameworkNames.some((auth) => nameLower.includes(auth));
    });

    if (!hasAuthFramework) return null;
    if (hasKeyword(ctx, 'auth', 'authentication', 'authorization')) return null;

    const detectedAuth = ctx.profile.frameworks.find((fw) => {
      const nameLower = fw.name.toLowerCase();
      return authFrameworkNames.some((auth) => nameLower.includes(auth));
    });

    const draftContent =
      '## Authentication & Authorization\n\n' +
      '- Always verify authentication before performing protected operations\n' +
      '- Use server-side session validation, never trust client-side tokens alone\n' +
      '- Implement proper role-based access control (RBAC) where needed\n' +
      '- Log authentication failures for security monitoring\n' +
      '- Never store sensitive tokens in localStorage; use httpOnly cookies\n';

    return {
      id: this.id,
      category: 'security',
      priority: 'medium',
      title: 'Add Authentication Policy section',
      description:
        'An auth framework was detected but CLAUDE.md has no authentication/authorization guidelines. ' +
        'Claude Code should follow explicit auth policies when generating protected routes.',
      pointsGain: 5,
      draftContent,
      targetSection: null,
      evidence: [detectedAuth ? `Auth framework: ${detectedAuth.name}` : 'Auth framework detected'],
    };
  }
}

// ---------------------------------------------------------------------------
// Rules — Tasks
// ---------------------------------------------------------------------------

class MissingNpmScriptsRule implements GapRule {
  id = 'missing-npm-scripts';

  analyze(ctx: GapContext): EnhanceSuggestion | null {
    const packageJsonContent = ctx.fileIndex.read('package.json');
    if (!packageJsonContent) return null;

    let scripts: Record<string, string>;
    try {
      const pkg = JSON.parse(packageJsonContent) as { scripts?: Record<string, string> };
      if (!pkg.scripts || Object.keys(pkg.scripts).length === 0) return null;
      scripts = pkg.scripts;
    } catch {
      return null;
    }

    const contentLower = ctx.sectionContent.toLowerCase();
    const undocumented = Object.keys(scripts).filter(
      (name) => !contentLower.includes(name.toLowerCase()),
    );

    if (undocumented.length <= 3) return null;

    const targetSection = findSectionTitle(ctx, 'common-tasks');

    let draftContent = 'The following npm scripts are not documented:\n\n';
    for (const name of undocumented) {
      draftContent += `- \`npm run ${name}\` — ${scripts[name]}\n`;
    }

    return {
      id: this.id,
      category: 'tasks',
      priority: 'low',
      title: 'Document undocumented npm scripts',
      description:
        `${undocumented.length} npm scripts exist in package.json but are not mentioned in CLAUDE.md. ` +
        'Claude Code needs to know which scripts are available.',
      pointsGain: 3,
      draftContent,
      targetSection,
      evidence: ['package.json'],
    };
  }
}

// ---------------------------------------------------------------------------
// GapAnalyzer — main export
// ---------------------------------------------------------------------------

export class GapAnalyzer {
  private readonly rules: GapRule[] = [
    // Missing sections (high priority)
    new MissingEnvironmentVarsRule(),
    new MissingRouteStructureRule(),
    new MissingSecurityPolicyRule(),
    new MissingArchitectureRule(),
    new MissingTestingRule(),
    new MissingCommonTasksRule(),
    new MissingGotchasRule(),
    new MissingTechStackRule(),
    new MissingConventionsRule(),
    // Incomplete sections (medium priority)
    new IncompleteFrameworksRule(),
    new IncompleteTestRunnersRule(),
    new IncompleteLinterRule(),
    // Stale information (low priority)
    new StaleFrameworkVersionRule(),
    new StalePackageManagerRule(),
    // Security-specific
    new MissingSupabaseRlsRule(),
    new MissingAuthPolicyRule(),
    // Tasks
    new MissingNpmScriptsRule(),
  ];

  /**
   * Run all gap rules against the provided context and return a sorted
   * list of suggestions. Results are ordered by priority (high first)
   * then by pointsGain descending within the same priority tier.
   */
  analyze(ctx: GapContext): EnhanceSuggestion[] {
    const suggestions: EnhanceSuggestion[] = [];

    for (const rule of this.rules) {
      const result = rule.analyze(ctx);
      if (result !== null) {
        suggestions.push(result);
      }
    }

    suggestions.sort((a, b) => {
      const priorityDiff = priorityOrder(a.priority) - priorityOrder(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return b.pointsGain - a.pointsGain;
    });

    return suggestions;
  }
}
