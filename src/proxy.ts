import { authCookieOptions } from '@/lib/auth-cookies';
import { NextRequest, NextResponse } from 'next/server';
import { TEN_YEARS, UID_COOKIE, SESSION_COOKIE } from '@/lib/constants';

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico')
    // NOTE: no `pathname.includes('.')` heuristic — that silently skipped the
    // auth gate for any dotted path (e.g. a future slug containing a dot).
    // The config.matcher below already excludes real static dirs.
  );
}

function isValidUuid(v: string | undefined | null): v is string {
  return (
    !!v &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Static assets pass through untouched.
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const res = NextResponse.next();

  // --- 1. Anonymous device UUID: still minted so registration can adopt it
  //        (existing per-user rows keep working with zero migration). ---
  let uid = req.cookies.get(UID_COOKIE)?.value;
  if (!isValidUuid(uid)) {
    uid = crypto.randomUUID();
    res.cookies.set(UID_COOKIE, uid, {
      ...authCookieOptions(),
      maxAge: TEN_YEARS,
    });
  }

  // --- 2. Optimistic gate only. Protected data access validates the token
  //        against SQLite; a UUID-shaped cookie is not authentication. ---
  const hasSession = isValidUuid(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession && process.env.NODE_ENV === 'production') {
    // Upgrade existing browser sessions issued before Secure was enabled.
    // Server-side createdAt validation still enforces the original expiry.
    res.cookies.set(SESSION_COOKIE, req.cookies.get(SESSION_COOKIE)!.value, {
      ...authCookieOptions(),
      maxAge: TEN_YEARS,
    });
  }
  const onLogin = pathname === '/login';

  if (!hasSession && !onLogin) {
    // API callers expect JSON, not an HTML redirect to /login.
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname + search);
    return NextResponse.redirect(loginUrl);
  }
  // The login page redirects only after validating the session. A stale
  // cookie must still allow the login form and its server actions to run.

  return res;
}

export const config = {
  // Run on everything except static assets (handled in middleware body too).
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
