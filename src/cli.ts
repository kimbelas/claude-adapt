#!/usr/bin/env node

/**
 * CLI entry point for claude-adapt.
 *
 * Registers all subcommands (score, init, skills, sync) and
 * delegates to Commander.js for argument parsing and dispatch.
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';

import { registerScoreCommand } from './commands/score.js';
import { registerInitCommand } from './commands/init.js';
import { registerSkillsCommand } from './commands/skills.js';
import { registerSyncCommand } from './commands/sync.js';
import { registerEnhanceCommand } from './commands/enhance.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('claude-adapt')
  .description(
    'Make any codebase Claude Code-ready. Score, configure, extend, and evolve your Claude Code setup.',
  )
  .version(version);

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

registerScoreCommand(program);
registerInitCommand(program);
registerSkillsCommand(program);
registerSyncCommand(program);
registerEnhanceCommand(program);

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

program.parse(process.argv);
