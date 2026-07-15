"use server";

import { cookies } from 'next/headers';
import { requireAuth, AuthError } from '@/lib/auth';

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
const UID_COOKIE = 'bandboard_uid';
const SECRET_COOKIE = 'bandboard_secret';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function checkSecret(
  provided: string
): Promise<{ isValid: boolean; isRequired: boolean }> {
  const secret = process.env.BAND_SECRET;
  if (!secret) {
    return { isValid: true, isRequired: false };
  }
  return { isValid: secret === provided, isRequired: true };
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
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to set secret cookie:', error);
    return { success: false, error: 'Something went wrong' };
  }
}
