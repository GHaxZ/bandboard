import { beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, sessions, songs, rehearsals, userSongProgress, commentReads, rateLimits } from '@/db/schema';
import { AuthError, getSessionUser, getUserUuid, sessionDigest, startSession } from './auth';
import { SESSION_COOKIE, SESSION_MAX_AGE, SESSION_IDLE_MS, UID_COOKIE } from './constants';
import { deleteSong, getSongs, getSongDetails } from '@/app/actions/songs';
import { getCustomTracks } from '@/app/actions/customTracks';
import { deleteRehearsal, getRehearsals, getRehearsalDetails, getRehearsalWithVoteView, isOpenVote } from '@/app/actions/rehearsals';
import { getProgressMap, getSongProgress } from '@/app/actions/user';
import { endVotingNow, finalizeIfDue, getSongComments, getVotingState, markCommentsRead } from '@/app/actions/votes';
import { proxy } from '@/proxy';
import { NextRequest } from 'next/server';
import { register, login, logout, changePassword, deleteAccount } from '@/app/actions/auth';

const requestCookies = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = requestCookies.get(name);
      return value ? { value } : undefined;
    },
    set: (name: string, value: string) => { requestCookies.set(name, value); },
    delete: (name: string) => { requestCookies.delete(name); },
  }),
  headers: async () => new Headers(),
}));
vi.mock('@/db', async () => {
  const { createTestDatabase } = await import('@/test/database');
  return createTestDatabase();
});

const userId = '11111111-1111-4111-8111-111111111111';
const validToken = '2'.repeat(64);
const fakeToken = '3'.repeat(64);

beforeEach(() => {
  requestCookies.clear();
  db.delete(rateLimits).run();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db.delete(users).run();
  db.delete(songs).run();
  db.delete(rehearsals).run();
  db.insert(users).values({ id: userId, username: 'member', passwordHash: 'unused', createdAt: Date.now() }).run();
  db.insert(sessions).values({ token: sessionDigest(validToken), userId, createdAt: Date.now(), lastSeenAt: Date.now() }).run();
  db.insert(songs).values({ id: 'song', title: 'Song', artist: 'Band', createdAt: Date.now() }).run();
  db.insert(rehearsals).values({ id: 'vote', title: 'Vote', date: Date.now() + 10000, type: 'vote', votingEndsAt: Date.now() - 1000, songSelectionCount: 1 }).run();
  db.insert(userSongProgress).values({ id: 'progress', userUuid: userId, songId: 'song', notes: 'Private notes', updatedAt: Date.now() }).run();
});

afterAll(async () => {
  const { connection } = await import('@/db') as unknown as ReturnType<typeof import('@/test/database').createTestDatabase>;
  connection.close();
  vi.restoreAllMocks();
});

