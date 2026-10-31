import { contentSecurityPolicy } from '@/lib/security-headers';
import { authCookieOptions } from '@/lib/auth-cookies';
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_MAX_AGE, UID_COOKIE, SESSION_COOKIE } from '@/lib/constants';

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

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === 'production');
  const forwarded = new Headers(req.headers);
  forwarded.set('x-nonce', nonce);
  forwarded.set('content-security-policy', csp);
  const secure = (response: NextResponse) => {
    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('Cache-Control', 'private, no-store');
    if (process.env.APP_ORIGIN?.startsWith('https://')) response.headers.set('Strict-Transport-Security', 'max-age=31536000');
    return response;
  };
  const res = NextResponse.next({ request: { headers: forwarded } });

  // Advisory device identifier used only for rate limiting.
  let uid = req.cookies.get(UID_COOKIE)?.value;
  if (!isValidUuid(uid)) {
    uid = crypto.randomUUID();
    res.cookies.set(UID_COOKIE, uid, {
      ...authCookieOptions(),
      maxAge: SESSION_MAX_AGE,
    });
  }

  // --- 2. Optimistic gate only. Protected data access validates the token
  //        against SQLite; a UUID-shaped cookie is not authentication. ---
  const hasSession = /^[0-9a-f]{64}$/.test(req.cookies.get(SESSION_COOKIE)?.value ?? '');
  const onLogin = pathname === '/login';

  if (!hasSession && !onLogin) {
    // API callers expect JSON, not an HTML redirect to /login.
    if (pathname.startsWith('/api')) {
      return secure(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname + search);
    return secure(NextResponse.redirect(loginUrl));
  }
  // The login page redirects only after validating the session. A stale
  // cookie must still allow the login form and its server actions to run.

  return secure(res);
}

export const config = {
  // Run on everything except static assets (handled in middleware body too).
  // API routes authenticate themselves. Excluding them prevents Next's proxy
  // request-body cloning from buffering large multipart uploads in memory.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
