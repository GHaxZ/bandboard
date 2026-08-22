import { NextRequest, NextResponse } from 'next/server';
import { TEN_YEARS, UID_COOKIE, SECRET_COOKIE } from '@/lib/constants';
import { safeEqual } from '@/lib/utils';

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico')
    // NOTE: no `pathname.includes('.')` heuristic — that silently skipped the
    // secret gate for any dotted path (e.g. a future slug containing a dot).
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

  // --- 1. Device UUID: mint if missing (PLAN §5.1.2) ---
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

  // --- 2. Shared secret gate (PLAN §5.1.1) ---
  const secret = process.env.BAND_SECRET;
  if (secret) {
    const provided = req.cookies.get(SECRET_COOKIE)?.value;
    const onUnlock = pathname === '/unlock';

    if (provided === undefined || !safeEqual(provided, secret)) {
      if (!onUnlock) {
        // API callers expect JSON, not an HTML redirect to /unlock.
        if (pathname.startsWith('/api')) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const unlockUrl = req.nextUrl.clone();
        unlockUrl.pathname = '/unlock';
        unlockUrl.searchParams.set('next', pathname + search);
        return NextResponse.redirect(unlockUrl);
      }
      // On /unlock with bad/missing secret: let them see the form.
    } else if (onUnlock) {
      // Already authenticated + hitting /unlock: bounce to next or root.
      return NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get('next')), req.url));
    }
  } else if (pathname === '/unlock') {
    // No secret configured: /unlock is pointless, bounce to root.
    return NextResponse.redirect(new URL('/', req.url));
  }

  return res;
}

export const config = {
  // Run on everything except static assets (handled in middleware body too).
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
