import { describe, expect, it, vi } from 'vitest';

import { writeContextLimit } from './contextLimit';

describe('writeContextLimit', () => {
  const ENV = '(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||200000)';

  it('overrides both 200000 constants in the CC >=2.1.193 dual tuple', () => {
    // Real 2.1.195 shape: var YOt=200000,Pte=200000,Evi=20000,Wkd=32000,qkd=128000;
    const input = 'var $Pt=200000,Aee=200000,thi=20000,Yfd=32000,Xfd=128000;';

    const result = writeContextLimit(input);

    expect(result).toBe(
      `var $Pt=${ENV},Aee=${ENV},thi=20000,Yfd=32000,Xfd=128000;`
    );
  });

  it('does not mangle $-prefixed var names via String.replace $-substitution', () => {
    const input = 'var $1=200000,$2=200000,a=20000,b=32000,c=128000;';

    const result = writeContextLimit(input);

    expect(result).toBe(`var $1=${ENV},$2=${ENV},a=20000,b=32000,c=128000;`);
  });

  it('accepts the 64000 group-6 variant', () => {
    const input = 'var A=200000,B=200000,C=20000,D=32000,E=64000;';

    const result = writeContextLimit(input);

    expect(result).toBe(`var A=${ENV},B=${ENV},C=20000,D=32000,E=64000;`);
  });

  it('falls back to the older single-200000 tuple', () => {
    const input = 'var A=200000,B=20000,C=32000,D=128000;';

    const result = writeContextLimit(input);

    expect(result).toBe(`var A=${ENV},B=20000,C=32000,D=128000;`);
  });

  it('returns null and logs when no context-limit tuple is present', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = writeContextLimit('var x=1,y=2;');

    expect(result).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
