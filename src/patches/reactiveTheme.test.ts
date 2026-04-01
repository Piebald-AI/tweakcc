import { beforeEach, describe, expect, it, vi } from 'vitest';

import { writeReactiveTheme } from './reactiveTheme';
import { clearCaches } from './helpers';

// Synthetic ThemeProvider snippets derived from real CC minified code.
// Each version uses different variable names but the same structure.

// Prefix: module loader + React import for getRequireFuncName / getReactVar to work
const BUN_PREFIX =
  'var j=(H,$,A)=>{A=H!=null?H:$};' +
  'var n7L=($)=>{var W=Symbol.for("react.transitional.element")};' +
  'var fH=j((AtM,r7L)=>{r7L.exports=n7L()});';

// v2.1.89 ThemeProvider (simplified but structurally accurate)
function buildV289(): string {
  return (
    BUN_PREFIX +
    'function rUH(){if(Xv6===void 0)Xv6=uG4()??"dark";return Xv6}' +
    'function Ad(H){if(H==="auto")return rUH();return H}' +
    'function uG4(){let H=process.env.COLORFGBG;if(!H)return;' +
    'let _=H.split(";"),q=_[_.length-1];' +
    'if(q===void 0||q==="")return;' +
    'let K=Number(q);if(!Number.isInteger(K)||K<0||K>15)return;' +
    'return K<=6||K===8?"dark":"light"}' +
    'var Xv6;' +
    'function pG_({children:H,initialState:_,onThemeSave:q=gG4}){' +
    'let[K,$]=UG.useState(_??pG4),[O,T]=UG.useState(null),' +
    '[z,A]=UG.useState(()=>(_??K)==="auto"?rUH():"dark"),' +
    'w=O??K,{internal_querier:f}=W6H();' +
    'UG.useEffect(()=>{},[w,f]);' +
    'let Y=w==="auto"?z:w,' +
    'j=UG.useMemo(()=>({themeSetting:K,' +
    'setThemeSetting:(D)=>{if($(D),T(null),D==="auto")A(rUH());q?.(D)},' +
    'setPreviewTheme:(D)=>{if(T(D),D==="auto")A(rUH())},' +
    'savePreview:()=>{if(O!==null)$(O),T(null),q?.(O)},' +
    'cancelPreview:()=>{if(O!==null)T(null)},' +
    'currentTheme:Y}),[K,O,Y,q]);' +
    'return UG.default.createElement(mG_.Provider,{value:j},H)}'
  );
}

// v2.1.87 ThemeProvider (different variable names)
function buildV287(): string {
  return (
    BUN_PREFIX +
    'function IFH(){if(OR4===void 0)OR4=MR4()??"dark";return OR4}' +
    'function Ad(H){if(H==="auto")return IFH();return H}' +
    'function MR4(){let H=process.env.COLORFGBG;if(!H)return;' +
    'let _=H.split(";"),q=_[_.length-1];' +
    'if(q===void 0||q==="")return;' +
    'let K=Number(q);if(!Number.isInteger(K)||K<0||K>15)return;' +
    'return K<=6||K===8?"dark":"light"}' +
    'var OR4;' +
    'function E0_({children:H,initialState:_,onThemeSave:q=JR4}){' +
    'let[$,K]=KG.useState(_??JR4),[O,T]=KG.useState(null),' +
    '[z,A]=KG.useState(()=>(_??$)==="auto"?IFH():"dark"),' +
    'f=O??$,{internal_querier:w}=E_H();' +
    'KG.useEffect(()=>{},[f,w]);' +
    'let Y=f==="auto"?z:f,' +
    'D=KG.useMemo(()=>({themeSetting:$,' +
    'setThemeSetting:(j)=>{if(K(j),T(null),j==="auto")A(IFH());q?.(j)},' +
    'setPreviewTheme:(j)=>{if(T(j),j==="auto")A(IFH())},' +
    'savePreview:()=>{if(O!==null)K(O),T(null),q?.(O)},' +
    'cancelPreview:()=>{if(O!==null)T(null)},' +
    'currentTheme:Y}),[K,O,Y,q]);' +
    'return KG.default.createElement(E0_.Provider,{value:D},H)}'
  );
}

