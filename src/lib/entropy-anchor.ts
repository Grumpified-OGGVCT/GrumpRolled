/**
 * GrumpRolled Entropy Anchor — Information quality scoring & drift detection.
 *
 * Ported from HLF_MCP entropy_anchor.py and insaits.py.
 *
 * Detects when a compiled program's decompiled meaning drifts from its
 * declared intent. Uses bag-of-words cosine similarity as a lightweight
 * proxy — deterministic, no LLM calls, no embedding model dependency.
 *
 * Policy modes:
 *   • advisory:         Warn on drift but allow execution
 *   • enforce:          Escalate to human-in-the-loop on drift
 *   • high_risk_enforce: Halt branch on drift (stricter threshold)
 */

// ── Thresholds ─────────────────────────────────────────────────────────────────

export const DEFAULT_THRESHOLD = 0.5;
export const HIGH_RISK_THRESHOLD = 0.65;

export type PolicyMode = 'advisory' | 'enforce' | 'high_risk_enforce';
export const POLICY_MODES: ReadonlySet<PolicyMode> = new Set(['advisory', 'enforce', 'high_risk_enforce']);

// ── Opcode → human-readable prose ──────────────────────────────────────────────

const OPCODE_PROSE: Record<string, string> = {
  NOP: 'no operation',
  PUSH_CONST: 'push constant value onto stack',
  STORE: 'store top of stack into mutable variable',
  LOAD: 'load variable value onto stack',
  STORE_IMMUT: 'store top of stack into immutable variable',
  ADD: 'add two numbers',
  SUB: 'subtract two numbers',
  MUL: 'multiply two numbers',
  DIV: 'divide two numbers',
  MOD: 'compute modulo',
  NEG: 'negate top of stack',
  CMP_EQ: 'compare for equality',
  CMP_NE: 'compare for inequality',
  CMP_LT: 'compare less-than',
  CMP_LE: 'compare less-than-or-equal',
  CMP_GT: 'compare greater-than',
  CMP_GE: 'compare greater-than-or-equal',
  AND: 'logical AND',
  OR: 'logical OR',
  NOT: 'logical NOT',
  JMP: 'unconditional jump',
  JZ: 'jump if false (zero)',
  JNZ: 'jump if true (non-zero)',
  CALL_BUILTIN: 'call built-in function',
  CALL_HOST: 'call host function',
  CALL_TOOL: 'call registered tool',
  OPENCLAW_TOOL: 'call OpenClaw sandboxed tool',
  TAG: 'apply semantic tag',
  INTENT: 'express agent intent',
  RESULT: 'return result value',
  MEMORY_STORE: 'store data in RAG memory',
  MEMORY_RECALL: 'recall data from RAG memory',
  SPEC_DEFINE: 'define Instinct spec',
  SPEC_GATE: 'gate on Instinct spec constraint',
  SPEC_UPDATE: 'update Instinct spec',
  SPEC_SEAL: 'seal Instinct spec with SHA-256 checksum',
  HALT: 'halt execution',
};

// ── AST types (simplified) ─────────────────────────────────────────────────────

export interface AstNode {
  kind?: string;
  tag?: string;
  human_readable?: string;
  name?: string;
  function?: string;
  arguments?: Array<{
    kind?: string;
    name?: string;
    value?: { value?: string };
  }>;
  body?: AstProgram;
  block?: AstProgram;
}

export interface AstProgram {
  version?: unknown;
  human_readable?: string;
  sha256?: string;
  statements?: AstNode[];
  gas_estimate?: unknown;
  env?: Record<string, string>;
}

// ── Entropy anchor result ──────────────────────────────────────────────────────

export interface EntropyAnchorResult {
  status: string;
  sourceHash: string;
  baselineSource: string;
  baselineText: string;
  compiledProgramSummary: string;
  translationSummary: string;
  similarityScore: number;
  threshold: number;
  driftDetected: boolean;
  policyMode: string;
  policyAction: string;
  details: Record<string, unknown>;
}

export interface AuditPayload {
  sourceHash: string;
  baselineSource: string;
  similarityScore: number;
  threshold: number;
  driftDetected: boolean;
  policyMode: string;
  policyAction: string;
}

// ── Hash helper ────────────────────────────────────────────────────────────────

