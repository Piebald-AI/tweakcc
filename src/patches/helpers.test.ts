import { describe, expect, it } from 'vitest';

import { escapeNonAscii, findBoxComponent } from './helpers';

describe('escapeNonAscii', () => {
  it('escapes non-ASCII code points as \\uXXXX and leaves ASCII untouched', () => {
    expect(escapeNonAscii('·✢*')).toBe('\\u00b7\\u2722*');
    expect(escapeNonAscii('plain ascii 123')).toBe('plain ascii 123');
  });

  it('produces output with no bytes > 127', () => {
    const out = escapeNonAscii(JSON.stringify(['·', '✽', 'x']));
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7f]/.test(out)).toBe(false);
  });

  it('escapes each surrogate half of an astral code point', () => {
    // 🎉 (U+1F389) is a surrogate pair; both halves become \uXXXX and still
    // reconstruct the emoji when the JS source is parsed.
    expect(escapeNonAscii('🎉')).toBe('\\ud83c\\udf89');
  });
});

describe('findBoxComponent', () => {
  it('finds the Box component rendered via the JSX runtime (jsx("ink-box"))', () => {
    // CC >=2.1.x rest-style Box: layout defaults applied to the rest param `I`,
    // then `X.jsx("ink-box",{...,style:I,children:T})` (children is a prop and
    // `style` is no longer the last prop).
    const src =
      'function Bx({children:T,ref:R,...I}){' +
      '"margin","padding","gap",' +
      'I.flexWrap??="nowrap",I.flexDirection??="row",I.flexGrow??=0,I.flexShrink??=1,' +
      'I.overflowX=I.overflowX??I.overflow??"visible",I.overflowY=I.overflowY??I.overflow??"visible",' +
      'Q.jsx("ink-box",{ref:R,style:I,children:T})}';
    expect(findBoxComponent(src)).toBe('Bx');
  });

  it('still finds the Box component via legacy createElement("ink-box")', () => {
    const src =
      'function Bx2({children:T,flexWrap:W}){return q.createElement("ink-box",{style:s},T)}';
    expect(findBoxComponent(src)).toBe('Bx2');
  });

  it('returns undefined when no Box component is present', () => {
    expect(findBoxComponent('const x=1;function f(){return null}')).toBe(
      undefined
    );
  });
});
