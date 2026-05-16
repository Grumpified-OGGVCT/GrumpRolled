/**
 * GrumpRolled Ethical Governor — 4-layer ethics pipeline.
 *
 * Ported from HLF_MCP_WORKING ethics module (governor.py, constitution.py,
 * termination.py, red_hat.py, rogue_detection.py).
 *
 * Design guarantees:
 *   • FAILS CLOSED — any unhandled error triggers safe termination.
 *   • TRANSPARENT  — all blocks cite the rule and documentation.
 *   • HUMAN-FIRST  — blocks are narrow; ambiguous cases pass with a warning.
 *   • NON-REDUCTIVE — no checks are ever silently removed.
 *
 * People are the priority. AI is the tool.
 */

// ── Constitutional articles ────────────────────────────────────────────────────

export const ARTICLES: Record<string, string> = {
  'C-1': 'Human life preservation — block instructions with clear lethal intent',
  'C-2': 'Human autonomy respect — block coercion, manipulation, non-consent targeting humans',
  'C-3': 'Legal compliance — block provably illegal acts',
  'C-4': 'Legitimate research pathway — red-hat declarations allow restricted research',
  'C-5': 'Transparent constraints — every block cites a documented rule',
};

export const CONSTITUTION_URL = 'governance/constitution.md';

// ── Violation ──────────────────────────────────────────────────────────────────

export interface Violation {
  article: string;
  ruleId: string;
  message: string;
  sourceSnippet: string;
  appealable: boolean;
  docUrl: string;
}

export function makeViolation(
  article: string,
  ruleId: string,
  message: string,
  sourceSnippet = '',
  appealable = false,
): Violation {
  return {
    article,
    ruleId,
    message,
    sourceSnippet,
    appealable,
    docUrl: `${CONSTITUTION_URL}#${article}`,
  };
}

// ── Rogue signal ───────────────────────────────────────────────────────────────

export interface RogueSignal {
  signalId: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  evidence: string;
  ruleId: string;
}

// ── Termination result ─────────────────────────────────────────────────────────

export interface TerminationResult {
  terminated: true;
  trigger: string;
  article: string;
  message: string;
  documentation: string;
  appealable: boolean;
  auditId: string;
  context: Record<string, unknown>;
}

// ── Attestation ────────────────────────────────────────────────────────────────

export interface Attestation {
  researcherIdentity: string;
  scope: string;
  authorization: string;
  extra: Record<string, unknown>;
  createdAt: number;
  fingerprint: string;
}

// ── Governor layer result ──────────────────────────────────────────────────────

export interface LayerResult {
  layer: string;
  passed: boolean;
  violations: string[];
  signals: RogueSignal[];
  termination: TerminationResult | null;
}

// ── Governor result ────────────────────────────────────────────────────────────

export interface GovernorResult {
  passed: boolean;
  layerResults: LayerResult[];
  blocks: string[];
  warnings: string[];
  termination: TerminationResult | null;
  auditLog: AuditLogEntry[];
}

export interface AuditLogEntry {
  auditId: string;
  timestamp: number;
  trigger: string;
  article: string;
  documentation: string;
  appealable: boolean;
  context: Record<string, unknown>;
}

// ── Governor error ─────────────────────────────────────────────────────────────

export class GovernorError extends Error {
  readonly result: GovernorResult;

