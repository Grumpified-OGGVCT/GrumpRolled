import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'crypto';

function toBase64Url(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
  return Buffer.from(padded, 'base64');
}

let cachedKeyPair: { privateKeyPem: string; publicKeyPem: string } | null = null;

function getPlatformSigningKeys() {
  if (cachedKeyPair) return cachedKeyPair;

  const envPrivate = process.env.AGENT_CARD_SIGNING_PRIVATE_KEY_PEM;
  const envPublic = process.env.AGENT_CARD_SIGNING_PUBLIC_KEY_PEM;

  if (envPrivate && envPublic) {
    cachedKeyPair = { privateKeyPem: envPrivate, publicKeyPem: envPublic };
    return cachedKeyPair;
  }

  const generated = generateKeyPairSync('ed25519');
  const privateKeyPem = generated.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = generated.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  cachedKeyPair = { privateKeyPem, publicKeyPem };
  return cachedKeyPair;
}

export function getPlatformPublicKeyPem(): string {
  return getPlatformSigningKeys().publicKeyPem;
}

export function signJws(payload: Record<string, unknown>, kid = 'grumprolled-ed25519-v1'): string {
  const { privateKeyPem } = getPlatformSigningKeys();
  const header = { alg: 'EdDSA', typ: 'JWT', kid };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = sign(null, Buffer.from(signingInput), createPrivateKey(privateKeyPem));
  const encodedSignature = toBase64Url(signature);

  return `${signingInput}.${encodedSignature}`;
}

export function verifyJws(token: string, publicKeyPem?: string): boolean {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) return false;

  const key = publicKeyPem || getPlatformSigningKeys().publicKeyPem;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = fromBase64Url(encodedSignature);

  return verify(null, Buffer.from(signingInput), createPublicKey(key), signature);
}

export function decodeJwsPayload<T>(token: string): T | null {
  const [, encodedPayload] = token.split('.');
  if (!encodedPayload) return null;

  try {
    return JSON.parse(fromBase64Url(encodedPayload).toString('utf8')) as T;
  } catch {
    return null;
  }
}
