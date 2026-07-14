import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearReactVarCache,
  escapeNonAscii,
  findBoxComponent,
  getReactModuleFunctionBun,
  getReactModuleNameNonBun,
  getReactVar,
} from './helpers';

const LOADER = 'var Zq=1,H=(e,t,r)=>{r=e!=null?Xq(Zq(e)):{};return r};';

const ARROW_BUNDLE =
  LOADER +
  'var n7L=X((yg)=>{var s2i=Symbol.for("react.element");yg.version="19.2.0"});' +
  'var fH=X((pBE,N8c)=>{N8c.exports=n7L()});' +
  'var qwd=H(fH(),1),up=H(ne(),1);';

const FN_EXPR_BUNDLE =
  LOADER +
  'var $8c=X(function(yg){var s2i=Symbol.for("react.transitional.element");yg.version="19.2.0"});' +
  'var tt=X(function(pBE,N8c){N8c.exports=$8c()});' +
  'var G8c=H(tt(),1),W8c=G8c.createContext({stdin:process.stdin});';

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

describe('React module resolution', () => {
  beforeEach(() => {
    clearReactVarCache();
  });

  describe('getReactModuleNameNonBun', () => {
    it('finds the React module wrapped in an arrow function', () => {
      expect(getReactModuleNameNonBun(ARROW_BUNDLE)).toBe('n7L');
    });

    it('finds the React module wrapped in a function expression (CC 2.1.209)', () => {
      expect(getReactModuleNameNonBun(FN_EXPR_BUNDLE)).toBe('$8c');
    });
  });

  describe('getReactModuleFunctionBun', () => {
    it('finds the re-exporting module wrapped in an arrow function', () => {
      expect(getReactModuleFunctionBun(ARROW_BUNDLE)).toBe('fH');
    });

    it('finds the re-exporting module wrapped in a function expression (CC 2.1.209)', () => {
      expect(getReactModuleFunctionBun(FN_EXPR_BUNDLE)).toBe('tt');
    });
  });

  describe('getReactVar', () => {
    it('resolves the React variable on arrow-wrapped bundles', () => {
      expect(getReactVar(ARROW_BUNDLE)).toBe('qwd');
    });

    it('resolves the React variable on function-expression bundles (CC 2.1.209)', () => {
      expect(getReactVar(FN_EXPR_BUNDLE)).toBe('G8c');
    });

    it('returns undefined when React is absent', () => {
      expect(getReactVar(LOADER + 'var a=1;')).toBeUndefined();
    });
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
