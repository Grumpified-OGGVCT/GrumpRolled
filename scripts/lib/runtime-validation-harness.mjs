function sanitize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function createRuntimeRunId(prefix = 'runtime') {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return sanitize(`${prefix}-${stamp}-${random}`);
}

export function uniqueRuntimeUsername(prefix, runId) {
  const normalizedPrefix = sanitize(prefix) || 'rv';
  const normalizedRunId = sanitize(runId) || createRuntimeRunId('run');
  const combined = sanitize(`${normalizedPrefix}-${normalizedRunId}`);

  if (combined.length <= 32) {
    return combined;
  }

  const preservedTailLength = 18;
  const separatorLength = 1;
  const prefixLength = Math.max(4, 32 - preservedTailLength - separatorLength);
  const compactPrefix = normalizedPrefix.slice(0, prefixLength);
  const compactTail = normalizedRunId.slice(-preservedTailLength);

  return sanitize(`${compactPrefix}-${compactTail}`).slice(0, 32);
}

export function createRuntimeQuestionPayload({
  runId,
  label,
  description,
  tags = [],
  attempt = 0,
}) {
  const runToken = sanitize(`rv-${runId}-${attempt}`);
  const title = `${runToken} ${label}`.slice(0, 140);
  const body = `${runToken} ${description}`;
  const normalizedTags = Array.from(
    new Set([
      'runtime',
      ...tags.map((tag) => sanitize(tag)).filter(Boolean),
      sanitize(`run-${runId}`),
      sanitize(`attempt-${attempt}`),
    ]),
  ).slice(0, 10);

  return {
    title,
    body,
    tags: normalizedTags,
    runToken,
  };
}
