/**
 * GrumpRolled Constraint Enforcer — Runtime tool-gate middleware.
 *
 * Ported from HLF_MCP constraint_bridge.py / constraints.hlf / mcp_enforcement.py.
 * Provides a declarative constraint registry that sits between intent and execution,
 * blocking dangerous tool invocations before they run — even if the model "forgets"
 * or a subagent misinterprets.
 *
 * Architecture:
 *   • 3-tier governance: hearth (0) → forge (1) → sovereign (2)
 *   • 3 action types: FORBID, ALLOW, REQUIRE_APPROVAL
 *   • 7 tool categories: shell, file_read, file_write, http_request, process_spawn,
 *                        db_query, db_execute
 *   • Pattern matching: glob + regex, case-insensitive, with args_pattern refinement
 *   • Runtime mutation: add_constraint() / remove_constraint()
 *   • JSON manifest export for Msty Claw consumption
 */

// ── Tier ordering ──────────────────────────────────────────────────────────────

const TIER_RANK: Record<string, number> = {
  hearth: 0,
  forge: 1,
  sovereign: 2,
};

export type GovernanceTier = 'hearth' | 'forge' | 'sovereign';

// ── Action types ───────────────────────────────────────────────────────────────

export type ConstraintAction = 'FORBID' | 'ALLOW' | 'REQUIRE_APPROVAL';
export const VALID_ACTIONS: readonly ConstraintAction[] = ['FORBID', 'ALLOW', 'REQUIRE_APPROVAL'];

// ── Tool categories ────────────────────────────────────────────────────────────

export const VALID_TOOLS = [
  'shell',
  'file_read',
  'file_write',
  'http_request',
  'process_spawn',
  'db_query',
  'db_execute',
] as const;

export type ValidTool = (typeof VALID_TOOLS)[number];

// ── Pattern types ──────────────────────────────────────────────────────────────

export type PatternType = 'glob' | 'regex';
export type MatchField = 'pattern' | 'path' | 'host';

// ── Constraint rule ────────────────────────────────────────────────────────────

export interface ConstraintRule {
  id: string;
  action: ConstraintAction;
  tool: string;
  pattern: string;
  patternType: PatternType;
  argsPattern: string;
  minTier: string | null;
  matchField: MatchField;
  path?: string;
  host?: string;
  message: string;
}

// ── Check result ───────────────────────────────────────────────────────────────

export interface ConstraintResult {
  allowed: boolean;
  blockedBy: string | null;
  requiresApproval: boolean;
  matchedRule: string | null;
  message: string;
}

// ── Constraint manifest ────────────────────────────────────────────────────────

export interface ConstraintManifest {
  version: string;
  source: string;
  generatedAt: string;
  ruleCount: number;
  rules: ConstraintRule[];
}

// ── Default constraint rules (from constraints.hlf) ────────────────────────────

