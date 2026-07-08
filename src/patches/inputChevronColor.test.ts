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

  it('handles the CC 2.1.199 shape (isScreenReader field + extra pointer var + 3-term guard)', () => {
    const input =
      'var z=1,{isLoading:n,isScreenReader:r,themeColor:o}=e,i=o??void 0,a=r?"$":ct.pointer,l;' +
      'if(t[0]!==i||t[1]!==n||t[2]!==a)' +
      'l=yQe.jsxs(w,{color:i,dimColor:n,children:[a,"\\xA0"]}),t[0]=i;else l=t[3]';
    const result = writeInputChevronColor(input, 'red');

    expect(result).not.toBeNull();
    expect(result).toContain('color:n?i:"red",dimColor:!1');
    expect(result).not.toContain('color:i,dimColor:n');
  });

  it('handles the CC 2.1.204 shape (semicolon after void 0 + const/let between init and guard)', () => {
    const input =
      'var z=1,{isLoading:QFp,isScreenReader:MOC,themeColor:$OC}=POC,' +
      'ZFp=$OC??void 0;const e2p=MOC?"$":Oe.pointer;let w9_;' +
      'if(OOC[0]!==ZFp||OOC[1]!==QFp||OOC[2]!==e2p)' +
      'w9_=I_e.jsxs(h,{color:ZFp,dimColor:QFp,children:[e2p,"\\xA0"]}),OOC[0]=ZFp';
    const result = writeInputChevronColor(input, 'red');

    expect(result).not.toBeNull();
    expect(result).toContain('color:QFp?ZFp:"red",dimColor:!1');
    expect(result).not.toContain('color:ZFp,dimColor:QFp');
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
