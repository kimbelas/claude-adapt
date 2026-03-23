# claude-adapt — Phase 3: `skills` — Full Technical Specification

> **Package:** `claude-adapt` (npm)  
> **License:** MIT  
> **Phase:** 3 of 4 (score → init → skills → sync)  
> **Status:** Locked — Ready for implementation

---

## 1. Overview

`claude-adapt skills` is a portable plugin system that turns `claude-adapt` from a tool into a platform. Skills are composable bundles of Claude Code configuration — CLAUDE.md fragments, custom commands, hooks, MCP configs, and scoring enhancers — packaged as npm modules following the `claude-skill-*` convention.

The community contributes domain expertise as installable packages. A Laravel developer installs `claude-skill-laravel`; a Kubernetes operator installs `claude-skill-k8s`. Each skill merges cleanly into the existing `.claude/` directory and can be removed without leaving debris.

---

## 2. What Makes This Different

| Existing Tool | Limitation | Skills Advantage |
|---|---|---|
| `agents-mdx` | One universal file, no modularity | Composable, install/remove, versioned |
| `gm-cc` | Opinionated state machine, rigid | Flexible, community-driven |
| `@tekyzinc/gsd-t` | 49 built-in commands, not extensible | Open ecosystem, anyone can publish |
| Static CLAUDE.md | Manual, no merge, no lifecycle | Auto-merged, source-tracked, reversible |

---

## 3. The Skill Manifest — `claude-skill.json`

```typescript
interface SkillManifest {
  // Identity
  name: string;                      // e.g. "claude-skill-laravel"
  displayName: string;               // e.g. "Laravel"
  version: string;                   // semver
  description: string;
  author: string;
  license: string;
  repository?: string;

  // Compatibility
  claudeAdaptVersion: string;        // semver range: "^1.0.0"
  requires?: {
    languages?: string[];
    frameworks?: string[];
    tools?: string[];
    skills?: string[];               // Dependency on other skills
  };
  conflicts?: string[];              // Skills that can't coexist

  // Content declarations
  provides: {
    claudeMd?: {
      sections: SkillSection[];
      priority?: number;             // Merge order (higher = later, default 50)
    };
    commands?: SkillCommand[];
    hooks?: SkillHook[];
    mcp?: SkillMcp[];
    analyzers?: SkillAnalyzer[];     // Phase 1 scoring enhancers
    settings?: Partial<ClaudeSettings>;
  };

  // Activation
  autoActivate?: {
    when: ActivationCondition[];
  };

  // Metadata
  tags: string[];
  icon?: string;
}
```

### 3.1 Skill Section — CLAUDE.md Fragments

```typescript
interface SkillSection {
  id: string;                        // Unique within skill
  title: string;
  content: string;                   // Markdown content or file path
  placement: {
    after?: string;                  // Insert after this section ID
    before?: string;                 // Insert before this section ID
    section?: string;                // Merge into existing section
    position?: 'top' | 'bottom';    // Fallback position
  };
  condition?: string;                // JS expression for conditional inclusion
}
```

### 3.2 Skill Command

```typescript
interface SkillCommand {
  name: string;                      // "/artisan"
  file: string;                      // Relative path to command .md file
  description: string;
  overrides?: string;                // Replace an existing command by name
}
```

### 3.3 Skill Hook

```typescript
interface SkillHook {
  event: 'pre-commit' | 'post-commit' | 'pre-tool-use' |
         'post-tool-use' | 'pre-session' | 'post-session';
  file: string;
  priority: number;                  // Execution order (lower = first)
  merge: 'prepend' | 'append' | 'replace';
}
```

### 3.4 Skill MCP Config

```typescript
interface SkillMcp {
  name: string;
  server: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  };
  reason: string;
  optional: boolean;                 // Required vs recommended
}
```

### 3.5 Skill Analyzer (Phase 1 Integration)

```typescript
interface SkillAnalyzer {
  category: AnalyzerCategory | string;
  signals: {
    id: string;
    file: string;                    // Analyzer module path
  }[];
}
```

### 3.6 Activation Conditions

```typescript
interface ActivationCondition {
  type: 'language' | 'framework' | 'tool' | 'file' | 'dependency';
  value: string;
  operator?: 'exists' | 'matches' | 'version';
}
```

---

## 4. Example Skill — `claude-skill-laravel`

### 4.1 Package Structure

