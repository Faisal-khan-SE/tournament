import { NextResponse } from 'next/server';
import { AUTH_COOKIE, authEnabled, passwordMatches, sessionCookieOptions, sessionToken } from '@/lib/auth';

export async function POST(request: Request) {
  if (!authEnabled()) {
    return NextResponse.json({ success: true, message: 'Authentication is not enabled' });
  }

  const body = await request.json().catch(() => ({}));
  if (!passwordMatches(body.password)) {
    return NextResponse.json({ success: false, error: 'Incorrect password' }, { status: 401 });
  }

  const token = await sessionToken();
  const res = NextResponse.json({ success: true, message: 'Signed in' });
  res.cookies.set(AUTH_COOKIE, token!, sessionCookieOptions(request));
  return res;
}
