import { describe, expect, it, vi } from 'vitest';

import { writeThinkerFormat } from './thinkerFormat';

describe('writeThinkerFormat', () => {
  it('rewrites the format via the global fallback when the spinner props are not adjacent (CC 2.1.195+)', () => {
    // CC 2.1.195 stopped rendering spinnerTip/overrideMessage as an adjacent
    // object literal, so the section-scoped passes miss; only the format
    // expression itself remains, and it is globally unique.
    const input =
      'let L=y===void 0,M=L?x?.find(E=>E.status!=="pending"):void 0,' +
      '[B]=KJ.useState(()=>HL(zpt())),' +
      '$=(a??M?.activeForm??M?.subject??(h||B))+"\\u2026";KJ.useEffect(()=>{});';

    const result = writeThinkerFormat(input, '{} thinking');

    expect(result).not.toBeNull();
    expect(result).toContain(
      '$=`${a??M?.activeForm??M?.subject??(h||B)} thinking`'
    );
    expect(result).not.toContain('+"\\u2026"');
  });

  it('still uses the section-scoped path when spinnerTip/overrideMessage are adjacent (older Claude Code)', () => {
    const input =
      'spinnerTip:Q,mode:Z,overrideMessage:W,' +
      'x'.repeat(310) +
      ',N=(Y??C?.activeForm??L)+"\\u2026";';

    const result = writeThinkerFormat(input, '{} working');

    expect(result).not.toBeNull();
    expect(result).toContain('N=`${Y??C?.activeForm??L} working`');
  });

  it('does not act when the active-form expression is ambiguous (multiple matches)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const input =
      ',$=(a??M?.activeForm??x)+"\\u2026";,Y=(b??N?.activeForm??z)+"\\u2026";';

    const result = writeThinkerFormat(input, '{} thinking');

    expect(result).toBeNull();
    spy.mockRestore();
  });
});