```
claude-skill-laravel/
├── claude-skill.json
├── sections/
│   ├── eloquent.md
│   ├── routing.md
│   ├── migrations.md
│   ├── testing.md
│   └── artisan.md
├── commands/
│   ├── artisan.md
│   ├── migrate.md
│   ├── tinker.md
│   └── make-model.md
├── hooks/
│   ├── pre-commit.sh
│   └── post-migrate.sh
├── analyzers/
│   ├── eloquent-safety.js
│   ├── route-coverage.js
│   └── migration-hygiene.js
├── package.json
└── README.md
```

### 4.2 Full Manifest Example

```json
{
  "name": "claude-skill-laravel",
  "displayName": "Laravel",
  "version": "1.0.0",
  "description": "Claude Code skill pack for Laravel projects",
  "author": "community",
  "license": "MIT",
  "claudeAdaptVersion": "^1.0.0",

  "requires": {
    "languages": ["php"],
    "frameworks": ["laravel"],
    "tools": ["composer"]
  },

  "provides": {
    "claudeMd": {
      "sections": [
        {
          "id": "laravel-eloquent",
          "title": "Eloquent ORM Patterns",
          "content": "sections/eloquent.md",
          "placement": { "after": "key-patterns" }
        },
        {
          "id": "laravel-routing",
          "title": "Routing Conventions",
          "content": "sections/routing.md",
          "placement": { "after": "laravel-eloquent" }
        },
        {
          "id": "laravel-migrations",
          "title": "Migration Patterns",
          "content": "sections/migrations.md",
          "placement": { "after": "laravel-routing" }
        },
        {
          "id": "laravel-testing",
          "title": "Testing (Laravel)",
          "content": "sections/testing.md",
          "placement": { "section": "testing" }
        },
        {
          "id": "laravel-artisan",
          "title": "Artisan CLI",
          "content": "sections/artisan.md",
          "placement": { "after": "common-tasks" }
        }
      ],
      "priority": 60
    },

    "commands": [
      { "name": "/artisan",    "file": "commands/artisan.md",    "description": "Run Artisan commands" },
      { "name": "/migrate",    "file": "commands/migrate.md",    "description": "Database migrations" },
      { "name": "/tinker",     "file": "commands/tinker.md",     "description": "Laravel REPL" },
      { "name": "/make:model", "file": "commands/make-model.md", "description": "Scaffold model + migration + factory" }
    ],

    "hooks": [
      { "event": "pre-commit", "file": "hooks/pre-commit.sh", "priority": 10, "merge": "prepend" }
    ],

    "mcp": [
      {
        "name": "laravel-tinker",
        "server": { "command": "npx", "args": ["-y", "laravel-tinker-mcp"] },
        "reason": "Run Tinker commands to inspect Eloquent models",
        "optional": true
      }
    ],

    "analyzers": [
      { "category": "modularity", "signals": [{ "id": "laravel.eloquent.n-plus-one", "file": "analyzers/eloquent-safety.js" }] },
      { "category": "test-coverage", "signals": [{ "id": "laravel.route.test-coverage", "file": "analyzers/route-coverage.js" }] },
      { "category": "git-hygiene", "signals": [{ "id": "laravel.migration.rollback", "file": "analyzers/migration-hygiene.js" }] }
    ]
  },

  "autoActivate": {
    "when": [
      { "type": "framework", "value": "laravel" },
      { "type": "file", "value": "artisan" }
    ]
  },

  "tags": ["php", "laravel", "web", "mvc", "eloquent"],
  "icon": "🏰"
}
```

---

## 5. The Merge Engine

### 5.1 Design Principles

1. **Deterministic**: Same inputs always produce same outputs.
2. **Reversible**: Every merge records a transaction with a rollback plan.
3. **Conflict-aware**: Detects and reports conflicts instead of silently overwriting.
4. **Additive security**: Skills can add restrictions but never remove them.
5. **Source-tracked**: Every merged artifact is marked with its origin for clean removal.

### 5.2 Merge Transaction (Atomic Unit)

```typescript
interface MergeTransaction {
  id: string;
  skill: string;
  timestamp: string;
  operations: MergeOperation[];
  rollback: RollbackPlan;
}

interface MergeOperation {
  type: 'create' | 'insert' | 'append' | 'modify' | 'delete';
  target: string;                    // File path relative to .claude/
  content?: string;
  anchor?: string;
  position?: 'before' | 'after' | 'within' | 'replace';
  marker: string;                    // Source tracking marker
}

interface RollbackPlan {
  operations: RollbackOperation[];
}

interface RollbackOperation {
  type: 'restore' | 'remove-section' | 'remove-file';
  target: string;
  originalContent?: string;
}
```

