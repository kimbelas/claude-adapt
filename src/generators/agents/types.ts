/**
 * Type definitions for the agent inference system.
 *
 * Agent templates are declarative descriptions of Claude Code
 * slash commands. The inferrer matches templates against detected
 * capabilities and produces concrete command files.
 */

// ---------------------------------------------------------------------------
// Agent template
// ---------------------------------------------------------------------------

/**
 * A step within an agent workflow.
 */
export interface AgentStep {
  /** Step instruction text. May contain `{capability.command}` placeholders. */
  instruction: string;

  /**
   * Optional — step is only included if this capability prefix was detected.
   * Supports exact IDs ("db.prisma") and prefixes ("db").
   */
  ifCapability?: string;
}

/**
 * A declarative agent template that maps to a Claude Code slash command.
 *
 * The inferrer evaluates required capabilities against detected ones
 * and resolves placeholders to produce concrete markdown files.
 */
export interface AgentTemplate {
  /** Unique ID, e.g. "setup", "test", "db". */
  id: string;

  /** The .md filename (without extension), becomes the slash command name. */
  commandName: string;

  /** One-line description shown in the command header. */
  description: string;

  /**
   * Capability prefixes that must be present for this agent to activate.
   * Uses prefix matching — "db" matches "db.prisma", "db.drizzle", etc.
   * ALL entries must match (AND logic).
   */
  requiredCapabilities: string[];

  /**
   * At least one of these capability prefixes must be present.
   * Used alongside requiredCapabilities (OR logic within this list).
   * If both requiredCapabilities and requiredAny are set, BOTH conditions
   * must be satisfied.
   */
  requiredAny?: string[];

  /** Whether this agent accepts $ARGUMENTS from the user. */
  hasArguments?: boolean;

  /** Description of what $ARGUMENTS represents. */
  argumentDescription?: string;

  /** Ordered steps in the workflow. */
  steps: AgentStep[];

  /** Safety constraints for the agent. */
  constraints: string[];

  /**
   * Priority for conflict resolution. Higher priority agents
   * win when two templates produce the same commandName.
   */
  priority: number;
}

// ---------------------------------------------------------------------------
// Command file (inferrer output)
// ---------------------------------------------------------------------------

/**
 * A concrete command file ready to be written to .claude/commands/.
 */
export interface CommandFile {
  /** Filename including extension, e.g. "test.md". */
  filename: string;

  /** Full markdown content of the command. */
  content: string;
}
