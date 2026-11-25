import { describe, expect, it } from 'vitest';

import { writeCodeModeSchemaDefaults } from './codeModeSchemaDefaults';

// CC 2.1.332, chunk-vm2n0e41.js: the function that adds a field's facts to
// its doc comment in Code Mode's TypeScript types.
const FACTS =
  'function X(e,n,o){if(!o.hasFacts)return e;let t=n.filter(h).flatMap((r)=>[...U(r),...["format","pattern","default"].flatMap((s)=>{let i=Object.hasOwn(r,s)?r:Z(r),a=h(i)?S(i,s):void 0;if(a===void 0||a===null)return[];let l=typeof a==="object"||String(a).length>ge?"":s==="format"?String(a):_(a);if(l===""||l.length>ge||/\\s\\s|```|\\*\\//.test(l))return o.isWhole&&=typeof a==="object"&&ZO(a),[];return[`${s} ${l}`]})]);return t.length===0?e:`${e??""} (${D(t.join(", "),o)})`.trimStart()}';

const isObject = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Returns the doc comment text of a field with the given schema.
const docOf = (
  code: string,
  description: string | undefined,
  schema: object,
  hasFacts: boolean
) =>
  new Function('h', 'U', 'Z', 'S', 'ge', '_', 'D', 'ZO', `${code};return X`)(
    isObject,
    (s: { type?: string }) => (s.type === 'integer' ? ['integer'] : []),
    () => undefined,
    (s: Record<string, unknown>, key: string) =>
      Object.hasOwn(s, key) ? s[key] : undefined,
    80,
    JSON.stringify,
    (text: string) => text,
    () => false
  )(description, [schema], { hasFacts, isWhole: true }) as string | undefined;

const timeout = {
  type: 'integer',
  format: 'uint64',
  default: 5000,
};

describe('writeCodeModeSchemaDefaults', () => {
  it('drops the default without facts when unpatched', () => {
    expect(docOf(FACTS, 'Max wait.', timeout, false)).toBe('Max wait.');
    expect(docOf(FACTS, 'Max wait.', timeout, true)).toBe(
      'Max wait. (integer, format uint64, default 5000)'
    );
  });

  it('keeps only the default without facts', () => {
    const patched = writeCodeModeSchemaDefaults(FACTS)!;
    expect(docOf(patched, 'Max wait.', timeout, false)).toBe(
      'Max wait. (default 5000)'
    );
    expect(docOf(patched, undefined, { default: 'text' }, false)).toBe(
      '(default "text")'
    );
    expect(docOf(patched, 'Max wait.', { type: 'integer' }, false)).toBe(
      'Max wait.'
    );
    expect(docOf(patched, 'Max wait.', timeout, true)).toBe(
      'Max wait. (integer, format uint64, default 5000)'
    );
  });

  it('returns null when the facts printer is not there', () => {
    expect(writeCodeModeSchemaDefaults('let x=1;')).toBeNull();
    expect(
      writeCodeModeSchemaDefaults(FACTS.replace('"pattern",', ''))
    ).toBeNull();
  });
});
