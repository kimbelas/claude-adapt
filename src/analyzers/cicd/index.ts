import { BaseAnalyzer, type SignalDefinition } from '../_base.js';
import { AnalyzerCategory, type Signal, type Evidence } from '../../types.js';
import type { ScanContext } from '../../core/context/scan-context.js';

export class CiCdAnalyzer extends BaseAnalyzer {
  readonly category = AnalyzerCategory.cicd;

  readonly signals: SignalDefinition[] = [
    {
      id: 'cicd.pipeline',
      name: 'CI Pipeline Detected',
      unit: 'boolean',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'A CI pipeline validates Claude-generated code automatically, catching ' +
        'regressions before they land and giving Claude feedback on build failures.',
    },
    {
      id: 'cicd.scripts',
      name: 'Build/Deploy Scripts',
      unit: 'completeness',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'Well-defined build and test scripts let Claude understand how to verify ' +
        'its changes, enabling it to suggest the correct commands for testing.',
    },
  ];

  protected async evaluateSignal(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    switch (signal.id) {
      case 'cicd.pipeline':
        return this.evaluatePipeline(signal, context);
      case 'cicd.scripts':
        return this.evaluateScripts(signal, context);
      default:
        return this.createSignal(signal, 0, 0);
    }
  }

  private evaluatePipeline(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    const ciTools = context.profile.tooling.ci;

    if (ciTools.length > 0) {
      for (const ci of ciTools) {
        evidence.push({
          file: '',
          snippet: `CI system detected: ${ci}`,
        });
      }
      return this.createSignal(signal, 1, 1.0, evidence);
    }

    evidence.push({
      file: '',
      suggestion: 'Add a CI configuration (e.g., .github/workflows/, .gitlab-ci.yml, ' +
        'Jenkinsfile) to automatically validate code changes.',
    });
    return this.createSignal(signal, 0, 1.0, evidence);
  }

  private evaluateScripts(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    let hasBuild = false;
    let hasTest = false;
    let hasLint = false;

    // Check package.json scripts
    const packageJson = context.fileIndex.read('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson) as Record<string, unknown>;
        const scripts = pkg.scripts as Record<string, string> | undefined;
        if (scripts) {
          const scriptNames = Object.keys(scripts);
          if (scriptNames.some(s => /^(build|compile|bundle)$/i.test(s))) {
            hasBuild = true;
            evidence.push({
              file: 'package.json',
              snippet: `Build script found: ${scriptNames.find(s => /^(build|compile|bundle)$/i.test(s))}`,
            });
          }
          if (scriptNames.some(s => /^(test|test:unit|test:e2e|test:integration)$/i.test(s))) {
            hasTest = true;
            evidence.push({
              file: 'package.json',
              snippet: `Test script found: ${scriptNames.find(s => /^test/i.test(s))}`,
            });
          }
          if (scriptNames.some(s => /^(lint|eslint|check)$/i.test(s))) {
            hasLint = true;
            evidence.push({
              file: 'package.json',
              snippet: `Lint script found: ${scriptNames.find(s => /^(lint|eslint|check)$/i.test(s))}`,
            });
          }
        }
      } catch {
        // Malformed JSON, skip
      }
    }

    // Check Makefile targets
    const makefile = context.fileIndex.read('Makefile') ?? context.fileIndex.read('makefile');
    if (makefile) {
      const targets = makefile.match(/^([a-zA-Z_][\w-]*):/gm)?.map(t => t.replace(':', '')) ?? [];
      if (targets.some(t => /^(build|compile|all)$/i.test(t))) {
        if (!hasBuild) {
          hasBuild = true;
          evidence.push({
            file: 'Makefile',
            snippet: `Build target found in Makefile`,
          });
        }
      }
      if (targets.some(t => /^(test|check)$/i.test(t))) {
        if (!hasTest) {
          hasTest = true;
          evidence.push({
            file: 'Makefile',
            snippet: `Test target found in Makefile`,
          });
        }
      }
      if (targets.some(t => /^(lint|format)$/i.test(t))) {
        if (!hasLint) {
          hasLint = true;
          evidence.push({
            file: 'Makefile',
            snippet: `Lint target found in Makefile`,
          });
        }
      }
    }

    const categories = [hasBuild, hasTest, hasLint].filter(Boolean).length;
    let value: number;

    if (categories === 0) {
      value = 0;
      evidence.push({
        file: '',
        suggestion: 'Add build, test, and lint scripts to package.json or a Makefile ' +
          'so Claude can verify its changes.',
      });
    } else if (categories === 1) {
      value = 0.5;
    } else {
      // 2 or more categories = complete
      value = 1.0;
    }

    return this.createSignal(signal, value, 0.85, evidence);
  }
}