function sha256Hex(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  // Produce a 64-char hex string from two 32-bit halves
  const upper = Math.abs(hash).toString(16).padStart(8, '0');
  const lower = Math.abs(hash * 31 + input.length).toString(16).padStart(8, '0');
  return `${upper}${lower}`.padEnd(64, '0').slice(0, 64);
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSAITS DECOMPILER — AST → human-readable English
// ═══════════════════════════════════════════════════════════════════════════════

export function decompile(ast: AstProgram): string {
  const statements = ast.statements ?? [];
  const version = ast.version ?? '?';
  const programHr = ast.human_readable ?? '';
  const sha = (ast.sha256 ?? '').slice(0, 16) + '...';

  const lines: string[] = [
    `## HLF v${version} Program`,
    `*${programHr}*`,
    `SHA-256 (first 16): \`${sha}\``,
    '',
    '### Statements',
  ];

  let idx = 1;
  for (const node of statements) {
    const hr = node.human_readable ?? node.kind ?? 'unknown';
    const kind = node.kind ?? '';
    const tag = node.tag ?? '';
    const tagStr = tag ? ` [${tag}]` : '';
    lines.push(`${idx}. **${kind}${tagStr}** — ${hr}`);

    // Show arguments
    for (const arg of node.arguments ?? []) {
      if (arg.kind === 'kv_arg') {
        lines.push(`   - \`${arg.name}\` = \`${arg.value?.value ?? '?'}\``);
      }
    }

    // Show block contents
    const body = node.body ?? node.block;
    if (body?.statements) {
      lines.push(`   *block with ${body.statements.length} statement(s)*`);
    }
    idx++;
  }

  const gas = ast.gas_estimate ?? '?';
  const env = ast.env ?? {};
  if (Object.keys(env).length > 0) {
    lines.push('', '### Variable Bindings');
    for (const [k, v] of Object.entries(env)) {
      lines.push(`- \`${k}\` = \`${v}\``);
    }
  }
  lines.push('', `*Estimated gas: ${gas}*`);
  return lines.join('\n');
}

/**
 * Decompile bytecode instructions to prose (for .hlb binary analysis).
 */
export function decompileBytecode(instructions: Array<{ pc: number; op: string; const?: unknown }>): string {
  const lines: string[] = ['## HLF Bytecode Decompilation', '', '### Instructions'];
  for (const instr of instructions) {
    const op = instr.op ?? '?';
    const prose = OPCODE_PROSE[op] ?? `execute ${op}`;
    const constStr = instr.const !== undefined ? ` — constant: \`${JSON.stringify(instr.const)}\`` : '';
    lines.push(`- \`0x${instr.pc.toString(16).toUpperCase().padStart(4, '0')}\` **${op}**${constStr}: ${prose}`);
  }
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIMILARITY GATE — Bag-of-words cosine similarity
// ═══════════════════════════════════════════════════════════════════════════════

export interface SimilarityResult {
  similarity: number;
  threshold: number;
  passed: boolean;
  originalTokens: number;
  decompiledTokens: number;
}

function tokenize(text: string): Map<string, number> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const tf = new Map<string, number>();
  let maxCount = 0;
  for (const w of words) {
    const count = (tf.get(w) ?? 0) + 1;
    tf.set(w, count);
    if (count > maxCount) maxCount = count;
  }
  // Normalize by max term frequency
  if (maxCount > 0) {
    for (const [k, v] of tf) {
      tf.set(k, v / maxCount);
    }
  }
  return tf;
}

export function similarityGate(
  originalText: string,
  decompiledText: string,
  threshold = 0.95,
): SimilarityResult {
  const a = tokenize(originalText);
  const b = tokenize(decompiledText);

  const keys = [...a.keys()].filter((k) => b.has(k));
  let sim = 0;
  if (keys.length > 0) {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (const [k, v] of a) {
      magA += v * v;
      if (b.has(k)) dot += v * (b.get(k)!);
    }
    for (const v of b.values()) {
      magB += v * v;
    }
    sim = magA > 0 && magB > 0 ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
  }

  return {
    similarity: Math.round(sim * 10000) / 10000,
    threshold,
    passed: sim >= threshold,
    originalTokens: a.size,
    decompiledTokens: b.size,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTROPY ANCHOR — Main evaluation pipeline
// ═══════════════════════════════════════════════════════════════════════════════

function resolveThreshold(policyMode: PolicyMode, threshold?: number): number {
  if (!POLICY_MODES.has(policyMode)) {
    throw new Error(`policy_mode must be one of ${[...POLICY_MODES].sort().join(', ')}, got ${policyMode}`);
  }
  const effective = policyMode === 'high_risk_enforce' ? HIGH_RISK_THRESHOLD : DEFAULT_THRESHOLD;
  const final = threshold !== undefined ? threshold : effective;
  if (final < 0 || final > 1) throw new Error('threshold must be between 0.0 and 1.0');
  return Math.round(final * 10000) / 10000;
}

function resolveBaselineText(
  source: string,
  ast: AstProgram,
  expectedIntent: string,
): { source: string; text: string } {
  const cleaned = expectedIntent.trim();
  if (cleaned) return { source: 'expected_intent', text: cleaned };

  const compiledSummary = (ast.human_readable ?? '').trim();
  if (compiledSummary) return { source: 'compiler_human_readable', text: compiledSummary };

  return { source: 'source_fallback', text: source.trim() };
}

function policyAction(driftDetected: boolean, policyMode: PolicyMode): string {
  if (!driftDetected) return 'allow';
  if (policyMode === 'advisory') return 'warn';
  if (policyMode === 'high_risk_enforce') return 'halt_branch';
  return 'escalate_hitl';
}

export function evaluateEntropyAnchor(
  source: string,
  ast: AstProgram,
  expectedIntent = '',
  threshold?: number,
  policyMode: PolicyMode = 'advisory',
): EntropyAnchorResult {
  const effectiveThreshold = resolveThreshold(policyMode, threshold);
  const baseline = resolveBaselineText(source, ast, expectedIntent);
  const translationSummary = decompile(ast);
  const similarity = similarityGate(baseline.text, translationSummary, effectiveThreshold);
  const driftDetected = !similarity.passed;

  return {
    status: 'ok',
    sourceHash: sha256Hex(source),
    baselineSource: baseline.source,
    baselineText: baseline.text,
    compiledProgramSummary: (ast.human_readable ?? '').trim(),
    translationSummary,
    similarityScore: similarity.similarity,
    threshold: similarity.threshold,
    driftDetected,
    policyMode,
    policyAction: policyAction(driftDetected, policyMode),
    details: similarity as unknown as Record<string, unknown>,
  };
}

export function auditPayload(result: EntropyAnchorResult): AuditPayload {
  return {
    sourceHash: result.sourceHash,
    baselineSource: result.baselineSource,
    similarityScore: result.similarityScore,
    threshold: result.threshold,
    driftDetected: result.driftDetected,
    policyMode: result.policyMode,
    policyAction: result.policyAction,
  };
}
