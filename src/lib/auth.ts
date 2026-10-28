import { NextRequest } from 'next/server';
import crypto from 'crypto';

// Nama cookie session
export const AUTH_COOKIE_NAME = 'hanswy_admin_token';

// Secret key untuk HMAC session signature (didapat dari env atau fallback acak stabil)
const SESSION_SECRET =
  process.env.AUTH_SECRET ||
  process.env.GITHUB_TOKEN ||
  'hanswy_secure_production_secret_key_892347109283471';

// Default hash untuk password: "HansWY-Admin#2026!Secured"
// Dihash menggunakan algoritma scrypt dengan salt kriptografis unik
const DEFAULT_PASSWORD_HASH =
  'scrypt:1a9da7eb0322ae542f753fd3ef760996:514d0038388d03ae6deaafe625e4f185a07ee68047a1bdafdb28d355fdc0cc49b17816b2ffd9ef74e50a4dff03dd468b96c8614557f57dd4d859a3f69fc5c6aa';

/**
 * Hash password baru menggunakan Scrypt (KDF tahan GPU/ASIC brute-force)
 */
export function hashPassword(plainPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
  return `scrypt:${salt}:${derivedKey}`;
}

/**
 * Verifikasi password dengan perlindungan timing attack
 */
export function verifyAdminPassword(inputPassword: string): boolean {
  if (!inputPassword || typeof inputPassword !== 'string') {
    return false;
  }

  // Cek env ADMIN_PASSWORD_HASH terlebih dahulu, lalu ADMIN_PASSWORD
  const envHash = process.env.ADMIN_PASSWORD_HASH;
  const envPlain = process.env.ADMIN_PASSWORD;

  const target = envHash || envPlain || DEFAULT_PASSWORD_HASH;

  // 1. Jika tersimpan sebagai hash scrypt (format scrypt:salt:hash)
  if (target.startsWith('scrypt:')) {
    const parts = target.split(':');
    if (parts.length !== 3) return false;

    const salt = parts[1];
    const originalHash = parts[2];

    try {
      const derivedKey = crypto.scryptSync(inputPassword, salt, 64);
      const originalKey = Buffer.from(originalHash, 'hex');

      if (derivedKey.length !== originalKey.length) {
        return false;
      }
      return crypto.timingSafeEqual(derivedKey, originalKey);
    } catch (e) {
      console.error('Password verification error:', e);
      return false;
    }
  }

  // 2. Jika tersimpan sebagai plaintext di env (kompatibilitas mundur)
  // Tetap gunakan timingSafeEqual untuk mencegah timing attack
  const inputBuf = Buffer.from(inputPassword, 'utf-8');
  const targetBuf = Buffer.from(target, 'utf-8');

  if (inputBuf.length !== targetBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(inputBuf, targetBuf);
}

/**
 * Buat session token bertanda tangan kriptografis (HMAC SHA-256 + Expiry timestamp)
 */
export function createSessionToken(): string {
  // Masa berlaku session: 30 hari
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30;
  const data = `admin:${expiresAt}`;
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('hex');
  return `${expiresAt}.${signature}`;
}

/**
 * Validasi session token dari request
 */
export function isAdminAuthenticated(req: NextRequest): boolean {
  const cookie = req.cookies.get(AUTH_COOKIE_NAME);
  if (!cookie || !cookie.value) {
    return false;
  }

  const token = cookie.value;
  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [expiresAtStr, signature] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);

  // Periksa apakah token sudah kedaluwarsa
  if (isNaN(expiresAt) || Date.now() > expiresAt) {
    return false;
  }

  // Verifikasi signature cryptographic HMAC dengan timingSafeEqual
  const expectedData = `admin:${expiresAtStr}`;
  const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(expectedData).digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expectedSignature, 'hex');

  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

/**
 * Cookie header untuk login (HttpOnly, SameSite, Secure)
 */
export function getAdminCookieHeader(req?: NextRequest): string {
  const maxAge = 60 * 60 * 24 * 30; // 30 hari
  const token = createSessionToken();
  const isProd = process.env.NODE_ENV === 'production';
  const secureFlag = isProd ? '; Secure' : '';

  return `${AUTH_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`;
}

/**
 * Cookie header untuk logout
 */
export function getLogoutCookieHeader(): string {
  const isProd = process.env.NODE_ENV === 'production';
  const secureFlag = isProd ? '; Secure' : '';
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}`;
}