All transactions are persisted in `.claude-adapt/merge-log.json` (append-only).

---

### 5.3 Sub-Merger 1: CLAUDE.md Merger

#### Section Tree Parser

```typescript
class ClaudeMdParser {
  parse(content: string): SectionTree {
    const lines = content.split('\n');
    const root: SectionTree = { sections: [], preamble: '' };
    const stack: Section[] = [];

    for (let i = 0; i < lines.length; i++) {
      const headingMatch = lines[i].match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = headingMatch[2];
        const id = this.extractId(lines, i) || this.slugify(title);
        const source = this.extractSource(lines, i);

        const section: Section = {
          id,
          title,
          level,
          content: '',
          source: source || 'manual',
          children: [],
          startLine: i,
          endLine: -1,
        };

        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }

        if (stack.length === 0) {
          root.sections.push(section);
        } else {
          stack[stack.length - 1].children.push(section);
        }

        stack.push(section);
      }
    }

    this.populateContent(root, lines);
    return root;
  }

  // Extract source marker: <!-- claude-adapt:source:skill:laravel:eloquent -->
  private extractSource(lines: string[], headingLine: number): string | null {
    if (headingLine > 0) {
      const prev = lines[headingLine - 1];
      const match = prev.match(/<!--\s*claude-adapt:source:(.+?)\s*-->/);
      if (match) return match[1];
    }
    return null;
  }

  private slugify(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}
```

#### Merge Algorithm

```typescript
class ClaudeMdMerger {
  merge(
    existingContent: string,
    skillSections: SkillSection[],
    skillName: string,
    priority: number,
  ): MergeResult {
    const tree = this.parser.parse(existingContent);
    const operations: MergeOperation[] = [];
    const conflicts: Conflict[] = [];

    // Topological sort: if section A references B as anchor, B first
    const sorted = this.topologicalSort(skillSections);

    for (const section of sorted) {
      const result = this.mergeSection(tree, section, skillName, priority);

      if (result.type === 'conflict') {
        conflicts.push(result.conflict);
      } else {
        operations.push(result.operation);
      }
    }

    const newContent = this.serializer.serialize(tree);

    return {
      content: newContent,
      operations,
      conflicts,
      rollback: {
        operations: [{ type: 'restore', target: 'CLAUDE.md', originalContent: existingContent }],
      },
    };
  }

  private mergeSection(tree, section, skillName, priority) {
    const sourceMarker = `skill:${skillName}:${section.id}`;

    // Check for existing section with same ID
    const existing = this.findSection(tree, section.id);
    if (existing) {
      if (existing.source === sourceMarker) {
        // Same skill — update in place
        existing.content = section.content;
        return { type: 'success', operation: { type: 'modify', ... } };
      } else {
        // Different source — conflict
        return { type: 'conflict', conflict: { ... } };
      }
    }

    // Create new section node
    const newNode: Section = {
      id: section.id,
      title: section.title,
      level: 2,
      content: section.content,
      source: sourceMarker,
      children: [],
      priority,
    };

    // Resolve placement: section > after > before > position
    if (placement.section) {
      // Merge INTO existing section as subsection
      const target = this.findSection(tree, placement.section);
      if (target) {
        newNode.level = target.level + 1;
        this.insertByPriority(target.children, newNode);
        return { type: 'success', operation: { type: 'insert', position: 'within', ... } };
      }
    }

    if (placement.after) {
      const anchor = this.findSection(tree, placement.after);
      if (anchor) {
        const siblings = this.getSiblings(tree, placement.after);
        const anchorIdx = siblings.findIndex(s => s.id === placement.after);

        // Insert respecting priority among other "after" sections
        let insertIdx = anchorIdx + 1;
        while (insertIdx < siblings.length &&
               siblings[insertIdx].source?.startsWith('skill:') &&
               (siblings[insertIdx].priority ?? 50) <= priority) {
          insertIdx++;
        }

        newNode.level = anchor.level;
        siblings.splice(insertIdx, 0, newNode);
        return { type: 'success', operation: { type: 'insert', position: 'after', ... } };
      }
    }

    if (placement.before) {
      const anchor = this.findSection(tree, placement.before);
      if (anchor) {
        const siblings = this.getSiblings(tree, placement.before);
        const anchorIdx = siblings.findIndex(s => s.id === placement.before);
        newNode.level = anchor.level;
        siblings.splice(anchorIdx, 0, newNode);
        return { type: 'success', operation: { type: 'insert', position: 'before', ... } };
      }
    }

    // Fallback: top or bottom
    if (placement.position === 'top') tree.sections.unshift(newNode);
    else tree.sections.push(newNode);

    return { type: 'success', operation: { type: 'append', ... } };
  }

  // Topological sort using Kahn's algorithm
  private topologicalSort(sections: SkillSection[]): SkillSection[] {
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const s of sections) {
      graph.set(s.id, []);
      inDegree.set(s.id, 0);
    }

    for (const s of sections) {
      const anchor = s.placement.after || s.placement.before;
      if (anchor && graph.has(anchor)) {
        graph.get(anchor)!.push(s.id);
        inDegree.set(s.id, (inDegree.get(s.id) || 0) + 1);
      }
    }

    const queue = [...inDegree.entries()]
      .filter(([_, deg]) => deg === 0)
      .map(([id]) => id);
    const result: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      for (const next of graph.get(current) || []) {
        inDegree.set(next, inDegree.get(next)! - 1);
        if (inDegree.get(next) === 0) queue.push(next);
      }
    }

    const sectionMap = new Map(sections.map(s => [s.id, s]));
    return result.map(id => sectionMap.get(id)!);
  }
}
```

