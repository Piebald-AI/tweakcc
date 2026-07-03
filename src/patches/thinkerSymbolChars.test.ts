import { describe, it, expect } from 'vitest';

import { writeThinkerSymbolChars } from './thinkerSymbolChars';

// Native Claude Code installs embed cli.js as a Latin-1 Bun module in which every
// non-ASCII character is stored as a `\uXXXX` escape (the clean module has zero
// bytes > 127). Injecting literal UTF-8 (via a naive JSON.stringify) is decoded
// one byte per code point at runtime → mojibake (e.g. "✢" renders as "â").
// The patch must therefore emit non-ASCII symbols as `\uXXXX` escapes so the
// injected source stays pure ASCII.
describe('writeThinkerSymbolChars', () => {
  // A minimal bundle whose spinner array uses the escaped form CC actually ships.
  const bundle =
    'let A=["\\u00b7","\\u2722","*","\\u2733","\\u2736","\\u273b"];B()';

  it('replaces the spinner array with the custom symbols', () => {
    const out = writeThinkerSymbolChars(bundle, ['·', '✢', '*']);
    expect(out).not.toBeNull();
    expect(out).not.toBe(bundle);
  });

  it('emits non-ASCII symbols as \\uXXXX escapes, never literal UTF-8', () => {
    const out = writeThinkerSymbolChars(bundle, ['·', '✢', '*', '✶', '✻', '✽']);
    expect(out).not.toBeNull();
    // The injected source must contain no byte > 127, or it mojibakes on native
    // (Latin-1) installs.
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7f]/.test(out!)).toBe(false);
    // and the symbols must be present in their escaped form
    expect(out).toContain('"\\u00b7"'); // ·
    expect(out).toContain('"\\u2722"'); // ✢
    expect(out).toContain('"*"'); // ASCII passes through untouched
  });
});
