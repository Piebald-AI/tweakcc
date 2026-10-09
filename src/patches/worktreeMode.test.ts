import { describe, expect, it } from 'vitest';

import { PatchGroup } from './index';
import { applyPatchImplementationsToGraph } from './nativeGraphDispatcher';
import { writeWorktreeMode } from './worktreeMode';

// Real CC 2.1.295 chunks (license header trimmed).
const GATE = '/$bunfs/root/chunk-05hepw72.js';
const REEXPORT = '/$bunfs/root/chunk-am4fx1hs.js';
const TOOLS = '/$bunfs/root/chunk-e02cmmnv.js';
const REEXPORT_SRC =
  'import{Vmt}from"/$bunfs/root/chunk-05hepw72.js";export{Vmt as isWorktreeModeEnabled};\n';
const TOOLS_SRC =
  'import{Vmt}from"/$bunfs/root/chunk-05hepw72.js";var ED="EnterWorktree";var t=[...w0e()?[Et]:[],...Vmt()?[wr,Rr]:[],xt()];';

const onGraph = (modules: Record<string, string>) => {
  const sources = new Map(Object.entries(modules));
  const out = applyPatchImplementationsToGraph(
    sources,
    { 'worktree-mode': { fn: writeWorktreeMode } },
    [{ id: 'worktree-mode', name: 'w', group: PatchGroup.MISC_CONFIGURABLE }]
  );
  return { sources, result: out.results[0] };
};

describe('writeWorktreeMode', () => {
  it('forces the tengu_worktree_mode gate on (CC 2.1.42)', () => {
    expect(
      writeWorktreeMode('function ef6(){return r8("tengu_worktree_mode",!1)}')
    ).toBe('function ef6(){return !0;return r8("tengu_worktree_mode",!1)}');
  });

  it('is satisfied unchanged when the re-exported gate returns true (CC 2.1.295)', () => {
    const modules = {
      [GATE]: 'function Vmt(){return!0}\nexport{Vmt};\n',
      [REEXPORT]: REEXPORT_SRC,
      [TOOLS]: TOOLS_SRC,
    };
    const { sources, result } = onGraph(modules);
    expect(result).toMatchObject({ applied: false, failed: false });
    expect(Object.fromEntries(sources)).toEqual(modules);
  });

  it('patches the gate in the chunk the re-export points to', () => {
    const { sources, result } = onGraph({
      [GATE]: 'function Vmt(){return r8("tengu_wt",!1)}\nexport{Vmt};\n',
      [REEXPORT]: REEXPORT_SRC,
      [TOOLS]: TOOLS_SRC,
    });
    expect(result).toMatchObject({ applied: true, failed: false });
    expect(sources.get(GATE)).toBe(
      'function Vmt(){return !0;return r8("tengu_wt",!1)}\nexport{Vmt};\n'
    );
    expect(sources.get(TOOLS)).toBe(TOOLS_SRC);
  });

  it('fails when nothing exports isWorktreeModeEnabled', () => {
    const { result } = onGraph({
      [GATE]: 'function Vmt(){return!0}\nexport{Vmt};\n',
      [TOOLS]: TOOLS_SRC,
    });
    expect(result).toMatchObject({ applied: false, failed: true });
  });
});