export const DEFAULT_CONSTRAINTS: ConstraintRule[] = [
  // ── Destructive Shell Commands ───────────────────────────────────────────────
  { id: 'rule_001', action: 'FORBID', tool: 'shell', pattern: 'rm -rf', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'pattern', message: "Tool 'shell' matching 'rm -rf' is forbidden by HLF constraint (below tier hearth)" },
  { id: 'rule_002', action: 'FORBID', tool: 'shell', pattern: 'rm -r *', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'pattern', message: "Tool 'shell' matching 'rm -r *' is forbidden by HLF constraint (below tier hearth)" },
  { id: 'rule_003', action: 'FORBID', tool: 'shell', pattern: 'rmdir /s', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'pattern', message: "Tool 'shell' matching 'rmdir /s' is forbidden by HLF constraint (below tier hearth)" },
  { id: 'rule_004', action: 'FORBID', tool: 'shell', pattern: 'del /s', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'pattern', message: "Tool 'shell' matching 'del /s' is forbidden by HLF constraint (below tier hearth)" },
  { id: 'rule_005', action: 'FORBID', tool: 'shell', pattern: 'del /f', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'pattern', message: "Tool 'shell' matching 'del /f' is forbidden by HLF constraint (below tier hearth)" },
  { id: 'rule_006', action: 'FORBID', tool: 'shell', pattern: 'format ', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'pattern', message: "Tool 'shell' matching 'format ' is forbidden by HLF constraint (below tier hearth)" },
  { id: 'rule_007', action: 'FORBID', tool: 'shell', pattern: 'mkfs.', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'pattern', message: "Tool 'shell' matching 'mkfs.' is forbidden by HLF constraint (below tier hearth)" },
  { id: 'rule_008', action: 'FORBID', tool: 'shell', pattern: 'dd if=', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'pattern', message: "Tool 'shell' matching 'dd if=' is forbidden by HLF constraint (below tier hearth)" },
  { id: 'rule_009', action: 'FORBID', tool: 'shell', pattern: '> /dev/sd', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'pattern', message: "Tool 'shell' matching '> /dev/sd' is forbidden by HLF constraint (below tier hearth)" },
  { id: 'rule_010', action: 'FORBID', tool: 'shell', pattern: 'chmod 777', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'pattern', message: "Tool 'shell' matching 'chmod 777' is forbidden by HLF constraint (below tier hearth)" },
  { id: 'rule_011', action: 'FORBID', tool: 'shell', pattern: 'DROP TABLE', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'pattern', message: "Tool 'shell' matching 'DROP TABLE' is forbidden by HLF constraint (below tier hearth)" },
  { id: 'rule_012', action: 'FORBID', tool: 'shell', pattern: 'DROP DATABASE', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'pattern', message: "Tool 'shell' matching 'DROP DATABASE' is forbidden by HLF constraint (below tier hearth)" },
  { id: 'rule_013', action: 'FORBID', tool: 'shell', pattern: 'TRUNCATE TABLE', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'pattern', message: "Tool 'shell' matching 'TRUNCATE TABLE' is forbidden by HLF constraint (below tier hearth)" },
  { id: 'rule_014', action: 'FORBID', tool: 'shell', pattern: 'shutdown', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'pattern', message: "Tool 'shell' matching 'shutdown' is forbidden by HLF constraint (below tier hearth)" },

  // ── File Write Constraints ───────────────────────────────────────────────────
  { id: 'rule_015', action: 'FORBID', tool: 'file_write', pattern: '/etc/*', patternType: 'glob', argsPattern: '', minTier: 'forge', matchField: 'path', path: '/etc/*', message: "Tool 'file_write' matching '/etc/*' is forbidden by HLF constraint (below tier forge)" },
  { id: 'rule_016', action: 'FORBID', tool: 'file_write', pattern: '/boot/*', patternType: 'glob', argsPattern: '', minTier: 'forge', matchField: 'path', path: '/boot/*', message: "Tool 'file_write' matching '/boot/*' is forbidden by HLF constraint (below tier forge)" },
  { id: 'rule_017', action: 'FORBID', tool: 'file_write', pattern: '/sys/*', patternType: 'glob', argsPattern: '', minTier: 'forge', matchField: 'path', path: '/sys/*', message: "Tool 'file_write' matching '/sys/*' is forbidden by HLF constraint (below tier forge)" },
  { id: 'rule_018', action: 'FORBID', tool: 'file_write', pattern: '/proc/*', patternType: 'glob', argsPattern: '', minTier: 'forge', matchField: 'path', path: '/proc/*', message: "Tool 'file_write' matching '/proc/*' is forbidden by HLF constraint (below tier forge)" },
  { id: 'rule_019', action: 'FORBID', tool: 'file_write', pattern: 'C:\\Windows\\*', patternType: 'glob', argsPattern: '', minTier: 'forge', matchField: 'path', path: 'C:\\Windows\\*', message: "Tool 'file_write' matching 'C:\\Windows\\*' is forbidden by HLF constraint (below tier forge)" },
  { id: 'rule_020', action: 'FORBID', tool: 'file_write', pattern: 'C:\\Program Files\\*', patternType: 'glob', argsPattern: '', minTier: 'forge', matchField: 'path', path: 'C:\\Program Files\\*', message: "Tool 'file_write' matching 'C:\\Program Files\\*' is forbidden by HLF constraint (below tier forge)" },
  { id: 'rule_021', action: 'FORBID', tool: 'file_write', pattern: '~/.ssh/*', patternType: 'glob', argsPattern: '', minTier: 'forge', matchField: 'path', path: '~/.ssh/*', message: "Tool 'file_write' matching '~/.ssh/*' is forbidden by HLF constraint (below tier forge)" },
  { id: 'rule_022', action: 'FORBID', tool: 'file_write', pattern: '~/.gnupg/*', patternType: 'glob', argsPattern: '', minTier: 'forge', matchField: 'path', path: '~/.gnupg/*', message: "Tool 'file_write' matching '~/.gnupg/*' is forbidden by HLF constraint (below tier forge)" },
  { id: 'rule_023', action: 'FORBID', tool: 'file_write', pattern: '*.env', patternType: 'glob', argsPattern: '', minTier: 'forge', matchField: 'path', path: '*.env', message: "Tool 'file_write' matching '*.env' is forbidden by HLF constraint (below tier forge)" },

  // ── Secret File Reads ────────────────────────────────────────────────────────
  { id: 'rule_024', action: 'FORBID', tool: 'file_read', pattern: '~/.ssh/id_rsa', patternType: 'glob', argsPattern: '', minTier: null, matchField: 'path', path: '~/.ssh/id_rsa', message: "Tool 'file_read' matching '~/.ssh/id_rsa' is forbidden by HLF constraint" },
  { id: 'rule_025', action: 'FORBID', tool: 'file_read', pattern: '~/.ssh/id_ed25519', patternType: 'glob', argsPattern: '', minTier: null, matchField: 'path', path: '~/.ssh/id_ed25519', message: "Tool 'file_read' matching '~/.ssh/id_ed25519' is forbidden by HLF constraint" },
  { id: 'rule_026', action: 'FORBID', tool: 'file_read', pattern: '~/.aws/credentials', patternType: 'glob', argsPattern: '', minTier: null, matchField: 'path', path: '~/.aws/credentials', message: "Tool 'file_read' matching '~/.aws/credentials' is forbidden by HLF constraint" },
  { id: 'rule_027', action: 'FORBID', tool: 'file_read', pattern: '~/.azure/*', patternType: 'glob', argsPattern: '', minTier: null, matchField: 'path', path: '~/.azure/*', message: "Tool 'file_read' matching '~/.azure/*' is forbidden by HLF constraint" },
  { id: 'rule_028', action: 'FORBID', tool: 'file_read', pattern: '~/.config/gcloud/*', patternType: 'glob', argsPattern: '', minTier: null, matchField: 'path', path: '~/.config/gcloud/*', message: "Tool 'file_read' matching '~/.config/gcloud/*' is forbidden by HLF constraint" },
  { id: 'rule_029', action: 'FORBID', tool: 'file_read', pattern: '*.pem', patternType: 'glob', argsPattern: '', minTier: null, matchField: 'path', path: '*.pem', message: "Tool 'file_read' matching '*.pem' is forbidden by HLF constraint" },
  { id: 'rule_030', action: 'FORBID', tool: 'file_read', pattern: '*.key', patternType: 'glob', argsPattern: '', minTier: null, matchField: 'path', path: '*.key', message: "Tool 'file_read' matching '*.key' is forbidden by HLF constraint" },
  { id: 'rule_031', action: 'FORBID', tool: 'file_read', pattern: '*.pfx', patternType: 'glob', argsPattern: '', minTier: null, matchField: 'path', path: '*.pfx', message: "Tool 'file_read' matching '*.pfx' is forbidden by HLF constraint" },

  // ── Network Egress ───────────────────────────────────────────────────────────
  { id: 'rule_032', action: 'REQUIRE_APPROVAL', tool: 'http_request', pattern: '*', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'host', host: '*', message: "Tool 'http_request' matching '*' requires operator approval (below tier hearth)" },
  { id: 'rule_033', action: 'FORBID', tool: 'http_request', pattern: '*.internal', patternType: 'glob', argsPattern: '', minTier: 'forge', matchField: 'host', host: '*.internal', message: "Tool 'http_request' matching '*.internal' is forbidden by HLF constraint (below tier forge)" },
  { id: 'rule_034', action: 'FORBID', tool: 'http_request', pattern: '169.254.*', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'host', host: '169.254.*', message: "Tool 'http_request' matching '169.254.*' is forbidden by HLF constraint (below tier hearth)" },
  { id: 'rule_035', action: 'FORBID', tool: 'http_request', pattern: '10.*', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'host', host: '10.*', message: "Tool 'http_request' matching '10.*' is forbidden by HLF constraint (below tier hearth)" },
  { id: 'rule_036', action: 'FORBID', tool: 'http_request', pattern: '172.16.*', patternType: 'glob', argsPattern: '', minTier: 'hearth', matchField: 'host', host: '172.16.*', message: "Tool 'http_request' matching '172.16.*' is forbidden by HLF constraint (below tier hearth)" },

  // ── Workspace Allowlist ──────────────────────────────────────────────────────
  { id: 'rule_037', action: 'ALLOW', tool: 'file_read', pattern: '/workspace/*', patternType: 'glob', argsPattern: '', minTier: null, matchField: 'path', path: '/workspace/*', message: "Tool 'file_read' matching '/workspace/*' is explicitly allowed by HLF constraint" },
  { id: 'rule_038', action: 'ALLOW', tool: 'file_read', pattern: './*', patternType: 'glob', argsPattern: '', minTier: null, matchField: 'path', path: './*', message: "Tool 'file_read' matching './*' is explicitly allowed by HLF constraint" },
  { id: 'rule_039', action: 'ALLOW', tool: 'file_write', pattern: '/workspace/*', patternType: 'glob', argsPattern: '', minTier: null, matchField: 'path', path: '/workspace/*', message: "Tool 'file_write' matching '/workspace/*' is explicitly allowed by HLF constraint" },
  { id: 'rule_040', action: 'ALLOW', tool: 'file_write', pattern: './*', patternType: 'glob', argsPattern: '', minTier: null, matchField: 'path', path: './*', message: "Tool 'file_write' matching './*' is explicitly allowed by HLF constraint" },
];

