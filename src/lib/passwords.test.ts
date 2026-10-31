import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, needsPasswordRehash, secretEqual, PasswordBusyError, validateNewPassword } from './passwords';

describe('password hashing policy', () => {
  it('creates salted Argon2id hashes and verifies valid and invalid credentials', async () => {
    const password = 'test-only-password';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword('wrong', first)).toBe(false);
    expect(await verifyPassword(password)).toBe(false);
    expect(needsPasswordRehash(first)).toBe(false);
  });
  it('bounds native work instead of queueing unlimited KDF allocations', async () => {
    const one = hashPassword('test-only-password-one');
    const two = hashPassword('test-only-password-two');
    try { await expect(hashPassword('test-only-password-three')).rejects.toBeInstanceOf(PasswordBusyError); }
    finally { await Promise.all([one, two]); }
  });
  it('bounds new password inputs and uses native secret comparison', () => {
    expect(validateNewPassword('short')).not.toBeNull();
    expect(validateNewPassword('x'.repeat(1025))).not.toBeNull();
    expect(validateNewPassword('valid-password-123')).toBeNull();
    expect(secretEqual('secret', 'secret')).toBe(true);
    expect(secretEqual('secret', 'longer secret')).toBe(false);
  });
});
