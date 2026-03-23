import { BaseAnalyzer, type SignalDefinition } from '../_base.js';
import { AnalyzerCategory, type Signal, type Evidence } from '../../types.js';
import type { ScanContext } from '../../core/context/scan-context.js';

export class TestCoverageAnalyzer extends BaseAnalyzer {
  readonly category = AnalyzerCategory.testCoverage;

  readonly signals: SignalDefinition[] = [
    {
      id: 'test.ratio',
      name: 'Test-to-Source Ratio',
      unit: 'ratio',
      threshold: { poor: 0.1, fair: 0.3, good: 0.5 },
      claudeImpact:
        'A healthy test ratio tells Claude that tests are expected for new code. ' +
        'It also gives Claude examples to follow when writing new tests.',
    },
    {
      id: 'test.runner',
      name: 'Test Runner Configured',
      unit: 'boolean',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'A configured test runner lets Claude know which framework to use for tests ' +
        'and how to run them, avoiding incompatible test syntax.',
    },
    {
      id: 'test.scripts',
      name: 'Test Scripts',
      unit: 'completeness',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'Test and coverage scripts give Claude a clear way to verify its changes ' +
        'and check coverage thresholds.',
    },
    {
      id: 'test.coverage.config',
      name: 'Coverage Configuration',
      unit: 'boolean',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'Coverage configuration indicates the project measures test coverage, ' +
        'encouraging Claude to write tests that meaningfully exercise code paths.',
    },
    {
      id: 'test.naming',
      name: 'Test File Naming Consistency',
      unit: 'ratio',
      threshold: { poor: 0.5, fair: 0.75, good: 0.9 },
      claudeImpact:
        'Consistent test naming helps Claude generate test files with the correct ' +
        'naming pattern (e.g., *.test.ts vs *.spec.ts).',
    },
  ];

  protected async evaluateSignal(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    switch (signal.id) {
      case 'test.ratio':
        return this.evaluateTestRatio(signal, context);
      case 'test.runner':
        return this.evaluateTestRunner(signal, context);
      case 'test.scripts':
        return this.evaluateTestScripts(signal, context);
      case 'test.coverage.config':
        return this.evaluateCoverageConfig(signal, context);
      case 'test.naming':
        return this.evaluateTestNaming(signal, context);
      default:
        return this.createSignal(signal, 0, 0);
    }
  }

  private evaluateTestRatio(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    const sourceFiles = context.fileIndex.getSourceFiles();
    const testFiles = context.fileIndex.getTestFiles();

    const sourceCount = sourceFiles.length;
    const testCount = testFiles.length;

    if (sourceCount === 0) {
      evidence.push({ file: '', snippet: 'No source files found' });
      return this.createSignal(signal, 0, 0.9, evidence);
    }

    const ratio = testCount / sourceCount;

    evidence.push({
      file: '',
      snippet: `${testCount} test files / ${sourceCount} source files = ${(ratio * 100).toFixed(1)}%`,
    });

    if (ratio < 0.2) {
      evidence.push({
        file: '',
        suggestion: 'Increase test coverage by adding tests for critical modules. ' +
          'Aim for at least 1 test file per 2 source files.',
      });
    }

    return this.createSignal(signal, ratio, 0.9, evidence);
  }

  private evaluateTestRunner(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    const testRunners = context.profile.tooling.testRunners;

    if (testRunners.length > 0) {
      for (const runner of testRunners) {
        evidence.push({
          file: '',
          snippet: `Test runner detected: ${runner}`,
        });
      }
      return this.createSignal(signal, 1, 1.0, evidence);
    }

    evidence.push({
      file: '',
      suggestion: 'Configure a test runner (e.g., Vitest, Jest, pytest, RSpec) ' +
        'so Claude knows how to write and run tests for your project.',
    });
    return this.createSignal(signal, 0, 1.0, evidence);
  }

