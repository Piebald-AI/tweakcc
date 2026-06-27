import { describe, expect, it, vi } from 'vitest';

import { writeThinkerFormat } from './thinkerFormat';

describe('writeThinkerFormat', () => {
  it('rewrites the format via the global fallback when the spinner props are not adjacent (CC 2.1.195+)', () => {
    // spinnerTip/overrideMessage still live in the component but are no longer
    // adjacent to the format expression, so the scoped passes miss; the global
    // fallback must still anchor to that surrounding context.
    const input =
      'spinnerTipsEnabled:!0,foo:bar,overrideMessage:W,' +
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

  it('does not act when the spinner context is absent (avoids rewriting unrelated bundle code)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // A lone `,x=(…activeForm…)+"…"` with no spinnerTip/overrideMessage nearby
    // must NOT be rewritten — uniqueness alone is not enough.
    const input = 'q=1,r=(a??b?.activeForm??c)+"\\u2026";s=2;';

    const result = writeThinkerFormat(input, '{} thinking');

    expect(result).toBeNull();
    spy.mockRestore();
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

  it('does not act when the active-form expression is ambiguous (multiple matches in spinner context)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const input =
      'spinnerTipsEnabled:!0,overrideMessage:W,' +
      'x=1,$=(a??M?.activeForm??x)+"\\u2026",Y=(b??N?.activeForm??z)+"\\u2026";';

    const result = writeThinkerFormat(input, '{} thinking');

    expect(result).toBeNull();
    spy.mockRestore();
  });
});
