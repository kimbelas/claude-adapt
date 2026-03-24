/**
 * Declarative capability detection rules.
 *
 * Each rule defines what files, dependencies, or tooling indicate
 * that a project has a specific capability, and what CLI commands
 * become available as a result.
 *
 * To add support for a new ecosystem, just add entries here.
 * No code changes needed.
 */

import type { CapabilityRule } from './types.js';

export const CAPABILITY_RULES: CapabilityRule[] = [
  // =========================================================================
  // Package Management
  // =========================================================================
  {
    id: 'pkg.npm',
    label: 'npm',
    category: 'package-management',
    detect: { configFiles: ['package-lock.json'] },
    commands: { install: 'npm install', run: 'npm run', ci: 'npm ci' },
  },
  {
    id: 'pkg.yarn',
    label: 'Yarn',
    category: 'package-management',
    detect: { configFiles: ['yarn.lock'] },
    commands: { install: 'yarn install', run: 'yarn' },
  },
  {
    id: 'pkg.pnpm',
    label: 'pnpm',
    category: 'package-management',
    detect: { configFiles: ['pnpm-lock.yaml'] },
    commands: { install: 'pnpm install', run: 'pnpm' },
  },
  {
    id: 'pkg.bun',
    label: 'Bun',
    category: 'package-management',
    detect: { configFiles: ['bun.lockb', 'bun.lock'] },
    commands: { install: 'bun install', run: 'bun run' },
  },
  {
    id: 'pkg.composer',
    label: 'Composer',
    category: 'package-management',
    detect: { configFiles: ['composer.json'] },
    commands: { install: 'composer install', run: 'composer run-script' },
  },
  {
    id: 'pkg.pip',
    label: 'pip',
    category: 'package-management',
    detect: { configFiles: ['requirements.txt', 'setup.py', 'pyproject.toml'] },
    commands: { install: 'pip install -r requirements.txt' },
  },
  {
    id: 'pkg.cargo',
    label: 'Cargo',
    category: 'package-management',
    detect: { configFiles: ['Cargo.toml'] },
    commands: { install: 'cargo fetch', run: 'cargo run' },
  },
  {
    id: 'pkg.gomod',
    label: 'Go Modules',
    category: 'package-management',
    detect: { configFiles: ['go.mod'] },
    commands: { install: 'go mod download', tidy: 'go mod tidy' },
  },
  {
    id: 'pkg.bundler',
    label: 'Bundler',
    category: 'package-management',
    detect: { configFiles: ['Gemfile'] },
    commands: { install: 'bundle install', run: 'bundle exec' },
  },

  // =========================================================================
  // Testing
  // =========================================================================
  {
    id: 'test.vitest',
    label: 'Vitest',
    category: 'testing',
    detect: { tooling: [{ category: 'testRunners', name: 'Vitest' }] },
    commands: { run: 'npx vitest run', watch: 'npx vitest', coverage: 'npx vitest --coverage' },
  },
  {
    id: 'test.jest',
    label: 'Jest',
    category: 'testing',
    detect: { tooling: [{ category: 'testRunners', name: 'Jest' }] },
    commands: { run: 'npx jest', coverage: 'npx jest --coverage' },
  },
  {
    id: 'test.mocha',
    label: 'Mocha',
    category: 'testing',
    detect: { tooling: [{ category: 'testRunners', name: 'Mocha' }] },
    commands: { run: 'npx mocha', coverage: 'npx nyc mocha' },
  },
  {
    id: 'test.pytest',
    label: 'pytest',
    category: 'testing',
    detect: { tooling: [{ category: 'testRunners', name: 'pytest' }] },
    commands: { run: 'pytest', coverage: 'pytest --cov', watch: 'pytest-watch' },
  },
  {
    id: 'test.phpunit',
    label: 'PHPUnit',
    category: 'testing',
    detect: { tooling: [{ category: 'testRunners', name: 'PHPUnit' }] },
    commands: { run: 'vendor/bin/phpunit', coverage: 'vendor/bin/phpunit --coverage-text' },
  },
  {
    id: 'test.rspec',
    label: 'RSpec',
    category: 'testing',
    detect: { tooling: [{ category: 'testRunners', name: 'RSpec' }] },
    commands: { run: 'bundle exec rspec', coverage: 'bundle exec rspec --format documentation' },
  },
  {
    id: 'test.gotest',
    label: 'Go test',
    category: 'testing',
    detect: { languages: ['Go'], files: ['**/*_test.go'] },
    commands: { run: 'go test ./...', coverage: 'go test -cover ./...', verbose: 'go test -v ./...' },
  },
  {
    id: 'test.cargo',
    label: 'Cargo test',
    category: 'testing',
    detect: { configFiles: ['Cargo.toml'], languages: ['Rust'] },
    commands: { run: 'cargo test', verbose: 'cargo test -- --nocapture' },
  },
  {
    id: 'test.playwright',
    label: 'Playwright',
    category: 'testing',
    detect: { tooling: [{ category: 'testRunners', name: 'Playwright' }] },
    commands: { run: 'npx playwright test', ui: 'npx playwright test --ui', codegen: 'npx playwright codegen' },
  },
  {
    id: 'test.cypress',
    label: 'Cypress',
    category: 'testing',
    detect: { tooling: [{ category: 'testRunners', name: 'Cypress' }] },
    commands: { run: 'npx cypress run', open: 'npx cypress open' },
  },

  // =========================================================================
  // Linting
  // =========================================================================
  {
    id: 'lint.eslint',
    label: 'ESLint',
    category: 'linting',
    detect: { tooling: [{ category: 'linters', name: 'ESLint' }] },
    commands: { run: 'npx eslint .', fix: 'npx eslint --fix .' },
  },
  {
    id: 'lint.biome',
    label: 'Biome',
    category: 'linting',
    detect: { tooling: [{ category: 'linters', name: 'Biome' }] },
    commands: { run: 'npx biome check .', fix: 'npx biome check --write .' },
  },
  {
    id: 'lint.ruff',
    label: 'Ruff',
    category: 'linting',
    detect: { tooling: [{ category: 'linters', name: 'Ruff' }] },
    commands: { run: 'ruff check .', fix: 'ruff check --fix .' },
  },
  {
    id: 'lint.pylint',
    label: 'Pylint',
    category: 'linting',
    detect: { tooling: [{ category: 'linters', name: 'Pylint' }] },
    commands: { run: 'pylint **/*.py' },
  },
  {
    id: 'lint.phpcs',
    label: 'PHP_CodeSniffer',
    category: 'linting',
    detect: { tooling: [{ category: 'linters', name: 'PHP_CodeSniffer' }] },
    commands: { run: 'vendor/bin/phpcs .', fix: 'vendor/bin/phpcbf .' },
  },
  {
    id: 'lint.phpstan',
    label: 'PHPStan',
    category: 'linting',
    detect: { tooling: [{ category: 'linters', name: 'PHPStan' }] },
    commands: { run: 'vendor/bin/phpstan analyse' },
  },
  {
    id: 'lint.rubocop',
    label: 'RuboCop',
    category: 'linting',
    detect: { tooling: [{ category: 'linters', name: 'RuboCop' }] },
    commands: { run: 'bundle exec rubocop', fix: 'bundle exec rubocop -A' },
  },
  {
    id: 'lint.golangci',
    label: 'golangci-lint',
    category: 'linting',
    detect: { tooling: [{ category: 'linters', name: 'golangci-lint' }] },
    commands: { run: 'golangci-lint run' },
  },
  {
    id: 'lint.clippy',
    label: 'Clippy',
    category: 'linting',
    detect: { tooling: [{ category: 'linters', name: 'Clippy' }] },
    commands: { run: 'cargo clippy', fix: 'cargo clippy --fix' },
  },
  {
    id: 'lint.stylelint',
    label: 'Stylelint',
    category: 'linting',
    detect: { tooling: [{ category: 'linters', name: 'Stylelint' }] },
    commands: { run: 'npx stylelint "**/*.css"', fix: 'npx stylelint --fix "**/*.css"' },
  },

  // =========================================================================
  // Formatting
  // =========================================================================
  {
    id: 'fmt.prettier',
    label: 'Prettier',
    category: 'formatting',
    detect: { tooling: [{ category: 'formatters', name: 'Prettier' }] },
    commands: { run: 'npx prettier --write .', check: 'npx prettier --check .' },
  },
  {
    id: 'fmt.black',
    label: 'Black',
    category: 'formatting',
    detect: { tooling: [{ category: 'formatters', name: 'Black' }] },
    commands: { run: 'black .', check: 'black --check .' },
  },

  // =========================================================================
  // Building
  // =========================================================================
  {
    id: 'build.typescript',
    label: 'TypeScript',
    category: 'building',
    detect: { languages: ['TypeScript'], configFiles: ['tsconfig.json'] },
    commands: { check: 'npx tsc --noEmit', build: 'npx tsc' },
  },
  {
    id: 'build.go',
    label: 'Go build',
    category: 'building',
    detect: { languages: ['Go'], configFiles: ['go.mod'] },
    commands: { build: 'go build ./...', run: 'go run .' },
  },
  {
    id: 'build.rust',
    label: 'Cargo build',
    category: 'building',
    detect: { languages: ['Rust'], configFiles: ['Cargo.toml'] },
    commands: { build: 'cargo build', run: 'cargo run', release: 'cargo build --release' },
  },
  {
    id: 'build.gradle',
    label: 'Gradle',
    category: 'building',
    detect: { configFiles: ['build.gradle', 'build.gradle.kts'] },
    commands: { build: './gradlew build', run: './gradlew run', test: './gradlew test' },
  },
  {
    id: 'build.maven',
    label: 'Maven',
    category: 'building',
    detect: { configFiles: ['pom.xml'] },
    commands: { build: 'mvn compile', package: 'mvn package', test: 'mvn test' },
  },
  {
    id: 'build.make',
    label: 'Make',
    category: 'building',
    detect: { configFiles: ['Makefile'] },
    commands: { build: 'make', clean: 'make clean' },
  },

  // =========================================================================
  // Database
  // =========================================================================
  {
    id: 'db.prisma',
    label: 'Prisma ORM',
    category: 'database',
    detect: { dependencies: ['prisma'], configFiles: ['prisma/schema.prisma'] },
    commands: {
      migrate: 'npx prisma migrate dev',
      generate: 'npx prisma generate',
      seed: 'npx prisma db seed',
      studio: 'npx prisma studio',
      reset: 'npx prisma migrate reset',
    },
  },
  {
    id: 'db.drizzle',
    label: 'Drizzle ORM',
    category: 'database',
    detect: { dependencies: ['drizzle-orm'], configFiles: ['drizzle.config.ts', 'drizzle.config.js'] },
    commands: {
      migrate: 'npx drizzle-kit migrate',
      generate: 'npx drizzle-kit generate',
      studio: 'npx drizzle-kit studio',
    },
  },
  {
    id: 'db.knex',
    label: 'Knex.js',
    category: 'database',
    detect: { dependencies: ['knex'], configFiles: ['knexfile.js', 'knexfile.ts'] },
    commands: {
      migrate: 'npx knex migrate:latest',
      rollback: 'npx knex migrate:rollback',
      seed: 'npx knex seed:run',
      make_migration: 'npx knex migrate:make',
    },
  },
  {
    id: 'db.typeorm',
    label: 'TypeORM',
    category: 'database',
    detect: { dependencies: ['typeorm'] },
    commands: {
      migrate: 'npx typeorm migration:run',
      generate: 'npx typeorm migration:generate',
      revert: 'npx typeorm migration:revert',
    },
  },
  {
    id: 'db.django',
    label: 'Django ORM',
    category: 'database',
    detect: { frameworks: ['Django'] },
    commands: {
      migrate: 'python manage.py migrate',
      makemigrations: 'python manage.py makemigrations',
      dbshell: 'python manage.py dbshell',
    },
  },
  {
    id: 'db.laravel',
    label: 'Laravel Migrations',
    category: 'database',
    detect: { frameworks: ['Laravel'] },
    commands: {
      migrate: 'php artisan migrate',
      rollback: 'php artisan migrate:rollback',
      seed: 'php artisan db:seed',
      fresh: 'php artisan migrate:fresh --seed',
      make_migration: 'php artisan make:migration',
    },
  },
  {
    id: 'db.rails',
    label: 'Rails Migrations',
    category: 'database',
    detect: { frameworks: ['Rails'] },
    commands: {
      migrate: 'rails db:migrate',
      rollback: 'rails db:rollback',
      seed: 'rails db:seed',
      create: 'rails db:create',
      reset: 'rails db:reset',
    },
  },
  {
    id: 'db.alembic',
    label: 'Alembic',
    category: 'database',
    detect: { dependencies: ['alembic'], configFiles: ['alembic.ini'] },
    commands: {
      migrate: 'alembic upgrade head',
      revision: 'alembic revision --autogenerate',
      downgrade: 'alembic downgrade -1',
      history: 'alembic history',
    },
  },
  {
    id: 'db.wp',
    label: 'WordPress Database',
    category: 'database',
    detect: { configFiles: ['wp-config.php'] },
    commands: {
      export: 'wp db export',
      import: 'wp db import',
      search_replace: 'wp search-replace',
      query: 'wp db query',
    },
    implies: ['cli.wp'],
  },

  // =========================================================================
  // Deployment
  // =========================================================================
  {
    id: 'deploy.docker',
    label: 'Docker',
    category: 'containerization',
    detect: { files: ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'] },
    commands: {
      up: 'docker compose up -d',
      down: 'docker compose down',
      logs: 'docker compose logs --tail=20',
      ps: 'docker compose ps',
      build: 'docker compose build',
    },
  },
  {
    id: 'deploy.vercel',
    label: 'Vercel',
    category: 'deploying',
    detect: { configFiles: ['vercel.json'], dependencies: ['vercel'] },
    commands: { deploy: 'vercel', preview: 'vercel --preview', prod: 'vercel --prod' },
  },
  {
    id: 'deploy.netlify',
    label: 'Netlify',
    category: 'deploying',
    detect: { configFiles: ['netlify.toml'] },
    commands: { deploy: 'netlify deploy', prod: 'netlify deploy --prod', dev: 'netlify dev' },
  },
  {
    id: 'deploy.fly',
    label: 'Fly.io',
    category: 'deploying',
    detect: { configFiles: ['fly.toml'] },
    commands: { deploy: 'fly deploy', status: 'fly status', logs: 'fly logs' },
  },
  {
    id: 'deploy.railway',
    label: 'Railway',
    category: 'deploying',
    detect: { configFiles: ['railway.toml', 'railway.json'] },
    commands: { deploy: 'railway up', logs: 'railway logs' },
  },
  {
    id: 'deploy.k8s',
    label: 'Kubernetes',
    category: 'deploying',
    detect: { files: ['**/k8s/**/*.yaml', '**/k8s/**/*.yml', '**/kubernetes/**/*.yaml'] },
    commands: { apply: 'kubectl apply -f k8s/', status: 'kubectl get pods', logs: 'kubectl logs' },
  },
  {
    id: 'deploy.serverless',
    label: 'Serverless Framework',
    category: 'deploying',
    detect: { configFiles: ['serverless.yml', 'serverless.yaml', 'serverless.ts'] },
    commands: { deploy: 'npx serverless deploy', invoke: 'npx serverless invoke', logs: 'npx serverless logs' },
  },

  // =========================================================================
  // CLI Tools
  // =========================================================================
  {
    id: 'cli.wp',
    label: 'WP-CLI',
    category: 'cli-tool',
    detect: { configFiles: ['wp-cli.yml', 'wp-cli.yaml'], files: ['wp-config.php'] },
    commands: {
      plugin_list: 'wp plugin list',
      plugin_install: 'wp plugin install',
      theme_activate: 'wp theme activate',
      cache_flush: 'wp cache flush',
      rewrite_flush: 'wp rewrite flush',
      cron_list: 'wp cron event list',
      user_list: 'wp user list',
    },
  },
  {
    id: 'cli.artisan',
    label: 'Artisan',
    category: 'cli-tool',
    detect: { frameworks: ['Laravel'], configFiles: ['artisan'] },
    commands: {
      serve: 'php artisan serve',
      tinker: 'php artisan tinker',
      make_model: 'php artisan make:model',
      make_controller: 'php artisan make:controller',
      make_command: 'php artisan make:command',
      route_list: 'php artisan route:list',
      cache_clear: 'php artisan cache:clear',
    },
  },
  {
    id: 'cli.manage',
    label: 'Django manage.py',
    category: 'cli-tool',
    detect: { frameworks: ['Django'], configFiles: ['manage.py'] },
    commands: {
      runserver: 'python manage.py runserver',
      shell: 'python manage.py shell',
      createsuperuser: 'python manage.py createsuperuser',
      collectstatic: 'python manage.py collectstatic',
      startapp: 'python manage.py startapp',
    },
  },
  {
    id: 'cli.rails',
    label: 'Rails CLI',
    category: 'cli-tool',
    detect: { frameworks: ['Rails'] },
    commands: {
      server: 'rails server',
      console: 'rails console',
      generate: 'rails generate',
      routes: 'rails routes',
    },
  },

  // =========================================================================
  // API
  // =========================================================================
  {
    id: 'api.openapi',
    label: 'OpenAPI',
    category: 'api',
    detect: { files: ['openapi.yaml', 'openapi.json', 'openapi.yml', 'swagger.yaml', 'swagger.json'] },
    commands: { validate: 'npx swagger-cli validate openapi.yaml' },
  },
  {
    id: 'api.graphql',
    label: 'GraphQL',
    category: 'api',
    detect: { dependencies: ['graphql', '@apollo/server', 'type-graphql'], files: ['**/*.graphql'] },
    commands: { codegen: 'npx graphql-codegen' },
  },
  {
    id: 'api.trpc',
    label: 'tRPC',
    category: 'api',
    detect: { dependencies: ['@trpc/server'] },
    commands: {},
  },

  // =========================================================================
  // Version Control (git conventions)
  // =========================================================================
  {
    id: 'vcs.conventional',
    label: 'Conventional Commits',
    category: 'vcs',
    detect: {
      dependencies: ['@commitlint/cli', 'commitizen', 'cz-conventional-changelog', '@commitlint/config-conventional'],
    },
    commands: {},
  },

  // =========================================================================
  // Monitoring / Debugging
  // =========================================================================
  {
    id: 'monitor.wp-debug',
    label: 'WordPress Debug Log',
    category: 'monitoring',
    detect: {
      configFiles: ['wp-config.php'],
      contentPatterns: [{ file: 'wp-config.php', pattern: 'WP_DEBUG' }],
    },
    commands: {
      tail_log: 'tail -f wp-content/debug.log',
      clear_log: 'truncate -s 0 wp-content/debug.log',
    },
  },
  {
    id: 'monitor.laravel-log',
    label: 'Laravel Log',
    category: 'monitoring',
    detect: { frameworks: ['Laravel'], files: ['storage/logs/laravel.log'] },
    commands: {
      tail_log: 'tail -f storage/logs/laravel.log',
      clear_log: 'php artisan log:clear',
    },
  },
];
