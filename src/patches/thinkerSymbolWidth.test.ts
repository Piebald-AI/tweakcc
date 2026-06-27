import { describe, expect, it, vi } from 'vitest';

import { writeThinkerSymbolWidthLocation } from './thinkerSymbolWidth';

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

  it('returns null when no spinner symbol box is present', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = writeThinkerSymbolWidthLocation('const x=1;', 4);

    expect(result).toBeNull();
    spy.mockRestore();
  });
});
