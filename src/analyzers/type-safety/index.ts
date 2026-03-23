import { BaseAnalyzer, type SignalDefinition } from '../_base.js';
import { AnalyzerCategory, type Signal, type Evidence } from '../../types.js';
import type { ScanContext } from '../../core/context/scan-context.js';

const TYPED_JS_EXTENSIONS = new Set(['.ts', '.tsx']);
const ALL_JS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const PYTHON_EXTENSIONS = new Set(['.py']);

const PYTHON_TYPE_HINT_PATTERNS = [
  /def\s+\w+\s*\([^)]*:\s*\w+/,        // def foo(x: int)
  /\)\s*->\s*\w+/,                        // ) -> str:
  /:\s*(?:int|str|float|bool|list|dict|tuple|set|Optional|Union|Any|None)\b/,
];

const TYPE_ANY_IN_ANNOTATION = /:\s*any\b|<any>|as\s+any\b|\bany\s*[,>)\]|]|Promise<any>|Array<any>/i;

/**
 * TypeSafetyAnalyzer evaluates how well the codebase uses type systems.
 *
 * Signals:
 * - type.coverage:     Ratio of typed files vs total source files
 * - type.strictness:   TypeScript/Python strict mode configuration
 * - type.any.ratio:    Usage density of `any` type (lower is better)
 * - type.definitions:  Ratio of dependencies with type definitions
 */
export class TypeSafetyAnalyzer extends BaseAnalyzer {
  readonly category = AnalyzerCategory.typeSafety;

  readonly signals: SignalDefinition[] = [
    {
      id: 'type.coverage',
      name: 'Type Coverage',
      unit: 'ratio',
      threshold: { poor: 0.2, fair: 0.45, good: 0.7 },
      claudeImpact:
        'Higher type coverage lets Claude infer parameter types, return values, and data shapes without guessing, reducing hallucinated signatures and enabling safer refactors.',
    },
    {
      id: 'type.strictness',
      name: 'Type Strictness',
      unit: 'ratio',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'Strict type-checking means Claude can trust that null/undefined are explicitly handled. Without strict mode, Claude must add defensive checks everywhere.',
    },
    {
      id: 'type.any.ratio',
      name: 'Any Type Usage',
      unit: 'ratio',
      threshold: { poor: 0.1, fair: 0.065, good: 0.03 },
      claudeImpact:
        'Widespread `any` usage erases the type information Claude relies on. Each `any` is a hole where Claude must guess the shape, increasing error risk.',
      inverted: true,
    },
    {
      id: 'type.definitions',
      name: 'Type Definitions Coverage',
      unit: 'ratio',
      threshold: { poor: 0.3, fair: 0.55, good: 0.8 },
      claudeImpact:
        'Missing @types/* packages mean Claude cannot see the API surface of dependencies, leading to incorrect usage patterns and missing method suggestions.',
    },
  ];

  protected async evaluateSignal(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    switch (signal.id) {
      case 'type.coverage':
        return this.evaluateTypeCoverage(signal, context);
      case 'type.strictness':
        return this.evaluateTypeStrictness(signal, context);
      case 'type.any.ratio':
        return this.evaluateAnyRatio(signal, context);
      case 'type.definitions':
        return this.evaluateTypeDefinitions(signal, context);
      default:
        return this.createSignal(signal, 0, 0);
    }
  }

  // ---------------------------------------------------------------------------
  // type.coverage
  // ---------------------------------------------------------------------------

