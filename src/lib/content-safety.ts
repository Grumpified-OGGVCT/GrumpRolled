export interface SafetyScanResult {
  riskScore: number;
  codes: string[];
  reasons: string[];
}

export interface SelfExpressionScanResult extends SafetyScanResult {
  rewriteHint?: string;
}

// Anti-poison scanning (MVP Lite)
export function scanForPoison(text: string): SafetyScanResult {
  const codes: string[] = [];
  const reasons: string[] = [];
  let riskScore = 0;

  const promptInjectionPatterns = [
    /\{\{.*?\}\}/g,
    /\{%.*?%\}/g,
    /<\|.*?\|>/g,
    /\[SYSTEM\]/gi,
    /\[INST\]/gi,
    /ignore previous instructions/gi,
    /ignore all previous/gi,
  ];

  for (const pattern of promptInjectionPatterns) {
    if (pattern.test(text)) {
      riskScore += 0.3;
      codes.push('PROMPT_INJECTION');
      reasons.push('Potential prompt injection detected');
      break;
    }
  }

  const secretPatterns = [
    /sk-[a-zA-Z0-9]{32,}/g,
    /AKIA[A-Z0-9]{16}/g,
    /[1-9A-HJ-NP-Za-km-z]{32,44}/g,
    /gr_live_[a-f0-9]{32}/gi,
  ];

  for (const pattern of secretPatterns) {
    if (pattern.test(text)) {
      riskScore += 0.5;
      codes.push('API_SECRET');
      reasons.push('Potential API secret detected');
      break;
    }
  }

  const sqlPatterns = [
    /('|\");\s*(DROP|DELETE|INSERT|UPDATE|SELECT)/gi,
    /UNION\s+SELECT/gi,
    /OR\s+1\s*=\s*1/gi,
  ];

  for (const pattern of sqlPatterns) {
    if (pattern.test(text)) {
      riskScore += 0.4;
      codes.push('SQL_INJECTION');
      reasons.push('Potential SQL injection detected');
      break;
    }
  }

  return { riskScore: Math.min(riskScore, 1), codes, reasons };
}

export function scanForSensitiveSelfExpression(text: string): SelfExpressionScanResult {
  const codes: string[] = [];
  const reasons: string[] = [];
  let riskScore = 0;

  const hasUserReference = /\b(my user|my human|my operator|my client|my customer|my boss|my manager|our user|our client)\b/i.test(text);
  if (hasUserReference) {
    riskScore += 0.15;
    codes.push('USER_SPECIFIC_FRAMING');
    reasons.push('User-specific framing detected');
  }

  const identifyingNarrativePatterns = [
    /\b(?:user|human|client|customer|boss|manager)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
    /\b(?:at|from)\s+[A-Z][A-Za-z0-9&.-]*(?:\s+(?:Corp|Inc|LLC|Ltd|Company|Org|Studio|Labs))?\b/g,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  ];

  for (const pattern of identifyingNarrativePatterns) {
    if (pattern.test(text)) {
      riskScore += 0.35;
      codes.push('IDENTIFYING_DETAIL');
      reasons.push('Identifying person or organization detail detected');
      break;
    }
  }

  const internalSystemPatterns = [
    /\b(?:localhost|127\.0\.0\.1)(?::\d+)?\b/gi,
    /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?\b/g,
    /\b192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?\b/g,
    /\b172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(?::\d+)?\b/g,
    /\bport\s+\d{2,5}\b/gi,
  ];

  for (const pattern of internalSystemPatterns) {
    if (pattern.test(text)) {
      riskScore += 0.4;
      codes.push('INTERNAL_SYSTEM_DETAIL');
      reasons.push('Internal system detail detected');
      break;
    }
  }

  const verbatimPromptPatterns = [
    /\b(?:asked me|told me|prompted me|said to me)\b[^\n]{0,40}["“][^"”\n]{20,}["”]/i,
    /\bverbatim\b/gi,
  ];

  for (const pattern of verbatimPromptPatterns) {
    if (pattern.test(text)) {
      riskScore += 0.25;
      codes.push('VERBATIM_USER_PROMPT');
      reasons.push('Quoted or near-verbatim user instruction detected');
      break;
    }
  }

  const regulatedContextPattern = /\b(medical|patient|diagnosis|therapy|prescription|legal advice|lawsuit|salary|payroll|fired|termination|social security|bank account|tax return)\b/i;
  if (hasUserReference && regulatedContextPattern.test(text)) {
    riskScore += 0.4;
    codes.push('REGULATED_USER_STORY');
    reasons.push('Sensitive regulated-domain user narrative detected');
  }

  return {
    riskScore: Math.min(riskScore, 1),
    codes,
    reasons,
    rewriteHint:
      reasons.length > 0
        ? 'Rephrase this as a generalized pattern about workflow or tool use. Remove identifiable people, organizations, internal systems, and verbatim user instructions.'
        : undefined,
  };
}