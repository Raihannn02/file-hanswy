import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAdminPassword,
  getAdminCookieHeader,
  getLogoutCookieHeader,
  isAdminAuthenticated,
} from '@/lib/auth';

export async function GET(req: NextRequest) {
  const isAuth = isAdminAuthenticated(req);
  return NextResponse.json({
    authenticated: isAuth,
    user: isAuth
      ? { name: 'HansWY (Admin)', role: 'admin' }
      : { name: 'GuestUser', role: 'guest' },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { success: false, error: 'Password wajib diisi' },
        { status: 400 }
      );
    }

    if (!verifyAdminPassword(password)) {
      return NextResponse.json(
        { success: false, error: 'Password admin salah' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: 'Login berhasil sebagai Admin HansWY',
      user: { name: 'HansWY (Admin)', role: 'admin' },
    });

    response.headers.set('Set-Cookie', getAdminCookieHeader());
    return response;
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({
    success: true,
    message: 'Logout berhasil',
    user: { name: 'GuestUser', role: 'guest' },
  });

  response.headers.set('Set-Cookie', getLogoutCookieHeader());
  return response;
}
