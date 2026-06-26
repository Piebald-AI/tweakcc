import { describe, it, expect } from 'vitest';

import { writeInputChevronColor } from './inputChevronColor';

const chevron =
  ',{isLoading:n,themeColor:r}=e,s=r??void 0,i;' +
  'if(t[0]!==s||t[1]!==n)' +
  'i=Kne.jsxs(w,{color:s,dimColor:n,children:[et.pointer,"\\xA0"]})';

const makeInput = () => 'var a=1' + chevron + ',t[2]=i;else i=t[2];return i';

describe('writeInputChevronColor', () => {
  it('replaces color/dimColor with conditional resolved color', () => {
    const result = writeInputChevronColor(makeInput(), 'red');

    expect(result).not.toBeNull();
    expect(result).toContain('color:n?s:"red",dimColor:!1');
    expect(result).not.toContain('color:s,dimColor:n');
  });

  it('returns null when pattern not found', () => {
    const result = writeInputChevronColor('const x=1;', 'red');

    expect(result).toBeNull();
  });

  it('returns null when already patched', () => {
    const patched = writeInputChevronColor(makeInput(), 'red')!;
    const result = writeInputChevronColor(patched, 'red');

    expect(result).toBeNull();
  });

  it('works with different identifier names', () => {
    const input =
      'var a=1,{isLoading:X$,themeColor:Y$}=Z$,W$=Y$??void 0,V$;' +
      'if(Q$[0]!==W$||Q$[1]!==X$)' +
      'V$=R$.jsxs(T$,{color:W$,dimColor:X$,children:[U$.pointer,"\\xA0"]})';
    const result = writeInputChevronColor(input, 'blue');

    expect(result).not.toBeNull();
    expect(result).toContain('color:X$?W$:"blue",dimColor:!1');
  });
});
