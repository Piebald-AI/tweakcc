import { describe, expect, it } from 'vitest';

import { findBoxComponent } from './helpers';

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