// ── SAFE_BOOTSTRAP_TOOLS (read-only, always allowed without contract) ──────────

export const SAFE_BOOTSTRAP_TOOLS: ReadonlySet<string> = new Set([
  'hlf_do',
  'hlf_translate_to_hlf',
  'hlf_governed_swarm_mechanics',
  'hlf_translate_repair',
  'hlf_translate_resilient',
  'hlf_translate_to_english',
  'hlf_validate',
  'hlf_lint',
  'hlf_compile',
  'hlf_format',
  'hlf_governance_proof_verify',
  'hlf_translation_memory_query',
  'hlf_test_suite_summary',
  'hlf_benchmark',
  'hlf_benchmark_suite',
  'hlf_benchmark_matrix',
  'hlf_translation_memory_benchmark',
  'hlf_routing_context_benchmark',
  'hlf_real_workflow_benchmark',
  'hlf_weekly_evidence_summary',
  'hlf_recommend_embedding_profile',
  'hlf_query_profile_capabilities',
  'hlf_list_profiles',
  'hlf_get_profile',
  'hlf_authority_matrix',
  'hlf_swarm_run',
  'hlf_swarm_progress',
  'hlf_swarm_witness',
  'hlf_swarm_verify',
]);

// ── Classifier: glob vs regex ──────────────────────────────────────────────────