#### Section Tree Serializer

```typescript
class ClaudeMdSerializer {
  serialize(tree: SectionTree): string {
    const lines: string[] = [];

    if (tree.preamble) {
      lines.push(tree.preamble, '');
    }

    for (const section of tree.sections) {
      this.serializeSection(section, lines);
    }

    return lines.join('\n');
  }

  private serializeSection(section: Section, lines: string[]): void {
    // Source tracking marker (hidden from rendered markdown)
    if (section.source && section.source !== 'manual') {
      lines.push(`<!-- claude-adapt:source:${section.source} -->`);
    }

    // Heading + content
    lines.push(`${'#'.repeat(section.level)} ${section.title}`, '');
    if (section.content.trim()) {
      lines.push(section.content.trim(), '');
    }

    // Children
    for (const child of section.children) {
      this.serializeSection(child, lines);
    }

    // End marker for clean removal
    if (section.source && section.source !== 'manual') {
      lines.push(`<!-- claude-adapt:end:${section.source} -->`, '');
    }
  }
}
```

---

### 5.4 Sub-Merger 2: Hook Composer

Hooks are composed as priority-ordered blocks within a single shell script:

```typescript
class HookComposer {
  compose(existingHook: string | null, incoming: SkillHook[], skillName: string): HookComposeResult {
    const blocks = existingHook ? this.parseBlocks(existingHook) : [];

    for (const hook of incoming) {
      const content = fs.readFileSync(hook.file, 'utf-8');
      const marker = `skill:${skillName}`;
      const newBlock: HookBlock = { source: marker, priority: hook.priority, content: content.trim() };

      switch (hook.merge) {
        case 'replace':
          blocks.splice(0, blocks.length);
          blocks.push(newBlock);
          break;
        case 'prepend':
        case 'append':
          const existingIdx = blocks.findIndex(b => b.source === marker);
          if (existingIdx !== -1) {
            blocks[existingIdx] = newBlock;
          } else {
            const insertIdx = this.findInsertIndex(blocks, hook.priority);
            blocks.splice(insertIdx, 0, newBlock);
          }
          break;
      }
    }

    blocks.sort((a, b) => a.priority - b.priority);
    return { content: this.serializeBlocks(blocks), rollback: existingHook };
  }

  parseBlocks(content: string): HookBlock[] {
    // Parses block markers:
    // # --- claude-adapt:skill:laravel (priority: 10) ---
    // ...content...
    // # --- end:claude-adapt:skill:laravel ---
    // Unmarked content becomes a "core" block at priority 50
  }

  serializeBlocks(blocks: HookBlock[]): string {
    const lines = ['#!/bin/bash', '# Generated by claude-adapt', '', 'set -e', ''];
    for (const block of blocks) {
      lines.push(`# --- claude-adapt:${block.source} (priority: ${block.priority}) ---`);
      lines.push(block.content);
      lines.push(`# --- end:claude-adapt:${block.source} ---`, '');
    }
    return lines.join('\n');
  }
}

