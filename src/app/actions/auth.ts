"use server";

import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, users, userSettings, userSongProgress, rehearsalVotes, commentReads,
  rehearsalSongComments, rehearsalSongs, storedFiles } from '@/db/schema';
import { requireMutation, sessionDigest, startSession, AuthError } from '@/lib/auth';
import { hashPassword, verifyPassword, validateNewPassword, validPasswordInput,
  needsPasswordRehash, upgradePasswordHash, secretEqual, PasswordBusyError } from '@/lib/passwords';
import { getClientKey, reserveLoginAttempt, clearLoginAttempts, reserveRegistrationAttempt, rateLimit } from '@/lib/rate-limit';
import { assertCapacity } from '@/lib/capacity';
import { UID_COOKIE, SESSION_COOKIE, RATE_LIMITS, INPUT_LIMITS } from '@/lib/constants';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
type Result = { success: boolean; error?: string };
function failure(error: unknown): Result {
  if (error instanceof AuthError || error instanceof PasswordBusyError) return { success: false, error: error.message };
  if (error instanceof Error && error.message.includes('UNIQUE')) return { success: false, error: 'That username is already taken.' };
  console.error('Account action failed:', error);
  return { success: false, error: 'Something went wrong' };
}
export async function getRegistrationStatus(): Promise<{ enabled: boolean; inviteRequired: boolean }> {
  const mode = process.env.REGISTRATION_MODE ?? 'invite';
  return { enabled: mode === 'open' || (mode === 'invite' && !!process.env.BAND_SECRET), inviteRequired: mode !== 'open' };
}
export async function isInviteRequired(): Promise<boolean> { return (await getRegistrationStatus()).inviteRequired; }
export async function register(username: string, password: string, confirmPassword?: string, inviteCode?: string): Promise<Result> {
  try {
    const status = await getRegistrationStatus();
    if (!status.enabled) return { success: false, error: 'Registration is closed. Ask a bandmate for access.' };
    const name = typeof username === 'string' ? username.trim() : '';
    if (!USERNAME_RE.test(name)) return { success: false, error: 'Username must be 3–32 characters (letters, numbers, - or _).' };
    const passwordError = validateNewPassword(password);
    if (passwordError) return { success: false, error: passwordError };
    if (password !== confirmPassword) return { success: false, error: 'Passwords do not match.' };
    const { device, source } = await getClientKey();
    if (!reserveRegistrationAttempt(device, source)) return { success: false, error: 'Too many attempts. Try again later.' };
    if (status.inviteRequired && (typeof inviteCode !== 'string' || inviteCode.length > 1024 ||
      !secretEqual(process.env.BAND_SECRET!, inviteCode))) {
      return { success: false, error: 'Incorrect band invite code.' };
    }
    const passwordHash = await hashPassword(password);
    const id = randomUUID(); // Never adopt an unsigned browser identifier.
    db.transaction(tx => {
      assertCapacity(tx, users, INPUT_LIMITS.members);
      tx.insert(users).values({ id, username: name, passwordHash, createdAt: Date.now() }).run();
    }, { behavior: 'immediate' });
    await startSession(id, passwordHash);
    return { success: true };
  } catch (error) { return failure(error); }
}
export async function login(username: string, password: string): Promise<Result> {
  try {
    const name = typeof username === 'string' && username.length <= 128 ? username.trim().toLowerCase() : '';
    if (!USERNAME_RE.test(name) || !validPasswordInput(password)) return { success: false, error: 'Incorrect username or password.' };
    const { device, source } = await getClientKey();
    if (!reserveLoginAttempt(device, name, source)) return { success: false, error: 'Too many attempts. Try again in a few minutes.' };
    const row = db.select().from(users).where(sql`lower(${users.username}) = ${name}`).get();
    if (!await verifyPassword(password, row?.passwordHash) || !row) return { success: false, error: 'Incorrect username or password.' };
    const newHash = needsPasswordRehash(row.passwordHash) ? await upgradePasswordHash(password) : undefined;
    await startSession(row.id, row.passwordHash, { newHash });
    clearLoginAttempts(device, name);
    return { success: true };
  } catch (error) { return failure(error); }
}
export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) db.delete(sessions).where(eq(sessions.token, sessionDigest(token))).run();
  store.delete(SESSION_COOKIE);
}
export async function logoutOtherSessions(): Promise<Result> {
  try {
    const user = await requireMutation();
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) throw new AuthError();
    db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.token, sessionDigest(token)))).run();
    return { success: true };
  } catch (error) { return failure(error); }
}
export async function changeUsername(newUsername: string): Promise<Result> {
  try {
    const user = await requireMutation();
    const name = typeof newUsername === 'string' ? newUsername.trim() : '';
    if (!USERNAME_RE.test(name)) return { success: false, error: 'Username must be 3–32 characters (letters, numbers, - or _).' };
    db.update(users).set({ username: name }).where(eq(users.id, user.id)).run();
    return { success: true };
  } catch (error) { return failure(error); }
}
function reservePasswordAttempt(userId: string): void {
  if (!rateLimit(`password:${userId}`, RATE_LIMITS.password.max, RATE_LIMITS.password.windowMs)) {
    throw new AuthError('Too many password attempts. Try again later.');
  }
}
export async function changePassword(currentPassword: string, newPassword: string): Promise<Result> {
  try {
    const user = await requireMutation();
    reservePasswordAttempt(user.id); // Shared with account deletion, including successful attempts.
    const err = validateNewPassword(newPassword);
    if (err) return { success: false, error: err };
    const row = db.select().from(users).where(eq(users.id, user.id)).get();
    if (!await verifyPassword(currentPassword, row?.passwordHash) || !row) return { success: false, error: 'Current password is incorrect.' };
    await startSession(user.id, row.passwordHash, { newHash: await hashPassword(newPassword), revokeAll: true });
    return { success: true };
  } catch (error) { return failure(error); }
}
export async function deleteAccount(password: string): Promise<Result> {
  try {
    const user = await requireMutation();
    reservePasswordAttempt(user.id);
    const row = db.select().from(users).where(eq(users.id, user.id)).get();
    if (!await verifyPassword(password, row?.passwordHash) || !row) return { success: false, error: 'Password is incorrect.' };
    db.transaction(tx => {
      const current = tx.select().from(users).where(eq(users.id, user.id)).get();
      if (!current || current.passwordHash !== row.passwordHash) throw new AuthError('Credentials changed. Please sign in again.');
      tx.delete(userSongProgress).where(eq(userSongProgress.userUuid, user.id)).run();
      tx.delete(userSettings).where(eq(userSettings.userUuid, user.id)).run();
      tx.delete(rehearsalVotes).where(eq(rehearsalVotes.userUuid, user.id)).run();
      tx.delete(commentReads).where(eq(commentReads.userUuid, user.id)).run();
      tx.delete(rehearsalSongComments).where(eq(rehearsalSongComments.userUuid, user.id)).run();
      tx.update(rehearsalSongs).set({ addedBy: null }).where(eq(rehearsalSongs.addedBy, user.id)).run();
      tx.update(storedFiles).set({ owner: 'deleted' }).where(eq(storedFiles.owner, user.id)).run();
      tx.delete(users).where(eq(users.id, user.id)).run();
    }, { behavior: 'immediate' });
    const store = await cookies();
    store.delete(SESSION_COOKIE); store.delete(UID_COOKIE);
    return { success: true };
  } catch (error) { return failure(error); }
}
