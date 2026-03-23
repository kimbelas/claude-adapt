import { BaseAnalyzer, type SignalDefinition } from '../_base.js';
import { AnalyzerCategory, type Signal, type Evidence } from '../../types.js';
import type { ScanContext } from '../../core/context/scan-context.js';

const LOCKFILES = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'composer.lock',
  'Gemfile.lock',
  'Pipfile.lock',
];

export class DependenciesAnalyzer extends BaseAnalyzer {
  readonly category = AnalyzerCategory.dependencies;

  readonly signals: SignalDefinition[] = [
    {
      id: 'deps.lockfile',
      name: 'Lockfile Exists',
      unit: 'boolean',
      threshold: { poor: 0, fair: 0.5, good: 1 },
      claudeImpact:
        'A lockfile ensures Claude generates code against the exact dependency versions ' +
        'installed, preventing phantom mismatches and non-reproducible builds.',
    },
    {
      id: 'deps.count',
      name: 'Total Dependency Count',
      unit: 'count',
      threshold: { poor: 200, fair: 150, good: 100 },
      inverted: true,
      claudeImpact:
        'Fewer dependencies mean a smaller API surface for Claude to reason about, ' +
        'reducing the chance of hallucinated imports or version-specific bugs.',
    },
  ];

  protected async evaluateSignal(
    signal: SignalDefinition,
    context: ScanContext,
  ): Promise<Signal> {
    switch (signal.id) {
      case 'deps.lockfile':
        return this.evaluateLockfile(signal, context);
      case 'deps.count':
        return this.evaluateDepsCount(signal, context);
      default:
        return this.createSignal(signal, 0, 0);
    }
  }

  private evaluateLockfile(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    let found = false;

    for (const lockfile of LOCKFILES) {
      if (context.fileIndex.exists(lockfile)) {
        found = true;
        evidence.push({
          file: lockfile,
          snippet: `Lockfile detected: ${lockfile}`,
        });
        break;
      }
    }

    if (!found) {
      evidence.push({
        file: '',
        suggestion: 'Add a lockfile by running your package manager install command ' +
          '(npm install, yarn install, pnpm install, etc.).',
      });
    }

    return this.createSignal(signal, found ? 1 : 0, 1.0, evidence);
  }

  private evaluateDepsCount(
    signal: SignalDefinition,
    context: ScanContext,
  ): Signal {
    const evidence: Evidence[] = [];
    let totalDeps = 0;

    // package.json (Node.js)
    const packageJson = context.fileIndex.read('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson) as Record<string, unknown>;
        const deps = pkg.dependencies as Record<string, string> | undefined;
        const devDeps = pkg.devDependencies as Record<string, string> | undefined;
        const depsCount = deps ? Object.keys(deps).length : 0;
        const devDepsCount = devDeps ? Object.keys(devDeps).length : 0;
        totalDeps += depsCount + devDepsCount;
        evidence.push({
          file: 'package.json',
          snippet: `dependencies: ${depsCount}, devDependencies: ${devDepsCount}`,
        });
      } catch {
        // Malformed JSON, skip
      }
    }

    // composer.json (PHP)
    const composerJson = context.fileIndex.read('composer.json');
    if (composerJson) {
      try {
        const composer = JSON.parse(composerJson) as Record<string, unknown>;
        const require = composer.require as Record<string, string> | undefined;
        const requireDev = composer['require-dev'] as Record<string, string> | undefined;
        const reqCount = require ? Object.keys(require).length : 0;
        const reqDevCount = requireDev ? Object.keys(requireDev).length : 0;
        totalDeps += reqCount + reqDevCount;
        evidence.push({
          file: 'composer.json',
          snippet: `require: ${reqCount}, require-dev: ${reqDevCount}`,
        });
      } catch {
        // Malformed JSON, skip
      }
    }

    // requirements.txt (Python)
    const requirementsTxt = context.fileIndex.read('requirements.txt');
    if (requirementsTxt) {
      const lines = requirementsTxt
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#') && !l.startsWith('-'));
      totalDeps += lines.length;
      evidence.push({
        file: 'requirements.txt',
        snippet: `${lines.length} dependencies listed`,
      });
    }

    if (totalDeps === 0) {
      evidence.push({
        file: '',
        snippet: 'No dependency manifest files found',
      });
    }

    return this.createSignal(signal, totalDeps, 0.9, evidence);
  }
}
