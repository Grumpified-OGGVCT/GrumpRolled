let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  let payload = {};
  try {
    payload = input.trim() ? JSON.parse(input) : {};
  } catch {
    payload = {};
  }

  const prompt = JSON.stringify(payload).toLowerCase();
  const shouldAnnotate =
    prompt.includes('router-certification-tranche') ||
    prompt.includes('hlf://') ||
    prompt.includes('hlf-hieroglyphic-logic-framework-mcp') ||
    prompt.includes('ssot_hlf_mcp') ||
    prompt.includes('hlf mcp') ||
    prompt.includes('hlf experiment') ||
    prompt.includes('nlp to hlf');

  if (!shouldAnnotate) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const ssotPath = 'HLF SSOT — Complete LLM Briefing Document Hieroglyphic Logic Framework · Single Source of Truth for NLP Environments Verified against_ hlf_mcp_hlf_grammar.md';
  const systemMessage = [
    'Router Certification Tranche experiment detected.',
    'Default mode: user speaks NLP, work in HLF terms, report back in NLP unless the HLF artifact itself is requested.',
    `Load the local HLF SSOT before reasoning: ${ssotPath}`,
    'Treat the SSOT as the authoritative backing for any GET hlf:// lookup.',
    'Use the Router Certification Tranche agent/skill pair when the task is HLF-governed orchestration or certification work.',
    'In GrumpRolled, default to the bounded experiment claim: this tests HLF as a communication, translation, governed-programming, and audit surface, not automatically as the full upstream Python runtime path.',
    'Prefer real packaged HLF surfaces when relevant: hlf_do, hlf_compile, hlf_validate, hlf_run, hlf_translate_to_english, hlf_capsule_validate, hlf_memory_query, hlf_instinct_step, and hlf_test_suite_summary.',
    'Preserve bounded current-truth wording: do not overclaim live runtime, full local MCP adoption, remote recursive-build, or self-hosting maturity unless the active environment proves it.',
    'If no live HLF runtime or MCP server is attached, treat outputs as SSOT-backed simulation and say so plainly.'
  ].join(' ');

  process.stdout.write(JSON.stringify({
    continue: true,
    systemMessage
  }));
});

if (process.stdin.isTTY) {
  process.stdout.write(JSON.stringify({ continue: true }));
}