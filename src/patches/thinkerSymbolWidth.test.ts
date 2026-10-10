import { describe, expect, it, vi } from 'vitest';

import {
  beginGraphContext,
  endGraphContext,
  enterGraphModule,
  leaveGraphModule,
} from './graphContext';
import {
  thinkerSymbolBoxWidth,
  writeThinkerSymbolWidthLocation,
} from './thinkerSymbolWidth';

describe('thinkerSymbolBoxWidth', () => {
  // All three branches of the shipped default in defaultSettings.ts. These must
  // stay at Claude Code's vanilla width:2, so the box is not silently widened
  // for users who never customized their symbols. `✳` (U+2733) is the one that
  // catches a naive display-width implementation: it is a text-presentation
  // dingbat that some width libraries count as an emoji, and therefore 2 cells.
  it.each([
    ['xterm-ghostty', ['·', '✢', '✳', '✶', '✻', '*']],
    ['darwin', ['·', '✢', '✳', '✶', '✻', '✽']],
    ['other', ['·', '✢', '*', '✶', '✻', '✽']],
  ])(
    'leaves the shipped default symbol set (%s) at the vanilla width',
    (_name, phases) => {
      expect(thinkerSymbolBoxWidth(phases as string[])).toBe(2);
    }
  );

  it('falls back to the vanilla width when there are no phases', () => {
    // Math.max() of nothing is -Infinity, which used to reach the bundle as
    // `width:-Infinity`. That is valid JavaScript, so neither node --check nor
    // the parse gate would catch it. A hand-edited config can empty the list.
    expect(thinkerSymbolBoxWidth([])).toBe(2);
  });

  it('sizes a wide symbol by display width, not UTF-16 code units', () => {
    // A regional-indicator flag is 2 surrogate pairs plus the trailing space:
    // 5 code units but 3 terminal cells.
    expect('🇦🇩 '.length).toBe(5);
    expect(thinkerSymbolBoxWidth(['🇦🇩 '])).toBe(4);
  });

  it('sizes an astral symbol by display width', () => {
    expect('🌍'.length).toBe(2);
    expect(thinkerSymbolBoxWidth(['🌍'])).toBe(3);
  });

  it('uses the widest phase in the set', () => {
    expect(thinkerSymbolBoxWidth(['·', '🇦🇩 ', '✻'])).toBe(4);
  });

  it('handles a combining sequence as one cell', () => {
    expect(thinkerSymbolBoxWidth(['é'])).toBe(2);
  });
});

