import { describe, expect, it } from 'vitest';

import { writeCodeModeReplPostToolUseForMods } from './codeModeReplPostToolUseForMods';

// The Code Mode tool-hook filter from CC 2.1.332 (chunk-cy4eag9j.js).
const FILTER =
  'var Ut={"tool.call":"tool","tool.check":"tool","tool.judge":"tool","tool.run":"tool","classic.PreToolUse":"tool","classic.PermissionRequest":"tool_name","classic.PermissionDenied":"tool_name","classic.PostToolUse":"tool_name","classic.PostToolUseFailure":"tool_name"};function Xbo(e,o,n){if(o==="tool.check"&&UQ(n)&&n.op!==void 0&&!gg(e))return co(e,o,(f)=>Object.hasOwn(f,"op"));{let f=Ut[o];if(f===void 0||!hi()||!UQ(n))return e;let m=n[f],l=n.tool_use_id;if(!(typeof m==="string"&&(m===bo||hs(m))&&!B7n(m)&&!(typeof l==="string"&&pK(l))&&!gg(e)))return e;return co(e,o,(g)=>go(g[f]).some((h)=>m===bo?h===m:hs(h)))}return e}function co(e,o,n){let a=e.registrationsFor(o),f=a.filter((m)=>!e.standingFor(o,a.filter((l)=>l!==m)).some(({matcher:l})=>UQ(l)&&n(l)));return e.hooks(o,f)?Ge(e,f):void 0}function go(e){if(Array.isArray(e))return e.flatMap(go);return PYt(e)?fMt(e).source.replace(/\\\\./g," ").split(/\\W+/):[e]}';

type Matcher = Record<string, unknown> | undefined;
type Module = {
  leftOut?: string[];
  registrationsFor: () => string[];
  standingFor: (event: string, leftOut: string[]) => { matcher: Matcher }[];
  hooks: (event: string, leftOut?: string[]) => boolean;
};

// A loaded mod with one registration per entry, keyed by name.
const mod = (registrations: Record<string, Matcher>): Module => {
  const names = Object.keys(registrations);
  const standing = (leftOut: string[]) =>
    names.filter(name => !leftOut.includes(name));
  return {
    registrationsFor: () => names,
    standingFor: (_event, leftOut) =>
      standing(leftOut).map(name => ({ matcher: registrations[name] })),
    hooks: (_event, leftOut = []) => standing(leftOut).length > 0,
  };
};

const filter = (code: string) =>
  new Function(
    'UQ',
    'gg',
    'hi',
    'bo',
    'hs',
    'B7n',
    'pK',
    'PYt',
    'fMt',
    'Ge',
    `${code};return Xbo;`
  )(
    (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v),
    () => false,
    () => true,
    'Poll',
    (name: string) => name === 'REPL' || name === 'Eval',
    () => false,
    (id: string) => id.startsWith('toolu_plugin_'),
    (v: unknown) => v instanceof RegExp,
    (v: RegExp) => v,
    (m: Module, leftOut: string[]) => ({ ...m, leftOut })
  ) as (m: Module, event: string, call: object) => Module | undefined;

const replPostToolUse = { tool_name: 'REPL', tool_use_id: 'toolu_01' };
const replPreToolUse = { tool: 'REPL', tool_use_id: 'toolu_01' };

describe('writeCodeModeReplPostToolUseForMods', () => {
  it('leaves a catch-all PostToolUse hook out for REPL, without the patch', () => {
    const run = filter(FILTER);
    expect(
      run(mod({ all: undefined }), 'classic.PostToolUse', replPostToolUse)
    ).toBeUndefined();
    expect(
      run(
        mod({ all: undefined, repl: { tool_name: 'REPL' } }),
        'classic.PostToolUse',
        replPostToolUse
      )?.leftOut
    ).toEqual(['all']);
  });

  it('runs a catch-all PostToolUse hook for REPL and Poll, with the patch', () => {
    const run = filter(writeCodeModeReplPostToolUseForMods(FILTER)!);
    const m = mod({ all: undefined });
    expect(run(m, 'classic.PostToolUse', replPostToolUse)).toBe(m);
    expect(
      run(m, 'classic.PostToolUse', { tool_name: 'Poll', tool_use_id: 'x' })
    ).toBe(m);
  });

  it('keeps the other events seeing only the inner calls', () => {
    const run = filter(writeCodeModeReplPostToolUseForMods(FILTER)!);
    const m = mod({ all: undefined, repl: { tool: 'REPL' } });
    expect(run(m, 'classic.PreToolUse', replPreToolUse)?.leftOut).toEqual([
      'all',
    ]);
    expect(run(m, 'tool.call', replPreToolUse)?.leftOut).toEqual(['all']);
    expect(
      run(
        mod({ all: undefined }),
        'classic.PostToolUseFailure',
        replPostToolUse
      )
    ).toBeUndefined();
  });

  it('returns null when the table is not there', () => {
    expect(writeCodeModeReplPostToolUseForMods('let x=1;')).toBeNull();
    expect(
      writeCodeModeReplPostToolUseForMods(
        FILTER.replace('"classic.PostToolUse":"tool_name",', '')
      )
    ).toBeNull();
  });
});