  private async evaluateTypeCoverage(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const { fileIndex } = context;
    const sourceFiles = fileIndex.getSourceFiles();
    const evidence: Evidence[] = [];

    if (sourceFiles.length === 0) {
      return this.createSignal(signal, 0, 0.5, [
        { file: '', suggestion: 'No source files detected in repository.' },
      ]);
    }

    const hasPython = context.profile.languages.some(
      (l) => l.name.toLowerCase() === 'python',
    );
    const hasJsTs = context.profile.languages.some((l) =>
      ['typescript', 'javascript'].includes(l.name.toLowerCase()),
    );

    let typedCount = 0;
    let totalCount = 0;

    // TypeScript / JavaScript coverage
    if (hasJsTs) {
      const jstsFiles = sourceFiles.filter((f) => ALL_JS_EXTENSIONS.has(f.extension));
      totalCount += jstsFiles.length;

      for (const file of jstsFiles) {
        if (TYPED_JS_EXTENSIONS.has(file.extension)) {
          typedCount++;
        }
      }

      const untypedJs = jstsFiles.filter(
        (f) => !TYPED_JS_EXTENSIONS.has(f.extension),
      );
      if (untypedJs.length > 0) {
        const samples = untypedJs.slice(0, 5);
        for (const f of samples) {
          evidence.push({
            file: f.relativePath,
            suggestion: 'Untyped JavaScript file. Consider migrating to TypeScript.',
          });
        }
        if (untypedJs.length > 5) {
          evidence.push({
            file: '',
            suggestion: `...and ${untypedJs.length - 5} more untyped JS files.`,
          });
        }
      }
    }

    // Python type hint coverage (sampling-based)
    if (hasPython) {
      const pyFiles = sourceFiles.filter((f) => PYTHON_EXTENSIONS.has(f.extension));
      totalCount += pyFiles.length;

      for (const file of pyFiles) {
        const content = fileIndex.read(file.relativePath);
        if (!content) continue;

        const hasTypeHints = PYTHON_TYPE_HINT_PATTERNS.some((pat) =>
          pat.test(content),
        );
        if (hasTypeHints) {
          typedCount++;
        } else {
          evidence.push({
            file: file.relativePath,
            suggestion:
              'Python file without type hints. Add type annotations (PEP 484) for better Claude assistance.',
          });
        }
      }

      // Cap evidence to avoid excessive output
      if (evidence.length > 8) {
        const overflow = evidence.length - 5;
        evidence.splice(5, overflow, {
          file: '',
          suggestion: `...and ${overflow} more Python files without type hints.`,
        });
      }
    }

    // If no JS/TS/Python files, check other typed languages
    if (!hasJsTs && !hasPython) {
      const typedExtensions = new Set([
        '.ts', '.tsx', '.java', '.kt', '.cs', '.go', '.rs', '.swift', '.dart', '.scala',
      ]);
      for (const file of sourceFiles) {
        totalCount++;
        if (typedExtensions.has(file.extension)) {
          typedCount++;
        }
      }
    }

    const ratio = totalCount > 0 ? typedCount / totalCount : 0;
    return this.createSignal(signal, ratio, 0.85, evidence);
  }

  // ---------------------------------------------------------------------------
  // type.strictness
  // ---------------------------------------------------------------------------

  private async evaluateTypeStrictness(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const { fileIndex } = context;
    const evidence: Evidence[] = [];
    let strictnessScore = 0;

    // --- TypeScript strict mode ---
    const tsConfigPath = 'tsconfig.json';
    const tsConfigContent = fileIndex.read(tsConfigPath);

    if (tsConfigContent) {
      try {
        const tsConfig = JSON.parse(tsConfigContent) as {
          compilerOptions?: Record<string, unknown>;
        };
        const opts = tsConfig.compilerOptions ?? {};

        if (opts.strict === true) {
          strictnessScore = 1.0;
          evidence.push({
            file: tsConfigPath,
            snippet: '"strict": true',
            suggestion: 'Full TypeScript strict mode is enabled. Excellent.',
          });
        } else {
          // Check individual strict flags
          const strictFlags = [
            'noImplicitAny',
            'strictNullChecks',
            'strictFunctionTypes',
            'strictBindCallApply',
            'strictPropertyInitialization',
            'noImplicitThis',
            'alwaysStrict',
          ] as const;

          const enabledFlags = strictFlags.filter(
            (flag) => opts[flag] === true,
          );

          if (enabledFlags.length > 0) {
            strictnessScore = enabledFlags.length / strictFlags.length;
            evidence.push({
              file: tsConfigPath,
              snippet: `Strict flags enabled: ${enabledFlags.join(', ')}`,
              suggestion: `Partial strict mode (${enabledFlags.length}/${strictFlags.length} flags). Enable "strict": true for full coverage.`,
            });
          } else {
            strictnessScore = 0;
            evidence.push({
              file: tsConfigPath,
              suggestion:
                'No strict TypeScript flags enabled. Add "strict": true to compilerOptions.',
            });
          }
        }

        return this.createSignal(signal, strictnessScore, 0.9, evidence);
      } catch {
        evidence.push({
          file: tsConfigPath,
          suggestion: 'tsconfig.json exists but could not be parsed.',
        });
      }
    }

    // --- Python mypy strict mode ---
    const mypyIniContent = fileIndex.read('mypy.ini');
    const pyprojectContent = fileIndex.read('pyproject.toml');
    const setupCfgContent = fileIndex.read('setup.cfg');

    if (mypyIniContent) {
      strictnessScore = this.evaluateMypyConfig(mypyIniContent, evidence, 'mypy.ini');
    } else if (pyprojectContent) {
      // Check [tool.mypy] section in pyproject.toml
      const mypySection = this.extractTomlSection(pyprojectContent, 'tool.mypy');
      if (mypySection) {
        strictnessScore = this.evaluateMypyConfig(mypySection, evidence, 'pyproject.toml');
      } else {
        evidence.push({
          file: 'pyproject.toml',
          suggestion:
            'No [tool.mypy] section found. Add mypy configuration with strict = true.',
        });
      }
    } else if (setupCfgContent) {
      const mypySection = this.extractIniSection(setupCfgContent, 'mypy');
      if (mypySection) {
        strictnessScore = this.evaluateMypyConfig(mypySection, evidence, 'setup.cfg');
      }
    }

    // No type config found at all
    if (evidence.length === 0) {
      evidence.push({
        file: '',
        suggestion:
          'No type-checking configuration found (tsconfig.json, mypy.ini, pyproject.toml).',
      });
    }

    return this.createSignal(signal, strictnessScore, 0.9, evidence);
  }

