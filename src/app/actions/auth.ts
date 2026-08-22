"use server";

import { cookies } from 'next/headers';
import { requireAuth, AuthError } from '@/lib/auth';
import { TEN_YEARS, UID_COOKIE, SECRET_COOKIE } from '@/lib/constants';
import { safeEqual } from '@/lib/utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Brute-force guard for the shared-secret oracle: per-device failure counter
// with an escalating fixed delay. In-memory (single-process LAN app);
// ponytail: swap for a persistent/IP-based limiter if the app is ever
// exposed beyond the band's network.
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 5 * 60 * 1000;
const BASE_DELAY_MS = 300;
const failures = new Map<string, { count: number; lastAt: number }>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkSecret(
  provided: string
): Promise<{ isValid: boolean; isRequired: boolean }> {
  const secret = process.env.BAND_SECRET;
  if (!secret) {
    return { isValid: true, isRequired: false };
  }

  // Fixed delay on every attempt (correct or not) so online brute force can't
  // run faster than ~3 guesses/second per device.
  await sleep(BASE_DELAY_MS);

  const cookieStore = await cookies();
  const uid = cookieStore.get(UID_COOKIE)?.value ?? 'unknown';
  const rec = failures.get(uid);
  if (rec && rec.count >= MAX_FAILURES && Date.now() - rec.lastAt < FAILURE_WINDOW_MS) {
    return { isValid: false, isRequired: true };
  }

  if (safeEqual(secret, provided)) {
    failures.delete(uid);
    return { isValid: true, isRequired: true };
  }

  const withinWindow = rec && Date.now() - rec.lastAt < FAILURE_WINDOW_MS;
  failures.set(uid, {
    count: withinWindow ? rec.count + 1 : 1,
    lastAt: Date.now(),
  });
  return { isValid: false, isRequired: true };
}

export async function isSecretRequired(): Promise<boolean> {
  return !!process.env.BAND_SECRET;
}

/** Clear the secret cookie — logs the user out of the shared-secret gate. */
export async function logout(): Promise<void> {
  await requireAuth();
  const cookieStore = await cookies();
  cookieStore.delete(SECRET_COOKIE);
}

/**
 * Switch this device's identity to another UUID. Validates the format, then
 * sets the `bandboard_uid` cookie server-side. The caller should refresh.
 */
export async function syncDeviceId(
  uuid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();
    if (!UUID_RE.test(uuid.trim())) {
      return { success: false, error: 'Invalid Device ID format.' };
    }
    const cookieStore = await cookies();
    cookieStore.set(UID_COOKIE, uuid.trim(), {
      path: '/',
      maxAge: TEN_YEARS,
      sameSite: 'lax',
      httpOnly: true,
    });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { success: false, error: 'Unauthorized' };
    }
    console.error('Failed to sync device ID:', error);
    return { success: false, error: 'Something went wrong' };
  }
}

/** Called by the /unlock form on successful secret entry. */
export async function setSecretCookie(secret: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cookieStore = await cookies();
    cookieStore.set(SECRET_COOKIE, secret, {
      path: '/',
      maxAge: TEN_YEARS,
      sameSite: 'lax',
      httpOnly: true,
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to set secret cookie:', error);
    return { success: false, error: 'Something went wrong' };
  }
}
