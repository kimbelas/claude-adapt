import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface FrameworkInfo {
  name: string;
  version?: string;
  confidence: number;
}

interface FrameworkRule {
  name: string;
  configFiles?: string[];
  dependencies?: string[];
  files?: string[];
  confidence: number;
}

const FRAMEWORK_RULES: FrameworkRule[] = [
  {
    name: 'Next.js',
    configFiles: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    dependencies: ['next'],
    confidence: 0.95,
  },
  {
    name: 'Nuxt',
    configFiles: ['nuxt.config.js', 'nuxt.config.ts'],
    dependencies: ['nuxt'],
    confidence: 0.95,
  },
  {
    name: 'React',
    dependencies: ['react'],
    confidence: 0.85,
  },
  {
    name: 'Vue',
    dependencies: ['vue'],
    confidence: 0.85,
  },
  {
    name: 'Angular',
    configFiles: ['angular.json'],
    dependencies: ['@angular/core'],
    confidence: 0.95,
  },
  {
    name: 'Svelte',
    configFiles: ['svelte.config.js', 'svelte.config.ts'],
    dependencies: ['svelte'],
    confidence: 0.9,
  },
  {
    name: 'Express',
    dependencies: ['express'],
    confidence: 0.8,
  },
  {
    name: 'Fastify',
    dependencies: ['fastify'],
    confidence: 0.85,
  },
  {
    name: 'NestJS',
    dependencies: ['@nestjs/core'],
    confidence: 0.9,
  },
  {
    name: 'Laravel',
    files: ['artisan'],
    dependencies: ['laravel/framework'],
    confidence: 0.95,
  },
  {
    name: 'Django',
    files: ['manage.py'],
    dependencies: ['django', 'Django'],
    confidence: 0.9,
  },
  {
    name: 'Flask',
    dependencies: ['flask', 'Flask'],
    confidence: 0.85,
  },
  {
    name: 'FastAPI',
    dependencies: ['fastapi'],
    confidence: 0.9,
  },
  {
    name: 'Rails',
    files: ['Gemfile', 'config/routes.rb'],
    dependencies: ['rails'],
    confidence: 0.95,
  },
  {
    name: 'Spring Boot',
    files: ['pom.xml', 'build.gradle'],
    dependencies: ['spring-boot-starter'],
    confidence: 0.85,
  },
  {
    name: 'Astro',
    configFiles: ['astro.config.mjs', 'astro.config.ts'],
    dependencies: ['astro'],
    confidence: 0.95,
  },
  {
    name: 'Remix',
    dependencies: ['@remix-run/react'],
    confidence: 0.9,
  },
  {
    name: 'Gatsby',
    configFiles: ['gatsby-config.js', 'gatsby-config.ts'],
    dependencies: ['gatsby'],
    confidence: 0.9,
  },
  {
    name: 'Electron',
    dependencies: ['electron'],
    confidence: 0.85,
  },
  {
    name: 'Tauri',
    configFiles: ['tauri.conf.json'],
    dependencies: ['@tauri-apps/api'],
    confidence: 0.9,
  },
];

export class FrameworkDetector {
  async detect(rootPath: string): Promise<FrameworkInfo[]> {
    const detected: FrameworkInfo[] = [];
    const deps = await this.readDependencies(rootPath);
    const existingFiles = await this.checkFiles(rootPath);

    for (const rule of FRAMEWORK_RULES) {
      let matched = false;
      let version: string | undefined;

      if (rule.configFiles) {
        for (const cf of rule.configFiles) {
          if (existingFiles.has(cf)) {
            matched = true;
            break;
          }
        }
      }

      if (rule.dependencies) {
        for (const dep of rule.dependencies) {
          if (deps.has(dep)) {
            matched = true;
            version = deps.get(dep);
            break;
          }
        }
      }

      if (rule.files && !matched) {
        for (const f of rule.files) {
          if (existingFiles.has(f)) {
            matched = true;
            break;
          }
        }
      }

      if (matched) {
        detected.push({
          name: rule.name,
          version,
          confidence: rule.confidence,
        });
      }
    }

    return detected;
  }

  private async readDependencies(rootPath: string): Promise<Map<string, string>> {
    const deps = new Map<string, string>();

    // package.json
    try {
      const pkgJson = JSON.parse(
        await readFile(join(rootPath, 'package.json'), 'utf-8'),
      );
      const allDeps = {
        ...pkgJson.dependencies,
        ...pkgJson.devDependencies,
      };
      for (const [name, version] of Object.entries(allDeps)) {
        deps.set(name, version as string);
      }
    } catch { /* no package.json */ }

    // composer.json
    try {
      const composerJson = JSON.parse(
        await readFile(join(rootPath, 'composer.json'), 'utf-8'),
      );
      const allDeps = {
        ...composerJson.require,
        ...composerJson['require-dev'],
      };
      for (const [name, version] of Object.entries(allDeps)) {
        deps.set(name, version as string);
      }
    } catch { /* no composer.json */ }

    // requirements.txt
    try {
      const reqTxt = await readFile(join(rootPath, 'requirements.txt'), 'utf-8');
      for (const line of reqTxt.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)(?:[=<>!~]+(.+))?/);
        if (match) {
          deps.set(match[1].toLowerCase(), match[2] ?? '*');
        }
      }
    } catch { /* no requirements.txt */ }

    // Gemfile (basic detection)
    try {
      const gemfile = await readFile(join(rootPath, 'Gemfile'), 'utf-8');
      for (const match of gemfile.matchAll(/gem\s+['"]([^'"]+)['"]/g)) {
        deps.set(match[1], '*');
      }
    } catch { /* no Gemfile */ }

    return deps;
  }

  private async checkFiles(rootPath: string): Promise<Set<string>> {
    const filesToCheck = new Set<string>();
    for (const rule of FRAMEWORK_RULES) {
      if (rule.configFiles) rule.configFiles.forEach(f => filesToCheck.add(f));
      if (rule.files) rule.files.forEach(f => filesToCheck.add(f));
    }

    const existing = new Set<string>();
    for (const file of filesToCheck) {
      try {
        const { readFile: rf } = await import('node:fs/promises');
        await rf(join(rootPath, file));
        existing.add(file);
      } catch { /* doesn't exist */ }
    }
    return existing;
  }
}
