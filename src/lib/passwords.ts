import { hash, verify, parseOptions } from '@node-rs/argon2';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './constants';

// PHC strings carry algorithm, version, salt and work factors for future upgrades.
const POLICY = { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32 };
let active = 0;
export class PasswordBusyError extends Error {
  constructor() { super('Sign-in is busy. Please try again shortly.'); }
}
async function bounded<T>(work: () => Promise<T>): Promise<T> {
  // Bound memory/CPU work without an unbounded queue of waiting requests.
  if (active >= 2) throw new PasswordBusyError();
  active++;
  try { return await work(); } finally { active--; }
}
export function validPasswordInput(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= PASSWORD_MAX_LENGTH;
}
export function validateNewPassword(value: unknown): string | null {
  return validPasswordInput(value) && value.length >= PASSWORD_MIN_LENGTH
    ? null : `Password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters.`;
}
export function hashPassword(password: string): Promise<string> {
  if (validateNewPassword(password)) throw new Error('Invalid password length');
  return bounded(() => hash(password, { ...POLICY, salt: randomBytes(16) }));
}
// Rehashing preserves existing shorter passwords until the owner changes them.
export function upgradePasswordHash(password: string): Promise<string> {
  return bounded(() => hash(password, { ...POLICY, salt: randomBytes(16) }));
}
export function needsPasswordRehash(stored: string): boolean {
  if (!stored.startsWith('$argon2id$')) return true;
  try {
    const p = parseOptions(stored);
    return p.memoryCost !== POLICY.memoryCost || p.timeCost !== POLICY.timeCost ||
      p.parallelism !== POLICY.parallelism || p.outputLen !== POLICY.outputLen || p.saltLen < 16;
  } catch { return true; }
}
// Unknown accounts perform the same current-policy verification work.
const DUMMY = '$argon2id$v=19$m=65536,t=3,p=1$' +
  Buffer.alloc(16).toString('base64').replace(/=+$/, '') + '$' +
  Buffer.alloc(32).toString('base64').replace(/=+$/, '');
export async function verifyPassword(password: string, stored?: string): Promise<boolean> {
  if (!validPasswordInput(password)) return false;
  return bounded(async () => {
    if (!stored || stored.startsWith('$argon2id$')) {
      const candidate = stored ?? DUMMY;
      let valid = false;
      try {
        const p = parseOptions(candidate);
        if (p.memoryCost <= 131072 && p.timeCost <= 6 && p.parallelism <= 4 && p.outputLen <= 64) {
          valid = await verify(candidate, password);
        }
      } catch { /* corrupted hashes are never accepted */ }
      return !!stored && valid;
    }
    const match = /^([0-9a-f]{32}):([0-9a-f]{128})$/i.exec(stored);
    if (!match) { await verify(DUMMY, password); return false; }
    const derived = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, match[1], 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 ** 2 },
        (err, result) => err ? reject(err) : resolve(result));
    });
    return timingSafeEqual(derived, Buffer.from(match[2], 'hex'));
  });
}
/** Node's native constant-time comparison of fixed-size digests. */
export function secretEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
