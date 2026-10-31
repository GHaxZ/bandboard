import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, sessions, songs, rehearsals, userSongProgress, commentReads } from '@/db/schema';
import { AuthError, getSessionUser, getUserUuid } from './auth';
import { SESSION_COOKIE, TEN_YEARS, UID_COOKIE } from './constants';
import { getSongs, getSongDetails } from '@/app/actions/songs';
import { getCustomTracks } from '@/app/actions/customTracks';
import { getRehearsals, getRehearsalDetails, getRehearsalWithVoteView, isOpenVote } from '@/app/actions/rehearsals';
import { getProgressMap, getSongProgress } from '@/app/actions/user';
import { finalizeIfDue, getSongComments, getVotingState, markCommentsRead } from '@/app/actions/votes';
import { proxy } from '@/proxy';
import { NextRequest } from 'next/server';
import { register, login, logout, changePassword } from '@/app/actions/auth';

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
const validToken = '22222222-2222-4222-8222-222222222222';
const fakeToken = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  requestCookies.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db.delete(users).run();
  db.delete(songs).run();
  db.delete(rehearsals).run();
  db.insert(users).values({ id: userId, username: 'member', passwordHash: 'unused', createdAt: Date.now() }).run();
  db.insert(sessions).values({ token: validToken, userId, createdAt: Date.now() }).run();
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
    requestCookies.set(UID_COOKIE, fakeToken);
    expect(await register('NewMember', 'test-password-123', 'test-password-123')).toEqual({ success: true });
    expect(await getSessionUser()).toEqual({ id: fakeToken, username: 'NewMember' });
    expect(requestCookies.has(UID_COOKIE)).toBe(false);
    await logout();
    expect(await getSessionUser()).toBeNull();
    expect((await login('newmember', 'wrong-password')).success).toBe(false);
    expect(await login('newmember', 'test-password-123')).toEqual({ success: true });
    db.insert(sessions).values({ token: 'other-device', userId: fakeToken, createdAt: Date.now() }).run();
    expect(await changePassword('test-password-123', 'new-test-password-123')).toEqual({ success: true });
    expect(db.select().from(sessions).where(eq(sessions.userId, fakeToken)).all()).toHaveLength(1);
    expect(await getSessionUser()).toEqual({ id: fakeToken, username: 'NewMember' });
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
    db.update(sessions).set({ createdAt: Date.now() - TEN_YEARS * 1000 - 1 }).where(eq(sessions.token, validToken)).run();
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