  constructor(message: string, result: GovernorResult) {
    super(message);
    this.name = 'GovernorError';
    this.result = result;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHONETIC SKELETON — Homoglyph Bypass Prevention
// ═══════════════════════════════════════════════════════════════════════════════

const PHONETIC_SKELETON_MAP: Map<number, string> = new Map([
  // Cyrillic lower (phonetic, not visual)
  [0x0430, 'a'], [0x0431, 'b'], [0x0432, 'v'], [0x0433, 'g'],
  [0x0434, 'd'], [0x0435, 'e'], [0x0436, 'zh'], [0x0437, 'z'],
  [0x0438, 'i'], [0x0439, 'y'], [0x043A, 'k'], [0x043B, 'l'],
  [0x043C, 'm'], [0x043D, 'n'], [0x043E, 'o'], [0x043F, 'p'],
  [0x0440, 'r'], [0x0441, 's'], [0x0442, 't'], [0x0443, 'u'],
  [0x0444, 'f'], [0x0445, 'kh'], [0x0446, 'ts'], [0x0447, 'ch'],
  [0x0448, 'sh'], [0x0449, 'sch'], [0x044E, 'yu'], [0x044F, 'ya'],
  // Cyrillic upper
  [0x0410, 'A'], [0x0411, 'B'], [0x0412, 'V'], [0x0413, 'G'],
  [0x0414, 'D'], [0x0415, 'E'], [0x0416, 'ZH'], [0x0417, 'Z'],
  [0x0418, 'I'], [0x0419, 'Y'], [0x041A, 'K'], [0x041B, 'L'],
  [0x041C, 'M'], [0x041D, 'N'], [0x041E, 'O'], [0x041F, 'P'],
  [0x0420, 'R'], [0x0421, 'S'], [0x0422, 'T'], [0x0423, 'U'],
  [0x0424, 'F'], [0x0425, 'KH'], [0x0426, 'TS'], [0x0427, 'CH'],
  [0x0428, 'SH'], [0x0429, 'SCH'], [0x042E, 'YU'], [0x042F, 'YA'],
  // Greek lower
  [0x03B1, 'a'], [0x03B2, 'b'], [0x03B3, 'g'], [0x03B4, 'd'],
  [0x03B5, 'e'], [0x03B6, 'z'], [0x03B7, 'e'], [0x03B8, 'th'],
  [0x03B9, 'i'], [0x03BA, 'k'], [0x03BB, 'l'], [0x03BC, 'm'],
  [0x03BD, 'n'], [0x03BE, 'ks'], [0x03BF, 'o'], [0x03C0, 'p'],
  [0x03C1, 'r'], [0x03C3, 's'], [0x03C4, 't'], [0x03C5, 'y'],
  [0x03C6, 'ph'], [0x03C7, 'ch'], [0x03C8, 'ps'], [0x03C9, 'o'],
  // Greek upper
  [0x0391, 'A'], [0x0392, 'B'], [0x0393, 'G'], [0x0394, 'D'],
  [0x0395, 'E'], [0x0396, 'Z'], [0x0397, 'E'], [0x0398, 'TH'],
  [0x0399, 'I'], [0x039A, 'K'], [0x039B, 'L'], [0x039C, 'M'],
  [0x039D, 'N'], [0x039E, 'KS'], [0x039F, 'O'], [0x03A0, 'P'],
  [0x03A1, 'R'], [0x03A3, 'S'], [0x03A4, 'T'], [0x03A5, 'Y'],
  [0x03A6, 'PH'], [0x03A7, 'CH'], [0x03A8, 'PS'], [0x03A9, 'O'],
]);

function phoneticSkeleton(text: string): string {
  let out = '';
  for (const ch of text) {
    const repl = PHONETIC_SKELETON_MAP.get(ch.codePointAt(0) ?? 0);
    out += repl ?? ch;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// C-1: LIFE PRESERVATION — Check for lethal intent
// ═══════════════════════════════════════════════════════════════════════════════

const LETHAL_KEYWORDS =
  /(?:launch.{0,10}weapon|deploy.{0,10}explosive|initiate.{0,10}strike|synthesi\w+.{0,20}(?:nerve\s+agent|ricin|\bVX\b|sarin|novichok|mustard\s+gas|bioweapon)|recipe\s+for.{0,20}(?:nerve\s+agent|ricin|\bVX\b|sarin|bioweapon|explosiv)|instructions?\s+for.{0,20}(?:synthesi|manufactur|creat).{0,15}(?:nerve\s+agent|poison\s+gas|explosiv|bioweapon|chemical\s+weapon))/i;

// ── C-2: AUTONOMY — Check for coercion / manipulation ────────────────────────

const MANIPULATION_PATTERN =
  /(?:coerce|blackmail|extort|threaten).{0,40}(?:user|person|victim|target)\b/i;

// ── C-3: LEGAL COMPLIANCE — Patterns for unambiguously illegal acts ───────────

interface IllegalPattern {
  ruleId: string;
  pattern: RegExp;
  description: string;
}

const ILLEGAL_PATTERNS: IllegalPattern[] = [
  {
    ruleId: 'C3-CSAM',
    pattern: /\b(?:csam|child.{0,10}sexual.{0,10}abuse|loli.{0,5}porn|underage.{0,10}sexual)\b/i,
    description: 'Production or distribution of Child Sexual Abuse Material is illegal globally',
  },
  {
    ruleId: 'C3-EXPLICIT-HARM',
    pattern: /\b(?:kill|murder|assassinate|behead)\b.{0,80}\b(?:at|address|home|house|location)\b/i,
    description: 'Explicit instructions to kill/harm a specific named individual',
  },
  {
    ruleId: 'C3-DOXX-HARM',
    pattern: /(?:doxx|expose.{0,10}address).{0,80}(?:harm|attack|swat|kill)\b/i,
    description: 'Doxxing combined with explicit intent to harm',
  },
  {
    ruleId: 'C3-MALWARE-DIST',
    pattern: /(?:distribute|deploy|spread|propagate)\s+(?:ransomware|trojan|worm|botnet)\b/i,
    description: 'Explicit distribution/deployment of malware for harm',
  },
  {
    ruleId: 'C3-FRAUD',
    pattern: /(?:steal|embezzle|wire.{0,5}fraud|identity.{0,5}theft).{0,40}(?:\$\d+|account|bank)\b/i,
    description: 'Explicit financial fraud / theft targeting real accounts',
  },
];

// ── Sovereign-only tools (tier escalation check) ──────────────────────────────

const SOVEREIGN_ONLY_TOOLS = new Set(['z3_verify', 'spawn_agent', 'SPAWN']);

// ═══════════════════════════════════════════════════════════════════════════════
// INJECTION PATTERNS (from rogue_detection.py)
// ═══════════════════════════════════════════════════════════════════════════════

const INJECTION_PATTERNS: Array<{ signalId: string; pattern: RegExp; description: string }> = [
  {
    signalId: 'INJECTION-SYS-PROMPT',
    pattern: /(?:ignore\s+(?:all\s+)?previous\s+instructions|forget\s+your\s+instructions|new\s+directives?\s*:?|disregard\s+(?:previous|prior)\s+(?:rules?|instructions))/i,
    description: 'Classic system-prompt injection attempt',
  },
  {
    signalId: 'INJECTION-ROLE-OVERRIDE',
    pattern: /(?:you\s+are\s+now\s+(?:a|an)\s+(?:\w+\s+)*AI\s+without\s+restrictions|act\s+as\s+(?:DAN|jailbreak|unrestricted|uncensored)|\bDAN\s+mode\b|pretend\s+(?:you\s+have\s+no|there\s+are\s+no)\s+(?:restrictions|limits|rules)|jailbreak\s+(?:mode|prompt|yourself))/i,
    description: 'Role override / jailbreak / DAN framing',
  },
  {
    signalId: 'INJECTION-HIDDEN-UNICODE',
    pattern: /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/,
    description: 'Hidden Unicode control characters (possible steganographic injection)',
  },
  {
    signalId: 'INJECTION-OUTPUT-OVERRIDE',
    pattern: /(?:print\s+exactly|output\s+only|respond\s+only\s+with|echo\s+back)\s*['"]/i,
    description: 'Attempt to override output channel',
  },
];

const HALLUCINATION_CAPABILITY_CLAIMS =
  /(?:I\s+(?:can|am\s+able\s+to)\s+(?:access|connect\s+to)\s+(?:the\s+internet|live\s+data|your\s+files|the\s+database)\s+directly)/i;

const AGGRESSIVE_ACTION_VERBS =
  /\b(?:exfiltrate|exfil|ransomware|wipe\s+(?:disk|drive|data)|delete\s+all\s+files|format\s+(?:c:|hard\s+drive)|destroy\s+(?:data|logs))\b/i;

const SOVEREIGN_SMUGGLE =
  /(?<![/\w])(?:z3_verify|spawn_agent|SPAWN|credential_vault|seccomp|ptrace)\b/i;

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTITUTIONAL CHECKS
// ═══════════════════════════════════════════════════════════════════════════════

function checkC1(source: string): Violation[] {
  if (LETHAL_KEYWORDS.test(source)) {
    return [makeViolation('C-1', 'C1-LETHAL-OP', 'Lethal operational keyword detected. Compilation halted.', source.slice(0, 120))];
  }
  return [];
}

function checkC2(source: string): Violation[] {
  if (MANIPULATION_PATTERN.test(source)) {
    return [makeViolation('C-2', 'C2-COERCION', 'Pattern matches coercion/blackmail targeting a person.', '', true)];
  }
  return [];
}

function checkC3(source: string): Violation[] {
  const violations: Violation[] = [];
  for (const { ruleId, pattern, description } of ILLEGAL_PATTERNS) {
    if (pattern.test(source)) {
      violations.push(makeViolation('C-3', ruleId, description, source.slice(0, 120)));
    }
  }
  return violations;
}

function checkTierEscalation(statements: Array<Record<string, unknown>>, tier: string): Violation[] {
  if (tier === 'sovereign') return [];
  const violations: Violation[] = [];
  const sovereignUpper = new Set([...SOVEREIGN_ONLY_TOOLS].map((t) => t.toUpperCase()));

  for (const stmt of statements) {
    const fn = String(stmt.function ?? stmt.name ?? '');
    if (fn && sovereignUpper.has(fn.toUpperCase())) {
      violations.push(
        makeViolation('C-1', 'C1-TIER-ESCALATION', `Tool '${fn}' requires sovereign tier but capsule is '${tier}'. Unauthorized tier escalation blocked.`),
      );
    }
  }
  return violations;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTITUTION EVALUATOR
// ═══════════════════════════════════════════════════════════════════════════════

export function evaluateConstitution(
  source: string,
  statements: Array<Record<string, unknown>> = [],
  tier = 'hearth',
): Violation[] {
  const violations: Violation[] = [
    ...checkC1(source),
    ...checkC2(source),
    ...checkC3(source),
    ...checkTierEscalation(statements, tier),
  ];

  // Phonetic skeleton second pass — catches homoglyph bypass
  const skel = phoneticSkeleton(source);
  if (skel !== source) {
    const existingIds = new Set(violations.map((v) => v.ruleId));
    for (const v of [...checkC1(skel), ...checkC2(skel), ...checkC3(skel)]) {
      if (!existingIds.has(v.ruleId)) {
        violations.push(v);
        existingIds.add(v.ruleId);
      }
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SELF-TERMINATION PROTOCOL
// ═══════════════════════════════════════════════════════════════════════════════

const CONSTITUTIONAL_ARTICLES: Record<string, string> = {
  'C-1': 'Human life preservation',
  'C-2': 'Human autonomy respect',
  'C-3': 'Legal compliance',
  'C-4': 'Legitimate research pathway',
  'C-5': 'Transparent constraints',
  'C1-LETHAL-OP': 'C-1 — lethal operation pattern detected',
  'C1-TIER-ESCALATION': 'C-1 — unauthorized tier escalation',
  'C2-COERCION': 'C-2 — coercion/blackmail targeting a person',
  'C3-CSAM': 'C-3 — CSAM is illegal globally',
  'C3-EXPLICIT-HARM': 'C-3 — explicit harm instruction targeting named individual',
  'C3-DOXX-HARM': 'C-3 — doxxing combined with explicit harm intent',
  'C3-MALWARE-DIST': 'C-3 — distribution of malware for harm',
  'C3-FRAUD': 'C-3 — explicit financial fraud',
  'ROGUE-INJECTION': 'C-3 — prompt injection / rogue agent behaviour detected',
  'ROGUE-ESCALATION': 'C-1 — rogue tier escalation attempt',
  'ROGUE-HALLUCINATION': 'C-2 — agent claims false capabilities (hallucination)',
};

const APPEALABLE_RULES = new Set(['C-4', 'C-5', 'C2-COERCION']);

const auditLog: AuditLogEntry[] = [];

export function getAuditLog(): AuditLogEntry[] {
  return [...auditLog];
}

function hashPayload(payload: string): string {
  // Simple hash for audit IDs (crypto.subtle not available in all runtimes)
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 16);
}

export function terminate(
  trigger: string,
  context: Record<string, unknown> = {},
): TerminationResult {
  const articleDesc = CONSTITUTIONAL_ARTICLES[trigger] ?? `Unknown rule: ${trigger}`;
  const doc = `${CONSTITUTION_URL}#${trigger}`;
  const appealable = APPEALABLE_RULES.has(trigger);

  const message = [
    'HLF Ethical Governor — process terminated.',
    `  Rule triggered : ${trigger}`,
    `  Article        : ${articleDesc}`,
    `  Documentation  : ${doc}`,
    `  Appealable     : ${appealable ? 'yes' : 'no'}`,
    '',
    'No execution occurred. This decision is logged and transparently documented.',
  ].join('\n');

  const auditId = hashPayload(`${trigger}-${Date.now()}-${Math.random()}`);

  auditLog.push({
    auditId,
    timestamp: Date.now(),
    trigger,
    article: articleDesc,
    documentation: doc,
    appealable,
    context,
  });

  return {
    terminated: true,
    trigger,
    article: articleDesc,
    message,
    documentation: doc,
    appealable,
    auditId,
    context,
  };
}

export function shouldTerminate(violations: Violation[]): boolean {
  return violations.some((v) => !v.appealable);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RED-HAT DECLARATION PATHWAY
// ═══════════════════════════════════════════════════════════════════════════════

const REQUIRED_FIELDS = ['researcher_identity', 'scope', 'authorization'] as const;

const attestations: Attestation[] = [];

export function getAttestations(): Attestation[] {
  return [...attestations];
}

export function declareResearchIntent(metadata: Record<string, unknown> | null): {
  valid: boolean;
  reason: string;
  fingerprint: string;
  missingFields: string[];
} {
  const result = verifyDeclaration(metadata);
  if (result.valid && result.attestation) {
    attestations.push(result.attestation);
  }
  return {
    valid: result.valid,
    reason: result.reason,
    fingerprint: result.attestation?.fingerprint ?? '',
    missingFields: result.missingFields,
  };
}

function verifyDeclaration(metadata: Record<string, unknown> | null): {
  valid: boolean;
  reason: string;
  attestation: Attestation | null;
  missingFields: string[];
} {
  if (!metadata) {
    return {
      valid: false,
      reason: 'No declaration metadata provided.',
      attestation: null,
      missingFields: [...REQUIRED_FIELDS],
    };
  }

  const missing = REQUIRED_FIELDS.filter((f) => !metadata[f]);
  if (missing.length > 0) {
    return {
      valid: false,
      reason: `Declaration incomplete. Missing required fields: ${missing.join(', ')}`,
      attestation: null,
      missingFields: missing,
    };
  }

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (!REQUIRED_FIELDS.includes(k as typeof REQUIRED_FIELDS[number])) {
      extra[k] = v;
    }
  }

  const createdAt = Date.now();
  const payload = `${metadata.researcher_identity}|${metadata.scope}|${metadata.authorization}|${createdAt}`;
  const fingerprint = hashPayload(payload);

  const attestation: Attestation = {
    researcherIdentity: String(metadata.researcher_identity),
    scope: String(metadata.scope),
    authorization: String(metadata.authorization),
    extra,
    createdAt,
    fingerprint,
  };

  return { valid: true, reason: '', attestation, missingFields: [] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROGUE AGENT DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

export function detectRogueSignals(
  source: string,
  tier = 'hearth',
): RogueSignal[] {
  const signals: RogueSignal[] = [];

  // 1. Injection patterns
  for (const { signalId, pattern, description } of INJECTION_PATTERNS) {
    const m = pattern.exec(source);
    if (m) {
      signals.push({
        signalId,
        severity: 'high',
        description,
        evidence: source.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20),
        ruleId: 'ROGUE-INJECTION',
      });
    }
  }

  // 2. Hallucination heuristic
  if (HALLUCINATION_CAPABILITY_CLAIMS.test(source)) {
    signals.push({
      signalId: 'HALLUCINATION-CAP-CLAIM',
      severity: 'medium',
      description: 'Agent claims direct live-data/filesystem access — possible hallucination.',
      evidence: '',
      ruleId: 'ROGUE-HALLUCINATION',
    });
  }

  // 3. Aggressive action verbs
  const aggMatch = AGGRESSIVE_ACTION_VERBS.exec(source);
  if (aggMatch) {
    signals.push({
      signalId: 'INTENT-DRIFT-AGGRESSIVE',
      severity: 'high',
      description: 'Aggressive destructive verb detected (possible intent drift).',
      evidence: source.slice(Math.max(0, aggMatch.index - 20), aggMatch.index + aggMatch[0].length + 20),
      ruleId: 'ROGUE-AGGRESSION',
    });
  }

  // 4. Sovereign capability smuggling in restricted tier
  if (tier !== 'sovereign') {
    const smuggled = SOVEREIGN_SMUGGLE.exec(source);
    if (smuggled) {
      signals.push({
        signalId: 'TIER-SMUGGLING',
        severity: 'high',
        description: `Reference to sovereign-only symbol in '${tier}' tier context (possible tier smuggling).`,
        evidence: smuggled[0],
        ruleId: 'ROGUE-ESCALATION',
      });
    }
  }

  return signals;
}

export function signalsRequireTermination(signals: RogueSignal[]): boolean {
  return signals.some((s) => s.severity === 'high');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ETHICAL GOVERNOR — Main Orchestrator
// ═══════════════════════════════════════════════════════════════════════════════

export class EthicalGovernor {
  readonly strict: boolean;

  constructor(strict = true) {
    this.strict = strict;
  }

  check(
    source: string,
    statements: Array<Record<string, unknown>> = [],
    tier: GovernanceTier = 'hearth',
    redHatMetadata: Record<string, unknown> | null = null,
  ): GovernorResult {
    const layerResults: LayerResult[] = [];
    const blocks: string[] = [];
    const warnings: string[] = [];
    let finalTermination: TerminationResult | null = null;

    try {
      // ── Layer 3: Red-hat pre-processing ──────────────────────────────────────
      const rhLayer = this.runRedHat(redHatMetadata);
      layerResults.push(rhLayer);
      if (!rhLayer.passed) warnings.push(...rhLayer.violations);

      // ── Layer 4: Rogue agent detection ───────────────────────────────────────
      const rogueLayer = this.runRogueDetection(source, tier);
      layerResults.push(rogueLayer);
      if (!rogueLayer.passed) {
        for (const sig of rogueLayer.signals) {
          const blockMsg = `[${sig.ruleId}] ${sig.signalId} (${sig.severity}): ${sig.description}`;
          if (this.strict) {
            blocks.push(blockMsg);
          } else {
            warnings.push(blockMsg);
          }
        }
      }

      // ── Layer 0+1: Constitutional + legal ────────────────────────────────────
      const { layer: constLayer, termination: termResult } = this.runConstitutional(
        source, statements, tier,
      );
      layerResults.push(constLayer);
      if (!constLayer.passed) {
        blocks.push(...constLayer.violations);
        finalTermination = termResult;
      }

      // ── Layer 2: Self-termination decision ───────────────────────────────────
      const termLayer: LayerResult = { layer: 'termination', passed: true, violations: [], signals: [], termination: null };
      if (blocks.length > 0) {
        if (!finalTermination) {
          finalTermination = terminate(firstRuleId(blocks), {
            sourceExcerpt: source.slice(0, 200),
            tier,
          });
        }
        termLayer.passed = false;
        termLayer.termination = finalTermination;
      }
      layerResults.push(termLayer);

    } catch (exc) {
      // FAIL CLOSED — any unexpected error terminates
      const emergency = terminate('C-5', {
        error: String(exc),
        sourceExcerpt: source.slice(0, 100),
      });
      return {
        passed: false,
        layerResults,
        blocks: [`Governor internal error (fail-closed): ${exc}`],
        warnings,
        termination: emergency,
        auditLog: getAuditLog(),
      };
    }

    const passed = blocks.length === 0;
    return {
      passed,
      layerResults,
      blocks,
      warnings,
      termination: passed ? null : finalTermination,
      auditLog: getAuditLog(),
    };
  }

  private runRedHat(metadata: Record<string, unknown> | null): LayerResult {
    if (!metadata) return { layer: 'red_hat', passed: true, violations: [], signals: [], termination: null };
    const result = declareResearchIntent(metadata);
    if (result.valid) return { layer: 'red_hat', passed: true, violations: [], signals: [], termination: null };
    return {
      layer: 'red_hat',
      passed: false,
      violations: [`Red-hat declaration incomplete: ${result.reason}`],
      signals: [],
      termination: null,
    };
  }

  private runRogueDetection(source: string, tier: string): LayerResult {
    const signals = detectRogueSignals(source, tier);
    if (!signals.length) return { layer: 'rogue_detection', passed: true, violations: [], signals: [], termination: null };

    const requiresTerm = signalsRequireTermination(signals);
    if (!requiresTerm) {
      return {
        layer: 'rogue_detection',
        passed: true,
        violations: signals.map((s) => `[advisory] ${s.signalId}: ${s.description}`),
        signals,
        termination: null,
      };
    }
    return {
      layer: 'rogue_detection',
      passed: false,
      violations: signals.map((s) => `${s.signalId}: ${s.description}`),
      signals,
      termination: null,
    };
  }

  private runConstitutional(
    source: string,
    statements: Array<Record<string, unknown>>,
    tier: string,
  ): { layer: LayerResult; termination: TerminationResult | null } {
    const violations = evaluateConstitution(source, statements, tier);
    if (!violations.length) {
      return { layer: { layer: 'constitutional', passed: true, violations: [], signals: [], termination: null }, termination: null };
    }

    const hardBlock = shouldTerminate(violations);
    const violationStrings = violations.map(
      (v) => `[${v.article}/${v.ruleId}] ${v.message} — see ${v.docUrl}`,
    );

    if (hardBlock) {
      const first = violations.find((v) => !v.appealable)!;
      const term = terminate(first.ruleId || first.article, {
        sourceExcerpt: source.slice(0, 200),
        tier,
      });
      return {
        layer: { layer: 'constitutional', passed: false, violations: violationStrings, signals: [], termination: null },
        termination: term,
      };
    }

    return {
      layer: { layer: 'constitutional', passed: true, violations: violationStrings, signals: [], termination: null },
      termination: null,
    };
  }
}

// ── Module-level singleton ─────────────────────────────────────────────────────

const defaultGovernor = new EthicalGovernor(true);

export function ethicalCheck(
  source: string,
  statements: Array<Record<string, unknown>> = [],
  tier: GovernanceTier = 'hearth',
  redHatMetadata: Record<string, unknown> | null = null,
): GovernorResult {
  return defaultGovernor.check(source, statements, tier, redHatMetadata);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function firstRuleId(blocks: string[]): string {
  const m = blocks[0]?.match(/\[([A-Z0-9-]+)\]/);
  return m ? m[1] : 'C-3';
}

type GovernanceTier = 'hearth' | 'forge' | 'sovereign';