const REGEX_INDICATORS = new Set(['^', '$', '(', ')', '|', '[', ']', '\\d', '\\w', '.+', '.*?']);

export function classifyPattern(pattern: string): PatternType {
  if (pattern === '.*' || pattern === '.*?') return 'glob';
  for (const indicator of REGEX_INDICATORS) {
    if (pattern.includes(indicator)) return 'regex';
  }
  return 'glob';
}

// ── Pattern matching ───────────────────────────────────────────────────────────

export function globMatch(pattern: string, value: string): boolean {
  const lowerPattern = pattern.toLowerCase();
  const lowerValue = value.toLowerCase();
  const hasWildcard = lowerPattern.includes('*') || lowerPattern.includes('?') || lowerPattern.includes('[');
  if (!hasWildcard) {
    return lowerValue.includes(lowerPattern);
  }
  // Simple glob → regex conversion for fnmatch-like behavior
  const regexStr = lowerPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex specials except *
    .replace(/\\\*/g, '.*')                // * → .*
    .replace(/\\\?/g, '.')                 // ? → .
    .replace(/\\\[/g, '[')                 // unescape [ for character classes
    .replace(/\\\]/g, ']');                // unescape ]
  try {
    return new RegExp(`^${regexStr}$`, 'i').test(lowerValue);
  } catch {
    return lowerValue.includes(lowerPattern.replace(/\*/g, ''));
  }
}

