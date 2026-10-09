import { describe, expect, it, vi } from 'vitest';

import { writeWorktreeMode, writeWorktreeModeModules } from './worktreeMode';

// Real CC 2.1.295 excerpts (chunk-05hepw72.js, chunk-am4fx1hs.js, chunk-68qfmyns.js).
const GATE_CHUNK = 'function Vmt(){return!0}\nexport{Vmt};\n';
const REEXPORT_CHUNK =
  'import{Vmt}from"/$bunfs/root/chunk-05hepw72.js";export{Vmt as isWorktreeModeEnabled};\n';
const CLI_EXCERPT =
  'let Do=S4o(o.autocompact),Io=Vmt()?o.worktree:void 0,no=typeof Io==="string"?Io:void 0,Re=Io!==void 0,Mn;';

const corpus = (gateChunk: string) =>
  new Map([
    ['/$bunfs/root/chunk-05hepw72.js', gateChunk],
    ['/$bunfs/root/chunk-am4fx1hs.js', REEXPORT_CHUNK],
    ['/$bunfs/root/chunk-68qfmyns.js', CLI_EXCERPT],
  ]);

describe('writeWorktreeMode', () => {
  it('forces the tengu_worktree_mode gate on (CC 2.1.42)', () => {
    const input = 'function ef6(){return r8("tengu_worktree_mode",!1)}';
    expect(writeWorktreeMode(input)).toBe(
      'function ef6(){return !0;return r8("tengu_worktree_mode",!1)}'
    );
  });

  it('returns a hardwired gate unchanged (CC 2.1.295 shape in one bundle)', () => {
    const input = GATE_CHUNK + CLI_EXCERPT;
    expect(writeWorktreeMode(input)).toBe(input);
  });

  it('returns null without a gate', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(writeWorktreeMode('var ED="EnterWorktree";')).toBeNull();
    spy.mockRestore();
  });
});

describe('writeWorktreeModeModules', () => {
  it('reports the hardwired CC 2.1.295 gate as satisfied without edits', () => {
    expect(writeWorktreeModeModules(corpus(GATE_CHUNK))).toEqual(new Map());
  });

  it('patches the gate chunk behind the isWorktreeModeEnabled re-export', () => {
    const result = writeWorktreeModeModules(
      corpus('function Vmt(){return r8("tengu_worktree_mode",!1)}export{Vmt};')
    );
    expect(result).toEqual(
      new Map([
        [
          '/$bunfs/root/chunk-05hepw72.js',
          'function Vmt(){return !0;return r8("tengu_worktree_mode",!1)}export{Vmt};',
        ],
      ])
    );
  });

  it('returns null when the re-export is missing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      writeWorktreeModeModules(new Map([['a.js', GATE_CHUNK]]))
    ).toBeNull();
    spy.mockRestore();
  });
});
