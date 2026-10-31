import { describe, expect, it } from 'vitest';
import { storedPath, validateMagicBytes } from './uploads';

describe('upload validation', () => {
  it.each(['', '.', '..', '../file', 'dir/file', 'dir\\file'])('rejects unsafe stored name %j', (name) => {
    expect(() => storedPath(name)).toThrow('Invalid stored name');
  });

  it.each([0xfb, 0xfa, 0xf3, 0xe3])('accepts an untagged MP3 frame starting FF %s', (secondByte) => {
    expect(validateMagicBytes(Buffer.from([0xff, secondByte, 0x90, 0]), 'audio/mpeg')).toBe(true);
  });

  it('distinguishes RIFF image and audio containers', () => {
    const wav = Buffer.from('RIFF\0\0\0\0WAVE');
    const webp = Buffer.from('RIFF\0\0\0\0WEBP');
    expect(validateMagicBytes(wav, 'audio/wav')).toBe(true);
    expect(validateMagicBytes(webp, 'image/webp', 'image')).toBe(true);
    expect(validateMagicBytes(wav, 'image/webp', 'image')).toBe(false);
    expect(validateMagicBytes(webp, 'audio/wav')).toBe(false);
  });
});