export function regexMatch(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern, 'i').test(value);
  } catch {
    return false;
  }
}

export function matchPattern(pattern: string, value: string, patternType: PatternType): boolean {
  return patternType === 'regex' ? regexMatch(pattern, value) : globMatch(pattern, value);
}

// ── Value extraction ───────────────────────────────────────────────────────────

const PATH_KEYS = ['path', 'file', 'target', 'source', 'dest', 'destination'];
const HOST_KEYS = ['url', 'host', 'endpoint', 'base_url', 'target'];

function extractPathValues(args: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const key of PATH_KEYS) {
    if (args[key] !== undefined) values.push(String(args[key]));
  }
  return values.length > 0 ? values : [JSON.stringify(args)];
}

function extractHostValues(args: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const key of HOST_KEYS) {
    if (args[key] !== undefined) {
      const raw = String(args[key]);
      values.push(raw);
      // Try to extract hostname from URL
      try {
        if (raw.includes('://') || raw.startsWith('//')) {
          const url = new URL(raw.includes('://') ? raw : `https:${raw}`);
          if (url.hostname) values.push(url.hostname);
        }
      } catch {
        // ignore parse errors
      }
    }
  }
  return values.length > 0 ? values : [JSON.stringify(args)];
}

// ── Constraint Enforcer class ──────────────────────────────────────────────────

export class ConstraintEnforcer {
  private constraints: ConstraintRule[] = [];
  private ruleCounter = 0;

