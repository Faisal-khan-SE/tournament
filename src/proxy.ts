import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authEnabled, isAuthorised } from '@/lib/auth';

/** Pages that only the organiser/scorer should reach. */
const PROTECTED_PAGES = ['/score/', '/admin', '/match/create', '/tournaments/create'];

/**
 * Gate every write behind the admin session.
 *
 * Reads (GET on the API and every public page) stay open so spectators can
 * follow scores. Everything else — scoring, editing, deleting — needs a valid
 * session; API calls get a 401 and protected pages bounce to the login form.
 */
export async function proxy(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    if (pathname.startsWith('/api/auth/')) return NextResponse.next();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return NextResponse.next();
    if (await isAuthorised(request)) return NextResponse.next();
    return NextResponse.json(
      { success: false, error: 'Sign in as the organiser to make changes', unauthorised: true },
      { status: 401 }
    );
  }

  const protectedPage = PROTECTED_PAGES.some((p) =>
    p.endsWith('/') ? pathname.startsWith(p) : pathname === p
  );
  if (protectedPage && !(await isAuthorised(request))) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/score/:path*', '/admin', '/match/create', '/tournaments/create'],
};
