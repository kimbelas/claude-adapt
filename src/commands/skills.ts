/**
 * CLI handler for the `skills` command.
 *
 * Subcommands: add, remove, list, search, info, init, validate
 */

import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

import { SkillInstaller } from '../skills/installer.js';
import { SkillRegistry } from '../skills/registry.js';
import { SkillValidator } from '../skills/validator.js';
import { readLockfile } from '../skills/lockfile.js';
import { validateManifest, asManifest } from '../skills/manifest-schema.js';
import { scaffold } from '../skills/scaffolder.js';

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerSkillsCommand(program: Command): void {
  const skills = program
    .command('skills')
    .description('Browse, install, and manage community skill packs');

  // -- add ----------------------------------------------------------------
  skills
    .command('add <name-or-path>')
    .description('Install a skill from a local directory or npm package')
    .option('--dry-run', 'Preview changes without writing', false)
    .option('--force', 'Skip compatibility checks', false)
    .action(async (nameOrPath: string, options: { dryRun: boolean; force: boolean }) => {
      const rootPath = resolve(process.cwd());
      // If it looks like a local path (starts with . or / or is absolute), resolve it.
      // Otherwise, pass it as-is so the installer treats it as an npm package name.
      const skillPathOrPackage = /^[./]/.test(nameOrPath) || /^[A-Za-z]:/.test(nameOrPath) || nameOrPath.includes('\\')
        ? resolve(nameOrPath)
        : nameOrPath;
      const spinner = ora('Installing skill...').start();

      try {
        const installer = new SkillInstaller();
        const result = await installer.install(skillPathOrPackage, rootPath, {
          dryRun: options.dryRun,
          force: options.force,
        });

        spinner.succeed(
          `Installed skill ${chalk.bold(result.manifest.displayName)} v${result.manifest.version}`,
        );

        if (result.operations.length > 0) {
          console.log(chalk.dim(`  ${result.operations.length} operation(s) performed`));
        }

        if (result.conflicts.length > 0) {
          console.log(chalk.yellow(`  ${result.conflicts.length} conflict(s) detected:`));
          for (const conflict of result.conflicts) {
            console.log(chalk.yellow(`    - ${conflict.message}`));
          }
        }

        if (result.validationWarnings.length > 0) {
          console.log(chalk.dim('  Warnings:'));
          for (const warning of result.validationWarnings) {
            console.log(chalk.dim(`    - ${warning}`));
          }
        }

        if (options.dryRun) {
          console.log(chalk.dim('  (dry run — no changes written)'));
        }
      } catch (error) {
        spinner.fail('Installation failed');
        console.error(
          chalk.red(error instanceof Error ? error.message : String(error)),
        );
        process.exit(1);
      }
    });

  // -- remove -------------------------------------------------------------
  skills
    .command('remove <name>')
    .description('Uninstall a skill (clean removal via transaction log)')
    .action(async (name: string) => {
      const rootPath = resolve(process.cwd());
      const spinner = ora(`Removing skill "${name}"...`).start();

      try {
        const installer = new SkillInstaller();
        const result = await installer.remove(name, rootPath);

        if (result.success) {
          spinner.succeed(`Removed skill ${chalk.bold(name)}`);
          if (result.removedFiles.length > 0) {
            console.log(chalk.dim(`  Removed ${result.removedFiles.length} file(s)`));
          }
        } else {
          spinner.fail(`Could not remove skill "${name}"`);
        }
      } catch (error) {
        spinner.fail('Removal failed');
        console.error(
          chalk.red(error instanceof Error ? error.message : String(error)),
        );
        process.exit(1);
      }
    });

  // -- list ---------------------------------------------------------------
  skills
    .command('list')
    .description('Show installed skills')
    .action(async () => {
      const rootPath = resolve(process.cwd());

      try {
        const lock = await readLockfile(rootPath);
        const entries = Object.entries(lock.skills);

        if (entries.length === 0) {
          console.log(chalk.dim('No skills installed.'));
          return;
        }

        console.log(chalk.bold('Installed skills:\n'));
        for (const [name, info] of entries) {
          console.log(
            `  ${chalk.green(name)} ${chalk.dim(`v${info.version}`)}`,
          );
          console.log(
            chalk.dim(`    Installed: ${info.installedAt}`),
          );
          if (info.provides.length > 0) {
            console.log(
              chalk.dim(`    Provides: ${info.provides.join(', ')}`),
            );
          }
        }
      } catch (error) {
        console.error(
          chalk.red(error instanceof Error ? error.message : String(error)),
        );
        process.exit(1);
      }
    });

  // -- search -------------------------------------------------------------
  skills
    .command('search <query>')
    .description('Search for skills')
    .action(async (query: string) => {
      const spinner = ora('Searching...').start();

      try {
        const registry = new SkillRegistry();
        const result = await registry.search(query);

        spinner.stop();

        if (result.skills.length === 0) {
          console.log(chalk.dim(`No skills found matching "${query}".`));
          return;
        }

        console.log(chalk.bold(`Found ${result.total} skill(s):\n`));
        for (const skill of result.skills) {
          const verified = skill.verified ? chalk.green(' [verified]') : '';
          console.log(`  ${chalk.bold(skill.name)}${verified}`);
          console.log(`    ${skill.description}`);
          console.log(chalk.dim(`    Tags: ${skill.tags.join(', ')}`));
          console.log('');
        }
      } catch (error) {
        spinner.fail('Search failed');
        console.error(
          chalk.red(error instanceof Error ? error.message : String(error)),
        );
        process.exit(1);
      }
    });

  // -- info ---------------------------------------------------------------
  skills
    .command('info <name>')
    .description('Show skill details and compatibility')
    .action(async (name: string) => {
      try {
        // Try registry first
        const registry = new SkillRegistry();
        const entry = await registry.info(name);

        if (entry) {
          console.log(chalk.bold(entry.displayName));
          console.log(chalk.dim(`  Package: ${entry.name}`));
          console.log(`  ${entry.description}`);
          console.log(chalk.dim(`  Tags: ${entry.tags.join(', ')}`));
          console.log(
            chalk.dim(`  Verified: ${entry.verified ? 'Yes' : 'No'}`),
          );
          return;
        }

        // Try local path
        const manifestPath = resolve(name, 'claude-skill.json');
        try {
          const raw = await readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(raw);
          console.log(chalk.bold(manifest.displayName ?? manifest.name));
          console.log(`  Version: ${manifest.version}`);
          console.log(`  ${manifest.description}`);
          if (manifest.author) console.log(`  Author: ${manifest.author}`);
          if (manifest.tags?.length) {
            console.log(chalk.dim(`  Tags: ${manifest.tags.join(', ')}`));
          }
        } catch {
          console.log(chalk.dim(`No skill found with name "${name}".`));
        }
      } catch (error) {
        console.error(
          chalk.red(error instanceof Error ? error.message : String(error)),
        );
        process.exit(1);
      }
    });

  // -- init (scaffold) ----------------------------------------------------
  skills
    .command('init')
    .description('Scaffold a new skill from template')
    .option('--template <type>', 'Template type: minimal, full, analyzer-only', 'minimal')
    .option('--language <lang>', 'Pre-fill for language')
    .option('--framework <fw>', 'Pre-fill for framework')
    .argument('[name]', 'Skill name', 'my-skill')
    .action(
      async (
        name: string,
        options: { template: string; language?: string; framework?: string },
      ) => {
        const outputDir = resolve(process.cwd());
        const spinner = ora('Scaffolding skill...').start();

        try {
          const result = await scaffold({
            name,
            outputDir,
            template: options.template as 'minimal' | 'full' | 'analyzer-only',
            language: options.language,
            framework: options.framework,
          });

          spinner.succeed(`Scaffolded skill at ${chalk.bold(result.skillDir)}`);
          console.log(chalk.dim(`  Created ${result.createdFiles.length} file(s):`));
          for (const file of result.createdFiles) {
            console.log(chalk.dim(`    - ${file}`));
          }
        } catch (error) {
          spinner.fail('Scaffolding failed');
          console.error(
            chalk.red(error instanceof Error ? error.message : String(error)),
          );
          process.exit(1);
        }
      },
    );

  // -- validate -----------------------------------------------------------
  skills
    .command('validate [path]')
    .description('Validate a skill manifest')
    .action(async (path?: string) => {
      const skillPath = resolve(path ?? process.cwd());
      const manifestPath = resolve(skillPath, 'claude-skill.json');

      try {
        const raw = await readFile(manifestPath, 'utf-8');
        const data = JSON.parse(raw);

        // Schema validation
        const schemaResult = validateManifest(data);

        if (!schemaResult.valid) {
          console.log(chalk.red('Schema validation failed:'));
          for (const error of schemaResult.errors) {
            console.log(chalk.red(`  - ${error}`));
          }
          process.exit(1);
        }

        const manifest = asManifest(data);

        // Full validation
        const validator = new SkillValidator();
        const result = await validator.validate(manifest, skillPath);

        if (result.valid) {
          console.log(chalk.green('Skill manifest is valid.'));
        } else {
          console.log(chalk.red('Validation failed:'));
          for (const error of result.errors) {
            console.log(chalk.red(`  - ${error}`));
          }
        }

        if (result.warnings.length > 0) {
          console.log(chalk.yellow('Warnings:'));
          for (const warning of result.warnings) {
            console.log(chalk.yellow(`  - ${warning}`));
          }
        }

        if (!result.valid) {
          process.exit(1);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          console.error(
            chalk.red(`No claude-skill.json found at "${manifestPath}"`),
          );
        } else {
          console.error(
            chalk.red(error instanceof Error ? error.message : String(error)),
          );
        }
        process.exit(1);
      }
    });
}
