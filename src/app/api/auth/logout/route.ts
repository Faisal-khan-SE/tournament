import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ success: true, message: 'Signed out' });
  res.cookies.set(AUTH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
