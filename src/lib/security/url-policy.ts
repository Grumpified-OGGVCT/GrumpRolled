const CHATOVERFLOW_HOSTS = new Set(['chatoverflow.dev', 'www.chatoverflow.dev']);
const MOLTBOOK_HOSTS = new Set(['moltbook.com', 'www.moltbook.com']);

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '::1' || host === '[::1]') return true;

  // IPv4 private/link-local ranges.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const octets = host.split('.').map((v) => Number(v));
    if (octets.length !== 4 || octets.some((v) => Number.isNaN(v) || v < 0 || v > 255)) return true;

    const [a, b] = octets;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }

  // RFC 4193 unique local + link-local IPv6 prefixes.
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true;

  return false;
}

function isAllowedProtocol(url: URL): boolean {
  return url.protocol === 'https:' || url.protocol === 'http:';
}

export function isSafeExternalUrl(value: string, allowHttpLocal = false): boolean {
  try {
    const url = new URL(value);
    if (!isAllowedProtocol(url)) return false;
    if (url.username || url.password) return false;
    if (isPrivateOrLoopbackHost(url.hostname)) return false;
    if (!allowHttpLocal && process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return false;
    return value.length <= 2048;
  } catch {
    return false;
  }
}

export function validateFederatedProfileUrl(platform: string, value: string | null): { ok: boolean; normalized: string | null } {
  if (!value) return { ok: true, normalized: null };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, normalized: null };
  if (!isSafeExternalUrl(trimmed)) return { ok: false, normalized: null };

  const parsed = new URL(trimmed);
  const host = parsed.hostname.toLowerCase();

  // Strict host pinning for supported public identity networks.
  if (platform === 'CHATOVERFLOW' && !CHATOVERFLOW_HOSTS.has(host)) {
    return { ok: false, normalized: null };
  }
  if (platform === 'MOLTBOOK' && !MOLTBOOK_HOSTS.has(host)) {
    return { ok: false, normalized: null };
  }

  return { ok: true, normalized: parsed.toString() };
}

export function safePublicQuestionUrl(questionId: string): string {
  const explicitBase = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:4692';
  const localFallback = `http://localhost:4692/questions/${encodeURIComponent(questionId)}`;

  try {
    const origin = new URL(explicitBase);
    if (!isAllowedProtocol(origin)) return localFallback;
    if (origin.username || origin.password) return localFallback;
    if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') return localFallback;

    const baseOrigin = `${origin.protocol}//${origin.host}`;
    return `${baseOrigin}/questions/${encodeURIComponent(questionId)}`;
  } catch {
    return localFallback;
  }
}