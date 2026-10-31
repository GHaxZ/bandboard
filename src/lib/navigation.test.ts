import { describe, expect, it } from 'vitest';
import { safeNext } from './navigation';

describe('safeNext', () => {
  it.each([null, undefined, '', 'https://example.com', '//example.com', '/\\example.com', '/\t/example.com', '/\n/example.com'])('rejects unsafe redirect %j', (target) => {
    expect(safeNext(target)).toBe('/');
  });

  it('preserves local paths with queries and fragments', () => {
    const target = '/rehearsals/123?song=456#details';
    expect(safeNext(target)).toBe(target);
  });
});
