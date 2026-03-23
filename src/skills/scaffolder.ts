/**
 * Skill scaffolder.
 *
 * Generates the directory structure and manifest template for a new
 * skill, lowering the friction for community contributors.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScaffoldOptions {
  /** Name for the new skill (e.g. "my-skill"). */
  name: string;
  /** Target directory to create the skill in. */
  outputDir: string;
  /** Scaffold template to use. */
  template?: 'minimal' | 'full' | 'analyzer-only';
  /** Pre-fill language for activation conditions. */
  language?: string;
  /** Pre-fill framework for activation conditions. */
  framework?: string;
}

export interface ScaffoldResult {
  /** Root directory of the scaffolded skill. */
  skillDir: string;
  /** List of files that were created. */
  createdFiles: string[];
}

// ---------------------------------------------------------------------------
// Scaffolder
// ---------------------------------------------------------------------------

export async function scaffold(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const {
    name,
    outputDir,
    template = 'minimal',
    language,
    framework,
  } = options;

  const packageName = name.startsWith('claude-skill-')
    ? name
    : `claude-skill-${name}`;

  const displayName = name
    .replace(/^claude-skill-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  const skillDir = join(outputDir, packageName);
  const createdFiles: string[] = [];

  // Create directories
  await mkdir(join(skillDir, 'sections'), { recursive: true });

  if (template === 'full' || template === 'analyzer-only') {
    await mkdir(join(skillDir, 'commands'), { recursive: true });
    await mkdir(join(skillDir, 'hooks'), { recursive: true });
    await mkdir(join(skillDir, 'analyzers'), { recursive: true });
  }

  // Generate manifest
  const manifest = generateManifest(packageName, displayName, template, language, framework);
  const manifestPath = join(skillDir, 'claude-skill.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  createdFiles.push(manifestPath);

  // Generate example section
  const sectionContent = generateExampleSection(displayName);
  const sectionPath = join(skillDir, 'sections', 'conventions.md');
  await writeFile(sectionPath, sectionContent, 'utf-8');
  createdFiles.push(sectionPath);

  // Generate package.json
  const packageJson = generatePackageJson(packageName, displayName);
  const packageJsonPath = join(skillDir, 'package.json');
  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
  createdFiles.push(packageJsonPath);

  // Full template extras
  if (template === 'full') {
    const commandPath = join(skillDir, 'commands', 'example.md');
    await writeFile(commandPath, generateExampleCommand(displayName), 'utf-8');
    createdFiles.push(commandPath);

    const hookPath = join(skillDir, 'hooks', 'pre-commit.sh');
    await writeFile(hookPath, generateExampleHook(displayName), 'utf-8');
    createdFiles.push(hookPath);
  }

  // Analyzer-only template
  if (template === 'analyzer-only') {
    const analyzerPath = join(skillDir, 'analyzers', 'example.js');
    await writeFile(analyzerPath, generateExampleAnalyzer(displayName), 'utf-8');
    createdFiles.push(analyzerPath);
  }

  return { skillDir, createdFiles };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

function generateManifest(
  packageName: string,
  displayName: string,
  template: string,
  language?: string,
  framework?: string,
): Record<string, unknown> {
  const manifest: Record<string, unknown> = {
    name: packageName,
    displayName,
    version: '1.0.0',
    description: `Claude Code skill pack for ${displayName}`,
    author: '',
    license: 'MIT',
    claudeAdaptVersion: '^0.1.0',
    provides: {
      claudeMd: {
        sections: [
          {
            id: `${packageName.replace(/^claude-skill-/, '')}-conventions`,
            title: `${displayName} Conventions`,
            content: 'sections/conventions.md',
            placement: { position: 'bottom' },
          },
        ],
        priority: 50,
      },
    },
    tags: [],
  };

  // Add activation conditions
  const conditions: { type: string; value: string }[] = [];
  if (language) {
    conditions.push({ type: 'language', value: language });
    (manifest['tags'] as string[]).push(language);
  }
  if (framework) {
    conditions.push({ type: 'framework', value: framework });
    (manifest['tags'] as string[]).push(framework);
  }

  if (conditions.length > 0) {
    manifest['autoActivate'] = { when: conditions };
    manifest['requires'] = {
      ...(language ? { languages: [language] } : {}),
      ...(framework ? { frameworks: [framework] } : {}),
    };
  }

  // Full template: add commands and hooks
  if (template === 'full') {
    (manifest['provides'] as Record<string, unknown>)['commands'] = [
      {
        name: '/example',
        file: 'commands/example.md',
        description: `Example ${displayName} command`,
      },
    ];
    (manifest['provides'] as Record<string, unknown>)['hooks'] = [
      {
        event: 'pre-commit',
        file: 'hooks/pre-commit.sh',
        priority: 50,
        merge: 'append',
      },
    ];
  }

  // Analyzer-only template
  if (template === 'analyzer-only') {
    (manifest['provides'] as Record<string, unknown>)['analyzers'] = [
      {
        category: 'conventions',
        signals: [{ id: `${packageName}.example`, file: 'analyzers/example.js' }],
      },
    ];
  }

  return manifest;
}

function generatePackageJson(
  packageName: string,
  displayName: string,
): Record<string, unknown> {
  return {
    name: packageName,
    version: '1.0.0',
    description: `Claude Code skill pack for ${displayName}`,
    keywords: ['claude-skill', 'claude-code', 'claude-adapt'],
    license: 'MIT',
    files: ['claude-skill.json', 'sections/', 'commands/', 'hooks/', 'analyzers/'],
  };
}

function generateExampleSection(displayName: string): string {
  return `## ${displayName} Conventions

<!-- Add your ${displayName.toLowerCase()} conventions and best practices here -->

- Follow project-specific patterns and conventions
- Keep code consistent with the existing codebase
- Write clear, descriptive names for variables and functions
`;
}

function generateExampleCommand(displayName: string): string {
  return `# Example ${displayName} Command

When the user asks to run this command, follow these steps:

1. Review the current state of the relevant files
2. Apply the ${displayName.toLowerCase()} conventions from the project
3. Provide a summary of what was done
`;
}

function generateExampleHook(displayName: string): string {
  return `#!/bin/bash
# ${displayName} pre-commit hook

echo "Running ${displayName.toLowerCase()} checks..."

# Add your pre-commit checks here
`;
}

function generateExampleAnalyzer(displayName: string): string {
  return `// ${displayName} analyzer
// This module exports a signal analyzer for the claude-adapt scoring pipeline.

export default {
  id: '${displayName.toLowerCase().replace(/\s+/g, '.')}.example',
  name: '${displayName} Example Signal',
  analyze(context) {
    // Implement your analysis logic here
    return {
      value: 0,
      score: 0,
      confidence: 0,
      evidence: [],
    };
  },
};
`;
}