  private evaluateTestScripts(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    let hasTest = false;
    let hasCoverage = false;

    // Check package.json
    const packageJson = context.fileIndex.read('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson) as Record<string, unknown>;
        const scripts = pkg.scripts as Record<string, string> | undefined;
        if (scripts) {
          const scriptNames = Object.keys(scripts);
          if (scriptNames.some(s => /^test(:|$)/i.test(s))) {
            hasTest = true;
            evidence.push({
              file: 'package.json',
              snippet: `Test script found: "${scriptNames.find(s => /^test(:|$)/i.test(s))}"`,
            });
          }
          if (scriptNames.some(s => /coverage/i.test(s))) {
            hasCoverage = true;
            evidence.push({
              file: 'package.json',
              snippet: `Coverage script found: "${scriptNames.find(s => /coverage/i.test(s))}"`,
            });
          }
          // Also check if "test" script itself includes --coverage
          const testScript = scripts.test ?? scripts['test:unit'];
          if (testScript && /--coverage/.test(testScript)) {
            hasCoverage = true;
            evidence.push({
              file: 'package.json',
              snippet: 'Test script includes --coverage flag',
            });
          }
        }
      } catch {
        // Malformed JSON, skip
      }
    }

    // Check Makefile
    const makefile = context.fileIndex.read('Makefile') ?? context.fileIndex.read('makefile');
    if (makefile) {
      const targets = makefile.match(/^([a-zA-Z_][\w-]*):/gm)?.map(t => t.replace(':', '')) ?? [];
      if (!hasTest && targets.some(t => /^test$/i.test(t))) {
        hasTest = true;
        evidence.push({
          file: 'Makefile',
          snippet: 'Test target found in Makefile',
        });
      }
      if (!hasCoverage && targets.some(t => /coverage/i.test(t))) {
        hasCoverage = true;
        evidence.push({
          file: 'Makefile',
          snippet: 'Coverage target found in Makefile',
        });
      }
    }

    let value: number;
    if (!hasTest && !hasCoverage) {
      value = 0;
      evidence.push({
        file: '',
        suggestion: 'Add "test" and "test:coverage" scripts to package.json ' +
          'so Claude can verify its changes and check coverage.',
      });
    } else if (hasTest && hasCoverage) {
      value = 1.0;
    } else {
      value = 0.5;
    }

