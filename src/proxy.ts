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

/** Only allow internal redirect targets (prevents open redirect via `next`). */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
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
      path: '/',
      maxAge: TEN_YEARS,
      sameSite: 'lax',
      httpOnly: true,
    });
  }

  // --- 2. Account gate: PRESENCE-CHECK ONLY (Edge middleware cannot touch
  //        SQLite). Real token validation happens server-side in
  //        getSessionUser(); stale tokens degrade to anonymous reads. ---
  const hasSession = isValidUuid(req.cookies.get(SESSION_COOKIE)?.value);
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
  if (hasSession && onLogin) {
    // Already authenticated + hitting /login: bounce to next or root.
    return NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get('next')), req.url));
  }

  return res;
}

export const config = {
  // Run on everything except static assets (handled in middleware body too).
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
