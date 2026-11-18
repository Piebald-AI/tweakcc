import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertPatchedModuleParses,
  PatchedModuleParseError,
} from './moduleParseGate';

// Shape of CC 2.1.296 chunk-kasbfbhj.js (#1040): an ES module with explicit
// resource management, which Bun runs but Node only parses from v24.
const USING_MODULE =
  'import{a as Hzn}from"/$bunfs/root/x.js";async function qtr(e){let n=e;try{await using r=await Hzn(n,1);return r}catch{}}async function S(y){using q=y.queueing;q.queued();for(await using f of y)f()}export{qtr,S};';

describe('assertPatchedModuleParses', () => {
  afterEach(() => vi.restoreAllMocks());

  it('accepts a module that uses `using` declarations on any Node (#1040)', () => {
    expect(() =>
      assertPatchedModuleParses('/m.js', USING_MODULE + 'var tweakcc=1;')
    ).not.toThrow();
  });

  it('accepts comments between `using` and the binding', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const commented =
      'async function f(g){using /* a */ r = g();await using// b\n s=g();using/*c*/q=g();return[r,s,q]}export{f};';
    expect(() =>
      assertPatchedModuleParses('/m.js', commented, () => commented)
    ).not.toThrow();
    // Really checked, not skipped as unparseable on this Node.
    expect(warn).not.toHaveBeenCalled();
  });

  it('still rejects a real syntax error next to `using` declarations', () => {
    expect(() =>
      assertPatchedModuleParses(
        '/m.js',
        USING_MODULE + 'var tweakcc=(;',
        () => USING_MODULE
      )
    ).toThrow(PatchedModuleParseError);
  });

  it('skips with a warning when this Node cannot parse the unpatched module either', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const future = 'let a = 1 @@ 2;';
    expect(() =>
      assertPatchedModuleParses(
        '/m.js',
        future + 'var tweakcc=1;',
        () => future
      )
    ).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('cannot parse the unpatched /m.js')
    );
  });
});
