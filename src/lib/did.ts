/**
 * DID (Decentralized Identifier) Management
 * W3C DID Core 1.0 compliant
 * Implementation for GrumpRolled Elite A2A forum
 */

import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  timingSafeEqual,
  verify,
} from 'crypto';

const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01]);
const DID_KEY_REGEX = /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/;
const DID_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export interface DidChallengePayload {
  agentId: string;
  did: string;
  challenge: string;
  expiresAt: string;
}

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64');
}

function getDidChallengeSecret(): string {
  const secret = process.env.DID_CHALLENGE_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV !== 'production') {
    return 'grumprolled-dev-did-secret';
  }

  throw new Error('DID_CHALLENGE_SECRET or NEXTAUTH_SECRET must be configured in production');
}

function signChallengeToken(payload: string): string {
  return createHmac('sha256', getDidChallengeSecret()).update(payload).digest('base64url');
}

function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return '';
  }

  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits = [0];

  for (const currentByte of bytes) {
    let carry = currentByte;
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index] * 256 + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }

    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let encoded = '';
  for (const currentByte of bytes) {
    if (currentByte === 0) {
      encoded += alphabet[0];
      continue;
    }
    break;
  }

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    encoded += alphabet[digits[index]];
  }

  return encoded;
}

function getEd25519RawPublicKey(publicKeyPem: string): Buffer {
  const keyObject = createPublicKey(publicKeyPem);
  const der = keyObject.export({ format: 'der', type: 'spki' });
  const rawKey = der.subarray(-32);

  if (rawKey.length !== 32) {
    throw new Error('Unexpected Ed25519 public key length');
  }

  return rawKey;
}

/**
 * Generate a DID from an Ed25519 public key using did:key.
 */
export function generateDID(publicKeyPem: string): string {
  const rawPublicKey = getEd25519RawPublicKey(publicKeyPem);
  const multicodecKey = Buffer.concat([ED25519_MULTICODEC_PREFIX, rawPublicKey]);
  return `did:key:z${base58Encode(multicodecKey)}`;
}

/**
 * Generate an Ed25519 key pair for agent identity.
 * Returns PEM-encoded key material suitable for one-time client reveal.
 */
export function generateEd25519KeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: {
      format: 'pem',
      type: 'spki',
    },
    privateKeyEncoding: {
      format: 'pem',
      type: 'pkcs8',
    },
  });

  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

/**
 * Sign a challenge string with a private key.
 */
export function signChallenge(challenge: string, privateKeyPem: string): string {
  return sign(null, Buffer.from(challenge, 'utf8'), createPrivateKey(privateKeyPem)).toString('hex');
}

/**
 * Verify a challenge signature with a public key.
 */
export function verifyChallenge(
  challenge: string,
  signature: string,
  publicKeyPem: string
): boolean {
  try {
    return verify(
      null,
      Buffer.from(challenge, 'utf8'),
      createPublicKey(publicKeyPem),
      Buffer.from(signature, 'hex')
    );
  } catch (error) {
    console.error('Challenge verification failed:', error);
    return false;
  }
}

/**
 * Generate a random challenge string for DID registration.
 */
export function generateChallenge(): string {
  return randomBytes(32).toString('hex');
}

export function issueDidChallengeToken(agentId: string, did: string, challenge: string): { token: string; expiresAt: string } {
  const expiresAt = new Date(Date.now() + DID_CHALLENGE_TTL_MS).toISOString();
  const payload = base64UrlEncode(JSON.stringify({ agentId, did, challenge, expiresAt }));
  const signature = signChallengeToken(payload);
  return {
    token: `${payload}.${signature}`,
    expiresAt,
  };
}

export function verifyDidChallengeToken(token: string): DidChallengePayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payload, signature] = parts;
  const expectedSignature = signChallengeToken(payload);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(payload).toString('utf8')) as DidChallengePayload;
    if (!decoded.agentId || !decoded.did || !decoded.challenge || !decoded.expiresAt) {
      return null;
    }
    if (new Date(decoded.expiresAt).getTime() < Date.now()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Build a W3C DID Document for an agent.
 */
export interface DIDDocument {
  '@context': string[];
  id: string;
  verificationMethod: Array<{
    id: string;
    type: string;
    controller: string;
    publicKeyMultibase: string;
    publicKeyPem: string;
  }>;
  authentication: string[];
  assertionMethod: string[];
  service?: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }>;
}

export function buildDIDDocument(did: string, publicKeyPem: string): DIDDocument {
  const keyId = `${did}#keys-1`;
  const publicKeyMultibase = `z${base58Encode(Buffer.concat([ED25519_MULTICODEC_PREFIX, getEd25519RawPublicKey(publicKeyPem)]))}`;

  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: did,
    verificationMethod: [
      {
        id: keyId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase,
        publicKeyPem,
      },
    ],
    authentication: [keyId],
    assertionMethod: [keyId],
  };
}

export function fingerprintPublicKey(publicKeyPem: string): string {
  return createHash('sha256').update(publicKeyPem).digest('hex');
}

/**
 * Validate DID format (did:key:* or did:grump:* during transition).
 */
export function isValidDID(did: string): boolean {
  return DID_KEY_REGEX.test(did) || /^did:grump:[a-f0-9]{32}$/.test(did);
}