interface HookBlock {
  source: string;    // "core", "skill:laravel", "skill:docker"
  priority: number;
  content: string;
}
```

---

### 5.5 Sub-Merger 3: Settings Merger (Additive-Only Security)

```typescript
class SettingsMerger {
  merge(existing: ClaudeSettings, incoming: Partial<ClaudeSettings>, skillName: string): SettingsMergeResult {
    const merged = structuredClone(existing);

    // ALLOWED lists: union (skills can ADD capabilities)
    this.unionArray(merged.permissions.allowedTools, incoming.permissions?.allowedTools);
    this.unionArray(merged.permissions.allowedCommands, incoming.permissions?.allowedCommands);

    // DENIED lists: union (skills can ADD restrictions, NEVER remove)
    this.unionArray(merged.permissions.deniedTools, incoming.permissions?.deniedTools);
    this.unionArray(merged.permissions.deniedCommands, incoming.permissions?.deniedCommands);

    // SAFETY INVARIANT: verify no denied item was removed
    for (const denied of existing.permissions.deniedTools) {
      if (!merged.permissions.deniedTools.includes(denied)) {
        throw new SecurityViolation(`Skill ${skillName} attempted to remove denied tool: ${denied}`);
      }
    }

    // CONFLICT: if skill allows something that's denied, denied wins
    const conflicts = this.detectAllowDenyConflicts(merged);

    // Behavior: last-write-wins with source tracking
    if (incoming.behavior) {
      Object.assign(merged.behavior, incoming.behavior);
    }

    // Source tracking
    if (!merged._sources) merged._sources = {};
    merged._sources[skillName] = { addedAt: new Date().toISOString() };

    return { settings: merged, conflicts, rollback: existing };
  }
}
```

---

### 5.6 Sub-Merger 4: Command Merger

Commands are individual files — simpler than content merges:

```typescript
class CommandMerger {
  merge(existingCommands: Map<string, CommandFile>, incoming: SkillCommand[], skillName: string): CommandMergeResult {
    const created: string[] = [];
    const conflicts: CommandConflict[] = [];

    for (const cmd of incoming) {
      const targetPath = `.claude/commands/${cmd.name.replace('/', '')}.md`;

      // Check for conflicts (same name, different source, no explicit override)
      if (!cmd.overrides && existingCommands.has(cmd.name)) {
        const existing = existingCommands.get(cmd.name)!;
        if (existing.source !== `skill:${skillName}`) {
          conflicts.push({ command: cmd.name, existingSource: existing.source });
          continue;
        }
      }

      // Write with source header
      const content = `<!-- claude-adapt:source:skill:${skillName}:command:${cmd.name} -->\n` +
                      fs.readFileSync(cmd.file, 'utf-8');
      existingCommands.set(cmd.name, { path: targetPath, content, source: `skill:${skillName}` });
      created.push(targetPath);
    }

    return { created, conflicts };
  }

  remove(skillName: string): string[] {
    // Find and delete all command files with this skill's source marker
  }
}
```

---

### 5.7 Sub-Merger 5: MCP Config Merger

```typescript
class McpMerger {
  merge(existing: McpConfig, incoming: SkillMcp[], skillName: string): McpMergeResult {
    const merged = structuredClone(existing);

    for (const mcp of incoming) {
      if (merged.mcpServers[mcp.name] && merged.mcpServers[mcp.name]._source !== `skill:${skillName}`) {
        // Name collision from different source — conflict
        conflicts.push({ serverName: mcp.name });
        continue;
      }

      if (mcp.optional) {
        merged.recommended.push({ name: mcp.name, reason: mcp.reason, _source: `skill:${skillName}` });
      } else {
        merged.mcpServers[mcp.name] = { ...mcp.server, _source: `skill:${skillName}` };
      }
    }

    return { config: merged, conflicts };
  }

  remove(config: McpConfig, skillName: string): McpConfig {
    // Remove all entries where _source matches skill
  }
}
```

---

### 5.8 Master Merge Orchestrator

Coordinates all 5 sub-mergers within a single atomic transaction:

```typescript
class MergeOrchestrator {
  async install(skill: SkillManifest, packagePath: string): Promise<InstallResult> {
    const transaction = createTransaction(skill.name);

    try {
      // 1. CLAUDE.md sections
      if (skill.provides.claudeMd) { /* claudeMdMerger.merge() */ }
      // 2. Settings
      if (skill.provides.settings) { /* settingsMerger.merge() */ }
      // 3. Commands
      if (skill.provides.commands) { /* commandMerger.merge() */ }
      // 4. Hooks
      if (skill.provides.hooks) { /* hookComposer.compose() */ }
      // 5. MCP config
      if (skill.provides.mcp) { /* mcpMerger.merge() */ }

      // Record transaction + update lockfile
      this.mergeLog.transactions.push(transaction);
      this.updateLockfile(skill);

      return results;
    } catch (error) {
      // ROLLBACK: replay all rollback operations in reverse
      for (const op of transaction.rollback.operations.reverse()) {
        this.executeRollback(op);
      }
      throw new MergeError(...);
    }
  }

