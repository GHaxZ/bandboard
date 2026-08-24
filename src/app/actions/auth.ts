"use server";

import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, users, userSettings, userSongProgress } from '@/db/schema';
import { safeEqual } from '@/lib/utils';
import { getSessionUser, hashPassword, verifyPassword } from '@/lib/auth';
import {
  rateLimit,
  getClientKey,
  isLoginBlocked,
  recordLoginFailure,
  clearLoginFailures,
} from '@/lib/rate-limit';
import { TEN_YEARS, UID_COOKIE, SESSION_COOKIE, RATE_LIMITS } from '@/lib/constants';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;

// Fixed delay on every auth attempt so online brute force can't run fast.
const BASE_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Create the session row + set the cookie. Called after verified register/login. */
async function startSession(userId: string): Promise<void> {
  const token = randomUUID();
  await db.insert(sessions).values({ token, userId, createdAt: Date.now() });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: TEN_YEARS,
  });
  // The anonymous identity is now owned by an account — drop it so a future
  // registration on this device mints a fresh one instead of colliding.
  cookieStore.delete(UID_COOKIE);
}

/** Whether new registrations need the band invite code (BAND_SECRET). */
export async function isInviteRequired(): Promise<boolean> {
  return !!process.env.BAND_SECRET;
}

export async function register(
  username: string,
  password: string,
  confirmPassword?: string,
  inviteCode?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const name = username.trim();
    if (!USERNAME_RE.test(name)) {
      return {
        success: false,
        error: 'Username must be 3–32 characters (letters, numbers, - or _).',
      };
    }
    if (password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters.' };
    }
    if (password !== confirmPassword) {
      return { success: false, error: 'Passwords do not match.' };
    }

    // BAND_SECRET gates registration only (invite-style deployments).
    const secret = process.env.BAND_SECRET;
    if (secret && !safeEqual(secret, inviteCode ?? '')) {
      await sleep(BASE_DELAY_MS);
      return { success: false, error: 'Incorrect band invite code.' };
    }

    const { device } = await getClientKey();
    if (!rateLimit(`register:${device}`, RATE_LIMITS.register.max, RATE_LIMITS.register.windowMs)) {
      return { success: false, error: 'Too many attempts. Try again later.' };
    }

    const cookieStore = await cookies();
    const uid = cookieStore.get(UID_COOKIE)?.value;
    if (!uid) {
      return { success: false, error: 'Missing device identity. Reload the page and try again.' };
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, uid)).limit(1);
    if (existing.length > 0) {
      return { success: false, error: 'This device already has an account. Log in instead.' };
    }

    // Adopting the device UUID means all pre-existing settings/progress rows
    // instantly belong to this account — no data copy needed.
    await db.insert(users).values({
      id: uid,
      username: name,
      passwordHash: hashPassword(password),
      createdAt: Date.now(),
    });

    await startSession(uid);
    return { success: true };
  } catch (error) {
    // Unique index on lower(username) → race-safe "taken" detection.
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      return { success: false, error: 'That username is already taken.' };
    }
    console.error('Registration failed:', error);
    return { success: false, error: 'Something went wrong' };
  }
}

export async function login(
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fixed delay on every attempt so online brute force can't run faster
    // than ~3 guesses/second per device.
    await sleep(BASE_DELAY_MS);

    const { ip, device } = await getClientKey();
    if (await isLoginBlocked(ip, device)) {
      return { success: false, error: 'Too many attempts. Try again in a few minutes.' };
    }

    const name = username.trim().toLowerCase();
    const rows = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(sql`lower(${users.username}) = ${name}`)
      .limit(1);

    const ok = rows[0] ? verifyPassword(password, rows[0].passwordHash) : false;
    if (!ok || !rows[0]) {
      // Counters live in the login_failures table — they survive restarts and
      // are tracked per device AND per IP (higher IP threshold).
      await recordLoginFailure(ip, device);
      return { success: false, error: 'Incorrect username or password.' };
    }

    await clearLoginFailures(ip, device);
    await startSession(rows[0].id);
    return { success: true };
  } catch (error) {
    console.error('Login failed:', error);
    return { success: false, error: 'Something went wrong' };
  }
}

/** Delete the current session row + cookie. */
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token));
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function changeUsername(
  newUsername: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getSessionUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const name = newUsername.trim();
    if (!USERNAME_RE.test(name)) {
      return {
        success: false,
        error: 'Username must be 3–32 characters (letters, numbers, - or _).',
      };
    }
    await db.update(users).set({ username: name }).where(eq(users.id, user.id));
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      return { success: false, error: 'That username is already taken.' };
    }
    console.error('Failed to change username:', error);
    return { success: false, error: 'Something went wrong' };
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getSessionUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    if (newPassword.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters.' };
    }
    const rows = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!rows[0] || !verifyPassword(currentPassword, rows[0].passwordHash)) {
      return { success: false, error: 'Current password is incorrect.' };
    }
    await db
      .update(users)
      .set({ passwordHash: hashPassword(newPassword) })
      .where(eq(users.id, user.id));
    // Invalidate every other session (other devices/browsers); keep this one.
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) {
      await db
        .delete(sessions)
        .where(and(eq(sessions.userId, user.id), ne(sessions.token, token)))
        .run();
    }
    return { success: true };
  } catch (error) {
    console.error('Failed to change password:', error);
    return { success: false, error: 'Something went wrong' };
  }
}

export async function deleteAccount(
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getSessionUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const rows = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!rows[0] || !verifyPassword(password, rows[0].passwordHash)) {
      return { success: false, error: 'Password is incorrect.' };
    }

    db.transaction((tx) => {
      // user_settings/user_song_progress have no FK on user_uuid — delete explicitly.
      tx.delete(userSongProgress).where(eq(userSongProgress.userUuid, user.id)).run();
      tx.delete(userSettings).where(eq(userSettings.userUuid, user.id)).run();
      tx.delete(users).where(eq(users.id, user.id)).run(); // sessions cascade via FK
    });

    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
    cookieStore.delete(UID_COOKIE);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete account:', error);
    return { success: false, error: 'Something went wrong' };
  }
}