    return this.createSignal(signal, value, 0.85, evidence);
  }

  private evaluateCoverageConfig(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];

    // Check for dedicated coverage config files
    const coverageConfigs = [
      '.nycrc',
      '.nycrc.json',
      '.nycrc.yml',
      '.nycrc.yaml',
      '.coveragerc',
      '.c8rc',
      '.c8rc.json',
      'coverage.config.js',
    ];

    for (const configFile of coverageConfigs) {
      if (context.fileIndex.exists(configFile)) {
        evidence.push({
          file: configFile,
          snippet: `Coverage config found: ${configFile}`,
        });
        return this.createSignal(signal, 1, 0.9, evidence);
      }
    }

    // Check Jest config for coverage settings
    const jestConfigs = [
      'jest.config.js',
      'jest.config.ts',
      'jest.config.mjs',
      'jest.config.cjs',
      'jest.config.json',
    ];

    for (const configPath of jestConfigs) {
      const content = context.fileIndex.read(configPath);
      if (!content) continue;

      if (
        content.includes('coverageThreshold') ||
        content.includes('collectCoverage') ||
        content.includes('coverageDirectory')
      ) {
        evidence.push({
          file: configPath,
          snippet: 'Coverage configuration found in Jest config',
        });
        return this.createSignal(signal, 1, 0.9, evidence);
      }
    }

    // Check Vitest config for coverage settings
    const vitestConfigs = [
      'vitest.config.ts',
      'vitest.config.js',
      'vitest.config.mts',
      'vitest.config.mjs',
    ];

    for (const configPath of vitestConfigs) {
      const content = context.fileIndex.read(configPath);
      if (!content) continue;

      if (content.includes('coverage')) {
        evidence.push({
          file: configPath,
          snippet: 'Coverage configuration found in Vitest config',
        });
        return this.createSignal(signal, 1, 0.9, evidence);
      }
    }

    // Check package.json for jest/nyc coverage config
    const packageJson = context.fileIndex.read('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson) as Record<string, unknown>;
        const jest = pkg.jest as Record<string, unknown> | undefined;
        const nyc = pkg.nyc as Record<string, unknown> | undefined;
        const c8 = pkg.c8 as Record<string, unknown> | undefined;

        if (jest && ('coverageThreshold' in jest || 'collectCoverage' in jest)) {
          evidence.push({
            file: 'package.json',
            snippet: 'Coverage config found under "jest" key in package.json',
          });
          return this.createSignal(signal, 1, 0.9, evidence);
        }
        if (nyc) {
          evidence.push({
            file: 'package.json',
            snippet: 'Coverage config found under "nyc" key in package.json',
          });
          return this.createSignal(signal, 1, 0.9, evidence);
        }
        if (c8) {
          evidence.push({
            file: 'package.json',
            snippet: 'Coverage config found under "c8" key in package.json',
          });
          return this.createSignal(signal, 1, 0.9, evidence);
        }
      } catch {
        // Malformed JSON
      }
    }

    // Check for Python coverage
    const pythonCoverageConfigs = ['setup.cfg', 'pyproject.toml', 'tox.ini'];
    for (const configPath of pythonCoverageConfigs) {
      const content = context.fileIndex.read(configPath);
      if (!content) continue;

      if (
        content.includes('[tool:pytest]') ||
        content.includes('[tool.coverage') ||
        content.includes('[coverage:')
      ) {
        evidence.push({
          file: configPath,
          snippet: `Coverage config found in ${configPath}`,
        });
        return this.createSignal(signal, 1, 0.9, evidence);
      }
    }

    evidence.push({
      file: '',
      suggestion: 'Add coverage configuration to your test runner to track how much ' +
        'of the codebase is exercised by tests.',
    });
    return this.createSignal(signal, 0, 0.9, evidence);
  }

  private evaluateTestNaming(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    const testFiles = context.fileIndex.getTestFiles();

    if (testFiles.length === 0) {
      evidence.push({ file: '', snippet: 'No test files found' });
      return this.createSignal(signal, 0, 0.8, evidence);
    }

    const patterns: Record<string, number> = {
      'test-dot': 0,   // *.test.* (e.g., foo.test.ts)
      'spec-dot': 0,   // *.spec.* (e.g., foo.spec.ts)
      'test-prefix': 0, // test_* (e.g., test_foo.py)
      'test-dir': 0,   // Files under test(s)/ or __tests__/ without test/spec in name
      other: 0,
    };

    for (const file of testFiles) {
      const name = file.relativePath.toLowerCase();

      if (/\.test\./.test(name)) {
        patterns['test-dot']++;
      } else if (/\.spec\./.test(name)) {
        patterns['spec-dot']++;
      } else if (/(?:^|[/\\])test_/.test(name)) {
        patterns['test-prefix']++;
      } else if (/_test\./.test(name) || /_spec\./.test(name)) {
        // Go-style: foo_test.go
        patterns['test-dot']++;
      } else {
        patterns['test-dir']++;
      }
    }

    // Find dominant pattern
    const sortedPatterns = Object.entries(patterns).sort((a, b) => b[1] - a[1]);
    const dominant = sortedPatterns[0];
    const dominantRatio = testFiles.length > 0 ? dominant[1] / testFiles.length : 0;

    const patternLabel: Record<string, string> = {
      'test-dot': '*.test.*',
      'spec-dot': '*.spec.*',
      'test-prefix': 'test_*',
      'test-dir': 'directory-based',
      other: 'mixed',
    };

    evidence.push({
      file: '',
      snippet: `Dominant pattern: ${patternLabel[dominant[0]] ?? dominant[0]} ` +
        `(${dominant[1]}/${testFiles.length} = ${(dominantRatio * 100).toFixed(0)}%)`,
    });

    if (sortedPatterns.filter(([, count]) => count > 0).length > 1) {
      const breakdown = sortedPatterns
        .filter(([, count]) => count > 0)
        .map(([pattern, count]) => `${patternLabel[pattern] ?? pattern}: ${count}`)
        .join(', ');
      evidence.push({
        file: '',
        snippet: `Pattern breakdown: ${breakdown}`,
      });
    }

    if (dominantRatio < 0.8 && testFiles.length > 3) {
      evidence.push({
        file: '',
        suggestion: `Standardize test naming to "${patternLabel[dominant[0]]}" pattern ` +
          'so Claude creates test files with consistent names.',
      });
    }

    return this.createSignal(signal, dominantRatio, 0.8, evidence);
  }
}
