/**
 * Capability-driven commands generator.
 *
 * Produces .claude/commands/*.md files by scanning the project for
 * capabilities (test runners, linters, databases, CLI tools, etc.)
 * and inferring which agent workflows would be useful.
 *
 * This replaces the previous hardcoded approach (6 fixed templates)
 * with a data-driven pipeline:
 *
 *   FileIndex + RepoProfile → Capability Scanner → Agent Inferrer → Command Files
 *
 * To add support for new ecosystems, edit capability-rules.ts.
 * To add new agent types, edit agent-catalog.ts.
 * No changes to this file needed.
 */

import type { GeneratorContext, Generator } from './types.js';
import { scanCapabilities } from './capabilities/capability-scanner.js';
import { inferAgents } from './agents/agent-inferrer.js';

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export const commandsGenerator: Generator<Record<string, string>> = {
  name: 'commands',

  async generate(ctx: GeneratorContext): Promise<Record<string, string>> {
    // Step 1: Scan for capabilities
    const capabilities = scanCapabilities(ctx);

    // Step 2: Infer agents from capabilities
    const commandFiles = inferAgents(capabilities);

    // Step 3: Convert to output format
    const commands: Record<string, string> = {};
    for (const file of commandFiles) {
      commands[file.filename] = file.content;
    }

    return commands;
  },
};