  async uninstall(skillName: string): Promise<RemoveResult> {
    // 1. Remove CLAUDE.md sections (by source marker)
    // 2. Remove command files (by source marker)
    // 3. Remove hook blocks (by source marker)
    // 4. Remove settings contributions (from transaction log)
    // 5. Remove MCP entries (by _source field)
    // 6. Clean up merge log + lockfile
  }
}
```

---

## 6. Skill Registry & Discovery

### 6.1 Primary Registry

npm with `claude-skill-*` naming convention. Zero infrastructure required.

### 6.2 Optional Central Index

GitHub repo (`claude-adapt/skill-index`) containing `skill-index.json`:

```typescript
interface SkillIndex {
  version: 1;
  lastUpdated: string;
  skills: SkillIndexEntry[];
}

interface SkillIndexEntry {
  name: string;
  displayName: string;
  description: string;
  tags: string[];
  downloads: number;
  verified: boolean;
  activationConditions: ActivationCondition[];
}
```

### 6.3 Auto-Discovery During `init`

```typescript
async function suggestSkills(ctx: GeneratorContext, index: SkillIndex): Promise<SkillSuggestion[]> {
  return index.skills
    .filter(skill => matchesConditions(skill.activationConditions, ctx.repoProfile))
    .filter(skill => !isInstalled(skill.name))
    .sort((a, b) => b.downloads - a.downloads);
}
```

---

## 7. Skill Validation & Security

```typescript
class SkillValidator {
  async validate(manifest: SkillManifest, packagePath: string): Promise<ValidationResult> {
    // 1. Schema validation
    // 2. Compatibility check (claude-adapt version)
    // 3. Requirement check (languages, frameworks, tools)
    // 4. Conflict check (installed skills)
    // 5. Hook safety check (no dangerous commands)
    // 6. Analyzer sandbox check (no network/fs.write)
  }
}
```

---

## 8. Skill Lockfile — `.claude-adapt/skills.lock`

```typescript
interface SkillLock {
  version: 1;
  skills: Record<string, {
    version: string;
    resolved: string;
    integrity: string;
    installedAt: string;
    provides: string[];
  }>;
}
```

---

## 9. Built-In Starter Skills

| Skill | Provides | Auto-Activates |
|---|---|---|
| `@built-in/typescript` | tsconfig conventions, type commands | `language: typescript` |
| `@built-in/git-workflow` | Commit conventions, PR templates | Always (git detected) |
| `@built-in/testing` | Generic test patterns, TDD commands | Test runner detected |
| `@built-in/docker` | Container commands, compose conventions | Docker config detected |
| `@built-in/monorepo` | Workspace commands, boundary rules | Monorepo structure detected |

---

## 10. CLI Specification

```
npx claude-adapt skills <command> [options]

Commands:
  add <name[@version]>        Install a skill
  remove <name>               Uninstall (clean removal via transaction log)
  update [name]               Update one or all skills
  list                        Show installed skills
  search <query>              Search npm + skill index
  info <name>                 Show skill details and compatibility
  init                        Scaffold a new skill from template
  validate [path]             Validate a skill manifest
  publish                     Publish to npm (with validation)

Options (add):
  --dry-run                   Preview changes
  --force                     Skip compatibility checks
  --no-auto                   Don't auto-install skill dependencies

Options (remove):
  --keep-config               Remove skill but keep generated config
  --dry-run                   Preview removal

Options (init — scaffolding):
  --template <type>           minimal|full|analyzer-only
  --language <lang>           Pre-fill for language
  --framework <fw>            Pre-fill for framework
```

---

## 11. Design Principles

1. **Composable**: Multiple skills merge cleanly via priority ordering and conflict detection.
2. **Reversible**: Transaction log enables surgical removal without config debris.
3. **Secure**: Additive-only security model — skills can restrict, never relax.
4. **Source-tracked**: Every merged artifact is marked with its origin.
5. **Community-driven**: npm convention + skill scaffolding = low friction for contributors.
6. **Phase 1 integration**: Skills can contribute scoring enhancers via the Tapable hook system.
