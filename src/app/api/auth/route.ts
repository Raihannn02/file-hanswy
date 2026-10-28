import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  verifyAdminPassword,
  getAdminCookieHeader,
  getLogoutCookieHeader,
  isAdminAuthenticated,
} from '@/lib/auth';

// Rate Limiter untuk Mencegah Serangan Brute-Force Password
// Menyimpan riwayat percobaan gagal berdasarkan IP
interface AttemptRecord {
  count: number;
  blockedUntil: number;
}

const loginAttempts = new Map<string, AttemptRecord>();
const MAX_ATTEMPTS = 5; // Maksimal 5 kali percobaan gagal
const BLOCK_DURATION_MS = 15 * 60 * 1000; // Diblokir selama 15 menit

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown-ip';
}

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
    const ip = getClientIp(req);
    const now = Date.now();

    // 1. Cek apakah IP sedang diblokir karena terlalu banyak percobaan gagal
    const record = loginAttempts.get(ip);
    if (record && record.blockedUntil > now) {
      const remainingMinutes = Math.ceil((record.blockedUntil - now) / 60000);
      return NextResponse.json(
        {
          success: false,
          error: `Terlalu banyak percobaan login gagal. Akses diblokir sementara demi keamanan. Silakan coba lagi dalam ${remainingMinutes} menit.`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { success: false, error: 'Password wajib diisi.' },
        { status: 400 }
      );
    }

    // 2. Verifikasi password dengan algoritma Scrypt
    const isValid = verifyAdminPassword(password);

    if (!isValid) {
      // Catat percobaan gagal
      const currentCount = record && record.blockedUntil <= now ? 1 : (record?.count || 0) + 1;
      const isBlocked = currentCount >= MAX_ATTEMPTS;
      const blockedUntil = isBlocked ? now + BLOCK_DURATION_MS : 0;

      loginAttempts.set(ip, {
        count: currentCount,
        blockedUntil,
      });

      const remainingAttempts = Math.max(0, MAX_ATTEMPTS - currentCount);

      if (isBlocked) {
        return NextResponse.json(
          {
            success: false,
            error: 'Anda telah 5 kali salah memasukkan password. Demi keamanan, login diblokir selama 15 menit.',
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: `Password admin salah. Sisa percobaan: ${remainingAttempts} kali sebelum diblokir.`,
        },
        { status: 401 }
      );
    }

    // 3. Password benar: Bersihkan catatan percobaan gagal untuk IP ini
    loginAttempts.delete(ip);

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

  response.cookies.delete(AUTH_COOKIE_NAME);
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: '',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  response.headers.set('Set-Cookie', getLogoutCookieHeader());
  return response;
}
