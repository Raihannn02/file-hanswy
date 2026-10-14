import { NextRequest } from 'next/server';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'hanswy2026';
const AUTH_COOKIE_NAME = 'hanswy_admin_token';
const AUTH_SECRET_TOKEN = 'hanswy_authenticated_admin_session_key_2026';

export function verifyAdminPassword(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

export function getAdminCookieHeader(): string {
  // 30 days session
  const maxAge = 60 * 60 * 24 * 30;
  return `${AUTH_COOKIE_NAME}=${AUTH_SECRET_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function getLogoutCookieHeader(): string {
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function isAdminAuthenticated(req: NextRequest): boolean {
  const cookie = req.cookies.get(AUTH_COOKIE_NAME);
  return cookie?.value === AUTH_SECRET_TOKEN;
}
