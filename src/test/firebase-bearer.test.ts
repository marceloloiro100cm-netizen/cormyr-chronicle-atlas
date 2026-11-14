import { describe, expect, it } from 'vitest';
import { bearerToken } from '@/integrations/firebase/bearer';

describe('bearerToken', () => {
  it('aceita Bearer com três segmentos', () => {
    expect(bearerToken('Bearer aaa.bbb.ccc')).toBe('aaa.bbb.ccc');
  });
  it('rejeita ausência, outros esquemas e tokens malformados', () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken('Basic aaa.bbb.ccc')).toBeNull();
    expect(bearerToken('Bearer aaa.bbb')).toBeNull();
    expect(bearerToken('Bearer aaa.bbb.ccc extra')).toBeNull();
  });
});