  private evaluateMypyConfig(
    content: string,
    evidence: Evidence[],
    file: string,
  ): number {
    const hasStrict = /^\s*strict\s*=\s*(?:true|True)/m.test(content);

    if (hasStrict) {
      evidence.push({
        file,
        snippet: 'strict = true',
        suggestion: 'mypy strict mode is enabled. Excellent.',
      });
      return 1.0;
    }

    // Check individual flags
    const strictFlags = [
      'disallow_untyped_defs',
      'disallow_any_generics',
      'check_untyped_defs',
      'warn_return_any',
      'warn_unused_configs',
      'no_implicit_optional',
      'strict_equality',
    ];

    const enabledFlags = strictFlags.filter((flag) => {
      const pattern = new RegExp(`^\\s*${flag}\\s*=\\s*(?:true|True)`, 'm');
      return pattern.test(content);
    });

    if (enabledFlags.length > 0) {
      const score = enabledFlags.length / strictFlags.length;
      evidence.push({
        file,
        snippet: `mypy flags: ${enabledFlags.join(', ')}`,
        suggestion: `Partial mypy strict mode (${enabledFlags.length}/${strictFlags.length} flags). Set strict = true for full coverage.`,
      });
      return score;
    }

    evidence.push({
      file,
      suggestion: 'mypy config exists but no strict flags are enabled.',
    });
    return 0;
  }

  private extractTomlSection(content: string, section: string): string | null {
    // Simple TOML section extraction via regex (no full parser needed)
    const escapedSection = section.replace(/\./g, '\\.');
    const pattern = new RegExp(
      `^\\[${escapedSection}\\]\\s*$([\\s\\S]*?)(?=^\\[|$)`,
      'm',
    );
    const match = content.match(pattern);
    return match ? match[1] : null;
  }

  private extractIniSection(content: string, section: string): string | null {
    const pattern = new RegExp(
      `^\\[${section}\\]\\s*$([\\s\\S]*?)(?=^\\[|$)`,
      'm',
    );
    const match = content.match(pattern);
    return match ? match[1] : null;
  }

  // ---------------------------------------------------------------------------
  // type.any.ratio
  // ---------------------------------------------------------------------------

  private async evaluateAnyRatio(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const { fileIndex } = context;
    const tsFiles = fileIndex
      .getSourceFiles()
      .filter((f) => TYPED_JS_EXTENSIONS.has(f.extension));
    const evidence: Evidence[] = [];

    if (tsFiles.length === 0) {
      return this.createSignal(signal, 0, 0.5, [
        { file: '', suggestion: 'No TypeScript files found to analyze for `any` usage.' },
      ]);
    }

    let totalLines = 0;
    let anyLines = 0;

    for (const file of tsFiles) {
      const content = fileIndex.read(file.relativePath);
      if (!content) continue;

      const lines = content.split('\n');
      totalLines += lines.length;

      let fileAnyCount = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments and imports of @types
        const trimmed = line.trimStart();
        if (
          trimmed.startsWith('//') ||
          trimmed.startsWith('*') ||
          trimmed.startsWith('/*')
        ) {
          continue;
        }

        if (TYPE_ANY_IN_ANNOTATION.test(line)) {
          anyLines++;
          fileAnyCount++;

          // Collect up to 2 evidence items per file, cap total at 10
          if (fileAnyCount <= 2 && evidence.length < 10) {
            evidence.push({
              file: file.relativePath,
              line: i + 1,
              snippet: line.trim().slice(0, 120),
              suggestion: 'Replace `any` with a specific type or `unknown`.',
            });
          }
        }
      }
    }

