import { describe, expect, it } from 'vitest';

import { writeOpusplan1m } from './opusplan1m';

const createInput = (withWrapper: boolean): string => {
  const selectorReturn = withWrapper
    ? 'if(K==="opusplan")return v1A([...A,Mm3()]);'
    : 'if(K==="opusplan")return [...A,Mm3()];';
  const listReturn = withWrapper
    ? 'if(K===null||A.some((X)=>X.value===K))return v1A(A);'
    : 'if(K===null||A.some((X)=>X.value===K))return A;';

  return `function z(){if(K8A()==="opusplan"&&K==="plan"&&!Y)return q8A();let k0A=["sonnet","opus","haiku","sonnet[1m]","opusplan"];if(T==="opusplan")return"Opus 4.6 in plan mode, else Sonnet 4.6";if(T==="opusplan")return"Opus Plan";${listReturn}${selectorReturn}return A;}`;
};

describe('writeOpusplan1m', () => {
  it('keeps output syntactically valid for wrapped selector returns', () => {
    const output = writeOpusplan1m(createInput(true));

    expect(output).toBeTruthy();
    expect(output).toContain(
      'if(T==="opusplan")return"Opus 4.6 in plan mode, else Sonnet 4.6";if(T==="opusplan[1m]")return"Opus 4.6 in plan mode, else Sonnet 4.6 (1M context)";'
    );
    expect(output).toContain('if(K==="opusplan[1m]")return v1A([');
    expect(output).not.toContain('returnv1A');
    expect(() => new Function(output!)).not.toThrow();
  });

  it('keeps output syntactically valid for bare array selector returns', () => {
    const output = writeOpusplan1m(createInput(false));

    expect(output).toBeTruthy();
    expect(output).toContain('if(K==="opusplan[1m]")return [...A,');
    expect(() => new Function(output!)).not.toThrow();
  });
});