describe('writeThinkerSymbolWidthLocation', () => {
  it('rewrites every memoized JSX-runtime spinner symbol box (CC 2.1.195+)', () => {
    // The React Compiler emits one memoized copy of the spinner symbol box per
    // render branch, each spreading the same unbraced layout run.
    const input =
      'k=K4.jsx(U,{"aria-hidden":!0,flexWrap:"wrap",height:1,width:2,children:I});' +
      'A=K4.jsx(U,{"aria-hidden":!0,flexWrap:"wrap",height:1,width:2,children:K4.jsx(w,{color:h,children:dJa})});' +
      'u=$f.jsx(U,{ref:r,"aria-hidden":!0,flexWrap:"wrap",height:1,width:2,children:c});';

    const result = writeThinkerSymbolWidthLocation(input, 4);

    expect(result).not.toBeNull();
    expect(result!.match(/flexWrap:"wrap",height:1,width:4/g)).toHaveLength(3);
    expect(result).not.toContain('width:2');
  });

  it('still rewrites the old braced object form (older Claude Code)', () => {
    const input = 'X.createElement(U,{flexWrap:"wrap",height:1,width:2},I)';

    const result = writeThinkerSymbolWidthLocation(input, 3);

    expect(result).toContain('{flexWrap:"wrap",height:1,width:3}');
  });

  it('leaves a same-shaped box alone when its function renders no spinner frame', () => {
    // Claude Code reuses this exact box shape outside the spinner: a
    // deadline/status component renders a static glyph in it. Rewriting that
    // one widens an unrelated part of the UI whenever the user picks wide
    // symbols, so only boxes in a function that references a patched frame
    // array may be resized.
    const input =
      'var jif=cet(),Uti=[...jif,...[...jif].reverse()];' +
      'function bMe(a){let I=Uti[a%Uti.length];' +
      'return K4.jsx(U,{"aria-hidden":!0,flexWrap:"wrap",height:1,width:2,children:I})}' +
      'function vkn(b){' +
      'return $f.jsx(U,{"aria-hidden":!0,flexWrap:"wrap",height:1,width:2,children:$f.jsx(w,{color:"error",children:m5})})}';

    const result = writeThinkerSymbolWidthLocation(input, 4);

    expect(result).not.toBeNull();
    expect(result!.match(/flexWrap:"wrap",height:1,width:4/g)).toHaveLength(1);
    expect(result).toContain(
      'flexWrap:"wrap",height:1,width:2,children:$f.jsx(w,{color:"error"'
    );
  });

  it('resizes every spinner box when a function renders more than one', () => {
    const input =
      'var Asf=cet(),Yti=[...Asf,...[...Asf].reverse()];' +
      'function Ku(){let H=Yti[i];' +
      'let a=ld.jsx(U,{ref:r,"aria-hidden":!0,flexWrap:"wrap",height:1,width:2,children:H});' +
      'let b=ld.jsx(U,{ref:r,"aria-hidden":!0,flexWrap:"wrap",height:1,width:2,children:H});return b}';

    const result = writeThinkerSymbolWidthLocation(input, 5);

    expect(result!.match(/flexWrap:"wrap",height:1,width:5/g)).toHaveLength(2);
  });

  it('scopes correctly when the frame array is minified to `$`', () => {
    // `$` is a valid identifier and minifiers emit it. Interpolated raw into an
    // alternation it becomes the end-of-input anchor, so the frame reference is
    // never found and every box falls back to being resized.
    const input =
      'var q=cet(),$=[...q,...[...q].reverse()];' +
      'function bMe(a){let I=$[a%$.length];' +
      'return K4.jsx(U,{"aria-hidden":!0,flexWrap:"wrap",height:1,width:2,children:I})}' +
      'function vkn(b){' +
      'return $f.jsx(U,{"aria-hidden":!0,flexWrap:"wrap",height:1,width:2,children:$f.jsx(w,{color:"error",children:m5})})}';

    const result = writeThinkerSymbolWidthLocation(input, 4);

    expect(result!.match(/flexWrap:"wrap",height:1,width:4/g)).toHaveLength(1);
    expect(result).toContain(
      'flexWrap:"wrap",height:1,width:2,children:$f.jsx(w,{color:"error"'
    );
  });

  it('scopes to boxes that call a frame getter imported from another module (CC 2.1.295)', () => {
    // Code-split builds define the frame arrays in one module and reach them
    // through an exported getter; the retry-status box (`lcn`) shows a static
    // glyph and must keep its width, the loader spinner (`di`) must not.
    const frames =
      'import{a}from"/$bunfs/root/chunk-tq5wzp66.js";var l=["\\xB7","\\u2722","\\u2733","\\u2736","\\u273B","\\u273B"],g=["\\xB7","\\u2722","\\u2733","\\u2736","\\u273B","\\u273D"],p=["\\xB7","\\u2722","*","\\u2736","\\u273B","\\u273D"],d=[...l,...l.toReversed()],y=[...g,...g.toReversed()],f=[...p,...p.toReversed()];function Ncn(){if(a.TERM==="xterm-ghostty")return l;return p}function YPe(){if(a.TERM==="xterm-ghostty")return d;return f}' +
      'export{Ncn,YPe};';
    const consumer =
      'import{Ncn,YPe}from"/$bunfs/root/chunk-9ne577yj.js";' +
      'function lcn(l){let c=w(57),{status:t,columns:m}=l,o=Math.max(0,Math.ceil((t.deadline-Date.now())/1000))*1000,g;if(c[0]!==t.kind)g=t.kind==="low_priority_waiting"?N3().waitBanner:null,c[0]=t.kind,c[1]=g;else g=c[1];let h=g;const C=o>=300000;let B;if(c[2]!==o||c[3]!==C)B=rn(o,{mostSignificantOnly:C}),c[2]=o,c[3]=C,c[4]=B;else B=c[4];let _=B,E;if(c[5]===S)E=e(s,{"aria-hidden":!0,flexWrap:"wrap",height:1,width:2,children:e(n,{color:"error",children:fP})}),c[5]=E;else E=c[5];let L=E;return L}' +
      'function di(){let c=w(9),l=tt(),t=yg(Uo(mr))||l,[m,o]=oa(t?null:120);if(t){let g;if(c[0]===S)g=e(n,{color:"text",children:"\\u25CF"}),c[0]=g;else g=c[0];let h;if(c[1]!==m)h=e(s,{ref:m,"aria-hidden":!0,flexWrap:"wrap",height:1,width:2,children:g}),c[1]=m,c[2]=h;else h=c[2];return h}let g;if(c[3]===S)g=YPe(),c[3]=g;else g=c[3];let C=g,B=Math.floor(o/120)%C.length;const h=C[B];let _;if(c[4]!==h)_=e(n,{color:"text",children:h}),c[4]=h,c[5]=_;else _=c[5];let E;if(c[6]!==m||c[7]!==_)E=e(s,{ref:m,"aria-hidden":!0,flexWrap:"wrap",height:1,width:2,children:_}),c[6]=m,c[7]=_,c[8]=E;else E=c[8];return E}';
    beginGraphContext(
      new Map([
        ['/$bunfs/root/chunk-9ne577yj.js', frames],
        ['/$bunfs/root/chunk-sk9xe51y.js', consumer],
      ])
    );
    enterGraphModule('/$bunfs/root/chunk-sk9xe51y.js');
    try {
      const result = writeThinkerSymbolWidthLocation(consumer, 4);

      expect(result!.match(/width:4,children:[g_]\}/g)).toHaveLength(2);
      expect(result).toContain(
        'flexWrap:"wrap",height:1,width:2,children:e(n,{color:"error",children:fP})'
      );
    } finally {
      leaveGraphModule();
      endGraphContext();
    }
  });

  it('returns null when no spinner symbol box is present', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = writeThinkerSymbolWidthLocation('const x=1;', 4);

    expect(result).toBeNull();
    spy.mockRestore();
  });
});
