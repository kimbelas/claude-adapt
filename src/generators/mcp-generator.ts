/**
 * MCP (Model Context Protocol) server recommendation generator.
 *
 * Produces an mcp.json file that recommends MCP servers based on
 * detected project infrastructure. Always includes filesystem and
 * git servers; conditionally adds database, Docker, and other servers.
 */

import type { GeneratorContext, Generator } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  note: string;
}

interface McpRecommendation {
  name: string;
  reason: string;
  install: string;
}

interface McpJson {
  mcpServers: Record<string, McpServerConfig>;
  recommended: McpRecommendation[];
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

function detectDatabaseType(ctx: GeneratorContext): 'postgresql' | 'mysql' | 'mongodb' | null {
  // Check docker-compose
  const compose =
    ctx.fileIndex.read('docker-compose.yml') ??
    ctx.fileIndex.read('docker-compose.yaml');

  if (compose) {
    const lower = compose.toLowerCase();
    if (lower.includes('postgres')) return 'postgresql';
    if (lower.includes('mysql') || lower.includes('mariadb')) return 'mysql';
    if (lower.includes('mongo')) return 'mongodb';
  }

  // Check package.json dependencies
  const packageJson = ctx.fileIndex.read('package.json');
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = Object.keys({
        ...(parsed.dependencies ?? {}),
        ...(parsed.devDependencies ?? {}),
      });

      if (allDeps.some((d) => ['pg', '@prisma/client', 'prisma', 'typeorm', 'knex', 'drizzle-orm'].includes(d))) {
        return 'postgresql';
      }
      if (allDeps.some((d) => ['mysql', 'mysql2'].includes(d))) {
        return 'mysql';
      }
      if (allDeps.some((d) => ['mongodb', 'mongoose'].includes(d))) {
        return 'mongodb';
      }
    } catch { /* malformed json */ }
  }

  // Check composer.json (PHP)
  const composerJson = ctx.fileIndex.read('composer.json');
  if (composerJson) {
    try {
      const parsed = JSON.parse(composerJson) as { require?: Record<string, string> };
      const deps = Object.keys(parsed.require ?? {});
      if (deps.some((d) => d.includes('pgsql') || d.includes('postgres'))) return 'postgresql';
      if (deps.some((d) => d.includes('mysql'))) return 'mysql';
      if (deps.some((d) => d.includes('mongo'))) return 'mongodb';
    } catch { /* malformed json */ }
  }

  // Check requirements.txt / pyproject.toml (Python)
  const requirements = ctx.fileIndex.read('requirements.txt');
  if (requirements) {
    const lower = requirements.toLowerCase();
    if (lower.includes('psycopg') || lower.includes('asyncpg')) return 'postgresql';
    if (lower.includes('mysqlclient') || lower.includes('pymysql')) return 'mysql';
    if (lower.includes('pymongo') || lower.includes('motor')) return 'mongodb';
  }

  return null;
}

function hasDocker(ctx: GeneratorContext): boolean {
  return (
    ctx.fileIndex.exists('docker-compose.yml') ||
    ctx.fileIndex.exists('docker-compose.yaml') ||
    ctx.fileIndex.exists('Dockerfile')
  );
}

function hasBrowserTesting(ctx: GeneratorContext): boolean {
  const packageJson = ctx.fileIndex.read('package.json');
  if (!packageJson) return false;

  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = Object.keys({
      ...(parsed.dependencies ?? {}),
      ...(parsed.devDependencies ?? {}),
    });

    return allDeps.some((d) =>
      ['playwright', '@playwright/test', 'puppeteer', 'cypress'].includes(d),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export const mcpGenerator: Generator<McpJson> = {
  name: 'mcp',

  async generate(ctx: GeneratorContext): Promise<McpJson> {
    const servers: Record<string, McpServerConfig> = {};
    const recommended: McpRecommendation[] = [];

    // Always include filesystem server
    servers['filesystem'] = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '--root', '.'],
      note: 'Always recommended for safe file access',
    };

    // Always include git server
    servers['git'] = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-git'],
      note: 'Always recommended for enhanced git operations',
    };

    // Database servers
    const dbType = detectDatabaseType(ctx);
    if (dbType === 'postgresql') {
      servers['postgres'] = {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        env: {
          DATABASE_URL: '${DATABASE_URL}',
        },
        note: 'Detected PostgreSQL in project dependencies',
      };
    } else if (dbType === 'mysql') {
      servers['mysql'] = {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-mysql'],
        env: {
          DATABASE_URL: '${DATABASE_URL}',
        },
        note: 'Detected MySQL in project dependencies',
      };
    }

    // Docker server
    if (hasDocker(ctx)) {
      servers['docker'] = {
        command: 'npx',
        args: ['-y', 'docker-mcp'],
        note: 'Detected Docker configuration in project',
      };
    }

    // Browser testing recommendation (not auto-configured — needs user setup)
    if (hasBrowserTesting(ctx)) {
      recommended.push({
        name: 'puppeteer',
        reason: 'Browser testing tools detected — useful for debugging E2E tests',
        install: 'npx -y @anthropic-ai/mcp-puppeteer',
      });
    }

    return { mcpServers: servers, recommended };
  },
};
