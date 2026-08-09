import { describe, expect, it, vi } from 'vitest';

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

  it('returns null when no spinner symbol box is present', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = writeThinkerSymbolWidthLocation('const x=1;', 4);

    expect(result).toBeNull();
    spy.mockRestore();
  });
});
