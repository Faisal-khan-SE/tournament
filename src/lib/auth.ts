/**
 * Admin authentication.
 *
 * The platform has one scorer/organiser role. Access is a single password set
 * in `ADMIN_PASSWORD`; a correct login stores an HMAC-derived token in an
 * HttpOnly cookie, and API clients can send the password directly as a Bearer
 * token instead. Reads stay public — anyone can follow a live score — while
 * every write (scoring, editing, deleting) needs the cookie or header.
 *
 * With `ADMIN_PASSWORD` unset the site runs open, as before, so a laptop at
 * the ground works with no setup. That only makes sense on a private network;
 * set the password before exposing the app to the internet.
 *
 * Only Web Crypto is used here because the middleware runs on the edge runtime.
 */

export const AUTH_COOKIE = 'tb_admin';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function adminPassword(): string | null {
  const value = process.env.ADMIN_PASSWORD?.trim();
  return value ? value : null;
}

export function authEnabled(): boolean {
  return adminPassword() !== null;
}

/** Stable token for the current password, so changing it logs everyone out. */
export async function sessionToken(): Promise<string | null> {
  const password = adminPassword();
  if (!password) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('tapeball-admin-session'));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function passwordMatches(candidate: string | null | undefined): boolean {
  const password = adminPassword();
  if (!password || !candidate) return false;
  return timingSafeEqual(candidate, password);
}

/** Whether a request carries a valid admin session (cookie or Bearer password). */
export async function isAuthorised(request: Request): Promise<boolean> {
  if (!authEnabled()) return true;

  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    if (passwordMatches(auth.slice(7).trim())) return true;
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${AUTH_COOKIE}=`));
  if (!match) return false;

  const expected = await sessionToken();
  return expected !== null && timingSafeEqual(decodeURIComponent(match.slice(AUTH_COOKIE.length + 1)), expected);
}

export function sessionCookieOptions(request: Request) {
  const secure = new URL(request.url).protocol === 'https:';
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  };
}