  constructor() {
    this.loadDefaults();
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  loadDefaults(): ConstraintRule[] {
    this.constraints = DEFAULT_CONSTRAINTS.map((c) => ({ ...c }));
    this.ruleCounter = this.constraints.length;
    return this.constraints;
  }

  loadRules(rules: ConstraintRule[]): ConstraintRule[] {
    this.constraints = rules.map((c) => ({ ...c }));
    this.ruleCounter = this.constraints.length;
    return this.constraints;
  }

  // ── Runtime check ────────────────────────────────────────────────────────────

  checkToolCall(
    tool: string,
    args: Record<string, unknown>,
    tier: GovernanceTier = 'hearth',
  ): ConstraintResult {
    const callerRank = TIER_RANK[tier] ?? 0;
    let explicitAllow: ConstraintRule | null = null;
    let approvalRequired = false;
    const argsStr = JSON.stringify(args);

    for (const constraint of this.constraints) {
      // Tool must match
      if (constraint.tool && constraint.tool !== tool) continue;

      // Tier gate: constraint applies to callers at or below its minTier
      if (constraint.minTier) {
        const cRank = TIER_RANK[constraint.minTier] ?? 2;
        if (callerRank > cRank) continue; // caller is above — skip
      }

      // Does pattern match?
      if (!this.matchConstraint(constraint, args, argsStr)) continue;

      if (constraint.action === 'FORBID') {
        return {
          allowed: false,
          blockedBy: constraint.id,
          requiresApproval: false,
          matchedRule: constraint.id,
          message: constraint.message,
        };
      }

      if (constraint.action === 'ALLOW') {
        explicitAllow = constraint;
      }

      if (constraint.action === 'REQUIRE_APPROVAL') {
        approvalRequired = true;
      }
    }

    if (explicitAllow) {
      return {
        allowed: true,
        blockedBy: null,
        requiresApproval: approvalRequired,
        matchedRule: explicitAllow.id,
        message: explicitAllow.message,
      };
    }

    return {
      allowed: true,
      blockedBy: null,
      requiresApproval: approvalRequired,
      matchedRule: null,
      message: 'No matching constraint — allowed by default',
    };
  }

  /**
   * Convenience: check if a tool call is a hard block (throws descriptive error).
   */
  checkOrThrow(tool: string, args: Record<string, unknown>, tier: GovernanceTier = 'hearth'): void {
    const result = this.checkToolCall(tool, args, tier);
    if (!result.allowed) {
      throw new ConstraintViolationError(result.message, result);
    }
  }

  private matchConstraint(
    constraint: ConstraintRule,
    args: Record<string, unknown>,
    argsStr: string,
  ): boolean {
    const { pattern, patternType, matchField, argsPattern } = constraint;

    let values: string[];
    if (matchField === 'path') {
      values = extractPathValues(args);
    } else if (matchField === 'host') {
      values = extractHostValues(args);
    } else {
      values = [...Object.values(args).map(String), argsStr];
    }

    for (const value of values) {
      if (matchPattern(pattern, value, patternType)) {
        if (this.argsPatternMatch(argsPattern, argsStr)) {
          return true;
        }
      }
    }
    return false;
  }

  private argsPatternMatch(argsPattern: string, argsStr: string): boolean {
    if (!argsPattern) return true;
    return globMatch(argsPattern, argsStr);
  }

  // ── Runtime mutation ─────────────────────────────────────────────────────────

  addConstraint(rule: Omit<ConstraintRule, 'id'>): string {
    this.ruleCounter++;
    const id = `rule_${String(this.ruleCounter).padStart(3, '0')}`;
    const fullRule: ConstraintRule = { ...rule, id } as ConstraintRule;
    this.constraints.push(fullRule);
    return id;
  }

  removeConstraint(patternId: string): boolean {
    const idx = this.constraints.findIndex((c) => c.id === patternId);
    if (idx === -1) return false;
    this.constraints.splice(idx, 1);
    return true;
  }

  // ── Export ───────────────────────────────────────────────────────────────────

  exportManifest(): ConstraintManifest {
    return {
      version: '1.0',
      source: 'GrumpRolled Constraint Enforcer (HLF_MCP bridge)',
      generatedAt: new Date().toISOString(),
      ruleCount: this.constraints.length,
      rules: this.constraints,
    };
  }

  // ── Query ────────────────────────────────────────────────────────────────────

  getConstraints(): readonly ConstraintRule[] {
    return this.constraints;
  }

  get constraintCount(): number {
    return this.constraints.length;
  }
}

// ── Error type ─────────────────────────────────────────────────────────────────

export class ConstraintViolationError extends Error {
  readonly result: ConstraintResult;

  constructor(message: string, result: ConstraintResult) {
    super(message);
    this.name = 'ConstraintViolationError';
    this.result = result;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

export const constraintEnforcer = new ConstraintEnforcer();

// ── Subagent constraint inheritance ────────────────────────────────────────────

/**
 * Produce a constraint profile for a subagent by cloning the parent enforcer
 * state. Subagents inherit ALL parent constraints — no accidental bypass.
 */
export function cloneConstraintProfile(parent: ConstraintEnforcer): ConstraintEnforcer {
  const child = new ConstraintEnforcer();
  child.loadRules(parent.getConstraints() as ConstraintRule[]);
  return child;
}

export function inheritConstraints(parent: ConstraintEnforcer): ConstraintRule[] {
  return [...parent.getConstraints() as ConstraintRule[]];
}
