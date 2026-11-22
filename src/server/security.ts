import crypto from 'node:crypto';

const runtimeFallbackSecret = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  return configured && configured.length >= 16 ? configured : runtimeFallbackSecret;
}

export function hashSecret(plainText: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainText, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(plainText: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) {
    return false;
  }
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(plainText, salt, 64);
  if (keyBuf.length !== derivedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function constantTimeCompareStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export interface SessionPayload {
  userId: number;
  regNumber: string;
  role: 'student' | 'admin';
  exp: number;
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>, ttlMs = 24 * 60 * 60 * 1000): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [body, signature] = parts;
  if (!body || !signature) {
    return null;
  }
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(body)
    .digest('base64url');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) {
      return null;
    }
    if (parsed.role !== 'student' && parsed.role !== 'admin') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
