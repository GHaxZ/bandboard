import { NextRequest, NextResponse } from 'next/server';

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
const UID_COOKIE = 'bandboard_uid';
const SECRET_COOKIE = 'bandboard_secret';

const PUBLIC_PATHS = ['/unlock'];

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
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

  // --- 1. Device UUID: mint if missing (PLAN §5.1.2) ---
  let uid = req.cookies.get(UID_COOKIE)?.value;
  if (!isValidUuid(uid)) {
    uid = crypto.randomUUID();
    res.cookies.set(UID_COOKIE, uid, {
      path: '/',
      maxAge: TEN_YEARS,
      sameSite: 'lax',
    });
  }

  // --- 2. Shared secret gate (PLAN §5.1.1) ---
  const secret = process.env.BAND_SECRET;
  if (secret) {
    // Allow ?secret=... on first hit: set cookie + strip param.
    const paramSecret = req.nextUrl.searchParams.get('secret');
    if (paramSecret) {
      res.cookies.set(SECRET_COOKIE, paramSecret, {
        path: '/',
        maxAge: TEN_YEARS,
        sameSite: 'lax',
      });
      const cleanUrl = req.nextUrl.clone();
      cleanUrl.searchParams.delete('secret');
      return NextResponse.redirect(cleanUrl);
    }

    const provided = req.cookies.get(SECRET_COOKIE)?.value;
    const onUnlock = pathname === '/unlock';

    if (provided !== secret) {
      if (!onUnlock) {
        const unlockUrl = req.nextUrl.clone();
        unlockUrl.pathname = '/unlock';
        unlockUrl.searchParams.set('next', pathname + search);
        return NextResponse.redirect(unlockUrl);
      }
      // On /unlock with bad/missing secret: let them see the form.
    } else if (onUnlock) {
      // Already authenticated + hitting /unlock: bounce to next or root.
      const next = req.nextUrl.searchParams.get('next') || '/';
      return NextResponse.redirect(new URL(next, req.url));
    }
  } else if (pathname === '/unlock') {
    // No secret configured: /unlock is pointless, bounce to root.
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Public paths that aren't /unlock (none currently) pass through.
  void PUBLIC_PATHS;
  return res;
}

export const config = {
  // Run on everything except static assets (handled in middleware body too).
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