describe('authenticated data access', () => {
  it('preserves registration, login, logout and password-change session revocation', async () => {
    vi.stubEnv('BAND_SECRET', '');
    vi.stubEnv('REGISTRATION_MODE', 'open');
    requestCookies.set(UID_COOKIE, fakeToken);
    expect(await register('NewMember', 'test-password-123', 'test-password-123')).toEqual({ success: true });
    const registered = await getSessionUser();
    expect(registered?.username).toBe('NewMember');
    expect(registered?.id).not.toBe(fakeToken);
    const newUserId = registered!.id;
    await logout();
    expect(await getSessionUser()).toBeNull();
    expect((await login('newmember', 'wrong-password')).success).toBe(false);
    expect(await login('newmember', 'test-password-123')).toEqual({ success: true });
    db.insert(sessions).values({ token: sessionDigest('other-device'), userId: newUserId, createdAt: Date.now(), lastSeenAt: Date.now() }).run();
    const previousToken = requestCookies.get(SESSION_COOKIE);
    expect(await changePassword('test-password-123', 'new-test-password-123')).toEqual({ success: true });
    expect(db.select().from(sessions).where(eq(sessions.userId, newUserId)).all()).toHaveLength(1);
    expect(requestCookies.get(SESSION_COOKIE)).not.toBe(previousToken);
    expect(await getSessionUser()).toEqual({ id: newUserId, username: 'NewMember' });
    vi.unstubAllEnvs();
  });

  it('rejects a forged session and a device cookie containing a real account ID', async () => {
    requestCookies.set(SESSION_COOKIE, fakeToken);
    requestCookies.set(UID_COOKIE, userId);
    expect(await getSessionUser()).toBeNull();
    await expect(getUserUuid()).rejects.toBeInstanceOf(AuthError);
    expect(await getSongProgress('song')).toBeNull();
    expect(await getProgressMap()).toEqual({});
    expect(await getSongs()).toEqual([]);
    expect(await getSongDetails('song')).toBeNull();
    expect(await getCustomTracks('song')).toEqual([]);
    expect(await getRehearsals()).toEqual([]);
    expect(await getRehearsalDetails('vote')).toBeNull();
    expect(await getRehearsalWithVoteView('vote')).toEqual({ details: null, votingState: null });
    await expect(isOpenVote('vote')).rejects.toBeInstanceOf(AuthError);
    expect(await getVotingState('vote')).toBeNull();
    expect(await getSongComments('vote', 'song')).toEqual({ comments: [], myLastReadAt: null });
    expect((await markCommentsRead('vote', 'song')).success).toBe(false);
    expect(db.select().from(commentReads).all()).toEqual([]);
    await finalizeIfDue('vote');
    expect(db.select().from(rehearsals).get()?.finalizedAt).toBeNull();
  });

  it('preserves reads and writes for a real session, regardless of device cookie', async () => {
    requestCookies.set(SESSION_COOKIE, validToken);
    requestCookies.set(UID_COOKIE, fakeToken);
    expect(await getUserUuid()).toBe(userId);
    expect((await getSongProgress('song'))?.notes).toBe('Private notes');
    expect(await getSongs()).toHaveLength(1);
    expect((await markCommentsRead('vote', 'song')).success).toBe(true);
    expect(db.select().from(commentReads).get()?.userUuid).toBe(userId);
  });

  it('enforces session expiration on the server', async () => {
    requestCookies.set(SESSION_COOKIE, validToken);
    db.update(sessions).set({ createdAt: Date.now() - SESSION_MAX_AGE * 1000 - 1 }).where(eq(sessions.token, sessionDigest(validToken))).run();
    expect(await getSessionUser()).toBeNull();
  });

  it('allows the login form and login actions with a stale UUID-shaped cookie', async () => {
    for (const method of ['GET', 'POST']) {
      const response = await proxy(new NextRequest('http://localhost/login', {
        method,
        headers: { cookie: `${SESSION_COOKIE}=${fakeToken}; ${UID_COOKIE}=${userId}` },
      }));
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('x-middleware-next')).toBe('1');
    }
  });
});

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('security policy', () => {
  it('fails closed for missing or unknown registration configuration', async () => {
    vi.stubEnv('REGISTRATION_MODE', 'invite'); vi.stubEnv('BAND_SECRET', '');
    expect((await register('outsider', 'test-password-123', 'test-password-123')).success).toBe(false);
    vi.stubEnv('REGISTRATION_MODE', 'typo');
    expect((await register('outsider', 'test-password-123', 'test-password-123')).success).toBe(false);
  });
  it('requires an invite and never claims browser-selected historical progress', async () => {
    vi.stubEnv('REGISTRATION_MODE', 'invite'); vi.stubEnv('BAND_SECRET', 'invite-test-only');
    requestCookies.set(UID_COOKIE, userId);
    expect((await register('NewMember', 'test-password-123', 'test-password-123', 'wrong')).success).toBe(false);
    expect((await register('NewMember', 'test-password-123', 'test-password-123', 'invite-test-only')).success).toBe(true);
    expect((await getSessionUser())?.id).not.toBe(userId);
    expect(await getSongProgress('song')).toBeNull();
  });
  it('does not accept a stored token digest as a bearer credential', async () => {
    requestCookies.set(SESSION_COOKIE, sessionDigest(validToken));
    expect(await getSessionUser()).toBeNull();
  });
  it('enforces idle expiry even within the absolute session lifetime', async () => {
    requestCookies.set(SESSION_COOKIE, validToken);
    db.update(sessions).set({ lastSeenAt: Date.now() - SESSION_IDLE_MS - 1 }).run();
    expect(await getSessionUser()).toBeNull();
  });
  it('rejects session issuance using a password hash changed during verification', async () => {
    await expect(startSession(userId, 'stale-hash')).rejects.toBeInstanceOf(AuthError);
    expect(db.select().from(sessions).all()).toHaveLength(1);
  });
  it('allows signed-in members to manage shared songs, voting and rehearsals', async () => {
    requestCookies.set(SESSION_COOKIE, validToken);
    expect((await deleteSong('song')).success).toBe(true);
    db.update(rehearsals).set({ votingEndsAt: Date.now() + 60_000 }).run();
    expect((await endVotingNow('vote')).success).toBe(true);
    expect((await deleteRehearsal('vote')).success).toBe(true);
    expect(db.select().from(songs).all()).toEqual([]);
    expect(db.select().from(rehearsals).all()).toEqual([]);
  });
  it('still rejects shared-content mutations with a forged session', async () => {
    requestCookies.set(SESSION_COOKIE, fakeToken);
    expect((await deleteSong('song')).success).toBe(false);
    expect((await deleteRehearsal('vote')).success).toBe(false);
    expect((await endVotingNow('vote')).success).toBe(false);
    expect(db.select().from(songs).all()).toHaveLength(1);
    expect(db.select().from(rehearsals).all()).toHaveLength(1);
  });
  it('allows the last remaining account to delete itself after password verification', async () => {
    const { hashPassword } = await import('./passwords');
    db.update(users).set({ passwordHash: await hashPassword('test-password-123') }).run();
    requestCookies.set(SESSION_COOKIE, validToken);
    expect(await deleteAccount('test-password-123')).toEqual({ success: true });
    expect(db.select().from(users).all()).toEqual([]);
    expect(db.select().from(sessions).all()).toEqual([]);
    expect(await getSessionUser()).toBeNull();
  });
  it('shares the password-verification budget across password changes and deletion', async () => {
    requestCookies.set(SESSION_COOKIE, validToken);
    for (let i = 0; i < 5; i++) await changePassword('wrong', 'new-password-123');
    expect((await deleteAccount('wrong')).error).toContain('Too many password attempts');
  });
  it('upgrades legacy scrypt hashes without changing an existing short password', async () => {
    const { scryptSync } = await import('node:crypto');
    const salt = '12'.repeat(16);
    const legacy = `${salt}:${scryptSync('oldpass8', salt, 64).toString('hex')}`;
    db.update(users).set({ passwordHash: legacy }).run();
    expect(await login('member', 'oldpass8')).toEqual({ success: true });
    const row = db.select().from(users).get()!;
    expect(row.passwordHash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(db.select().from(sessions).all().some(s => s.token === requestCookies.get(SESSION_COOKIE))).toBe(false);
  });
});

it('releases voting stream reservations when the session is revoked', async () => {
  const { GET } = await import('@/app/api/rehearsals/[id]/voting-stream/route');
  const { resourceLeases } = await import('@/db/schema');
  requestCookies.set(SESSION_COOKIE, validToken);
  db.update(rehearsals).set({ votingEndsAt: Date.now() + 60_000 }).run();
  vi.useFakeTimers();
  const response = await GET(new Request('http://localhost/api/rehearsals/vote/voting-stream'), { params: Promise.resolve({ id: 'vote' }) });
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  await reader.read();
  expect(db.select().from(resourceLeases).all()).toHaveLength(1);
  try {
    db.delete(sessions).run();
    await vi.advanceTimersByTimeAsync(2100);
    expect((await reader.read()).done).toBe(true);
    await reader.cancel();
    expect(db.select().from(resourceLeases).all()).toHaveLength(0);
  } finally { vi.useRealTimers(); }
});