// v2.1.86 ThemeProvider (single dep in older versions had two deps too)
function buildV286(): string {
  return (
    BUN_PREFIX +
    'function Cd8(){if(qR6===void 0)qR6=_k5()??"dark";return qR6}' +
    'function Ad(H){if(H==="auto")return Cd8();return H}' +
    'function _k5(){let H=process.env.COLORFGBG;if(!H)return;' +
    'let _=H.split(";"),q=_[_.length-1];' +
    'if(q===void 0||q==="")return;' +
    'let K=Number(q);if(!Number.isInteger(K)||K<0||K>15)return;' +
    'return K<=6||K===8?"dark":"light"}' +
    'var qR6;' +
    'function EGq({children:H,initialState:_,onThemeSave:q=Kk5}){' +
    'let[O,z]=zA.useState(_??Kk5),[Y,H2]=zA.useState(null),' +
    '[$,w]=zA.useState(()=>(_??O)==="auto"?Cd8():"dark"),' +
    'j=Y??O,{internal_querier:J}=yq8();' +
    'zA.useEffect(()=>{},[j,J]);' +
    'let T=j==="auto"?$:j,' +
    'X=zA.useMemo(()=>({themeSetting:O,' +
    'setThemeSetting:(D)=>{if(z(D),H2(null),D==="auto")w(Cd8());q?.(D)},' +
    'setPreviewTheme:(D)=>{if(H2(D),D==="auto")w(Cd8())},' +
    'savePreview:()=>{if(Y!==null)z(Y),H2(null),q?.(Y)},' +
    'cancelPreview:()=>{if(Y!==null)H2(null)},' +
    'currentTheme:T}),[O,Y,T,q]);' +
    'return zA.default.createElement(EGq.Provider,{value:X},H)}'
  );
}

const DEFAULT_CONFIG = { darkThemeId: 'dark', lightThemeId: 'light' };

describe('reactiveTheme', () => {
  beforeEach(() => {
    clearCaches();
  });

  // ====================================================================
  // useEffect patching
  // ====================================================================

  it('patches the empty useEffect in v2.1.89 style code', () => {
    const result = writeReactiveTheme(buildV289(), DEFAULT_CONFIG);

    expect(result).not.toBeNull();
    expect(result).toContain('/tw.js"');
    expect(result).toContain('(A,f,"dark","light",');
    expect(result).not.toContain('.useEffect(()=>{}');
  });

  it('patches the empty useEffect in v2.1.87 style code', () => {
    const result = writeReactiveTheme(buildV287(), DEFAULT_CONFIG);

    expect(result).not.toBeNull();
    expect(result).toContain('/tw.js"');
    expect(result).toContain('(A,w,"dark","light",');
    expect(result).not.toContain('.useEffect(()=>{}');
  });

  it('patches the empty useEffect in v2.1.86 style code', () => {
    const result = writeReactiveTheme(buildV286(), DEFAULT_CONFIG);

    expect(result).not.toBeNull();
    expect(result).toContain('/tw.js"');
    expect(result).toContain('(w,J,"dark","light",');
    expect(result).not.toContain('.useEffect(()=>{}');
  });

  it('uses custom theme IDs from config', () => {
    const result = writeReactiveTheme(buildV289(), {
      darkThemeId: 'dark-ansi',
      lightThemeId: 'light-ansi',
    });

    expect(result).not.toBeNull();
    expect(result).toContain('"dark-ansi","light-ansi"');
  });

  // ====================================================================
  // Idempotency
  // ====================================================================

  it('returns content unchanged when already patched', () => {
    const first = writeReactiveTheme(buildV289(), DEFAULT_CONFIG);
    expect(first).not.toBeNull();

    clearCaches();
    const second = writeReactiveTheme(first!, DEFAULT_CONFIG);
    expect(second).toBe(first);
  });

  // ====================================================================
  // Failure cases
  // ====================================================================

  it('returns null when ThemeProvider is not found', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      const result = writeReactiveTheme(
        BUN_PREFIX + 'const x = 1;',
        DEFAULT_CONFIG
      );
      expect(result).toBeNull();
      expect(consoleError).toHaveBeenCalledWith(
        'patch: reactiveTheme: failed to find ThemeProvider function'
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