    const ratio = totalLines > 0 ? anyLines / totalLines : 0;

    if (evidence.length === 0 && anyLines === 0) {
      evidence.push({
        file: '',
        suggestion: 'No `any` type usage detected in TypeScript files. Excellent.',
      });
    }

    return this.createSignal(signal, ratio, 0.85, evidence);
  }

  // ---------------------------------------------------------------------------
  // type.definitions
  // ---------------------------------------------------------------------------

  private async evaluateTypeDefinitions(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    const { fileIndex } = context;
    const evidence: Evidence[] = [];

    const packageJsonContent = fileIndex.read('package.json');
    if (!packageJsonContent) {
      return this.createSignal(signal, 0, 0.3, [
        {
          file: '',
          suggestion: 'No package.json found. Cannot evaluate type definitions coverage.',
        },
      ]);
    }

    let packageJson: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    try {
      packageJson = JSON.parse(packageJsonContent);
    } catch {
      return this.createSignal(signal, 0, 0.3, [
        {
          file: 'package.json',
          suggestion: 'package.json could not be parsed.',
        },
      ]);
    }

    const deps = Object.keys(packageJson.dependencies ?? {});
    const devDeps = new Set(Object.keys(packageJson.devDependencies ?? {}));

    if (deps.length === 0) {
      return this.createSignal(signal, 1, 0.5, [
        {
          file: 'package.json',
          suggestion: 'No production dependencies found.',
        },
      ]);
    }

    // Packages that ship their own types (known built-in types)
    const knownTypedPackages = new Set([
      'typescript', 'zod', 'trpc', '@trpc/server', '@trpc/client',
      'effect', 'fp-ts', 'io-ts', 'prisma', '@prisma/client',
      'drizzle-orm', 'kysely', 'vitest', 'commander', 'chalk',
      'next', 'nuxt', 'svelte', 'solid-js', 'vue', 'vite',
      'esbuild', 'tsup', 'tsx', 'type-fest', 'ts-pattern',
    ]);

    let coveredCount = 0;
    const missingTypes: string[] = [];

    for (const dep of deps) {
      // Skip @types packages themselves
      if (dep.startsWith('@types/')) {
        continue;
      }

      const typesPackage = dep.startsWith('@')
        ? `@types/${dep.replace('@', '').replace('/', '__')}`
        : `@types/${dep}`;

      const hasTypes =
        knownTypedPackages.has(dep) ||
        devDeps.has(typesPackage) ||
        dep.startsWith('typescript') ||
        // Scoped packages from the same org often have bundled types
        (dep.startsWith('@') && fileIndex.exists(`node_modules/${dep}/index.d.ts`));

      if (hasTypes) {
        coveredCount++;
      } else {
        missingTypes.push(dep);
      }
    }

    const nonTypesDeps = deps.filter((d) => !d.startsWith('@types/'));
    const ratio = nonTypesDeps.length > 0 ? coveredCount / nonTypesDeps.length : 1;

    if (missingTypes.length > 0) {
      const samples = missingTypes.slice(0, 5);
      for (const dep of samples) {
        const typesName = dep.startsWith('@')
          ? `@types/${dep.replace('@', '').replace('/', '__')}`
          : `@types/${dep}`;
        evidence.push({
          file: 'package.json',
          snippet: `"${dep}"`,
          suggestion: `Missing type definitions. Run: npm install -D ${typesName}`,
        });
      }
      if (missingTypes.length > 5) {
        evidence.push({
          file: 'package.json',
          suggestion: `...and ${missingTypes.length - 5} more dependencies without type definitions.`,
        });
      }
    } else {
      evidence.push({
        file: 'package.json',
        suggestion:
          'All dependencies have type definitions. Claude can see the full API surface.',
      });
    }

    return this.createSignal(signal, ratio, 0.8, evidence);
  }
}
