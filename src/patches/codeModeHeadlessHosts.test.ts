import { afterEach, describe, expect, it } from 'vitest';

import { BRIDGE } from './graphContext';
import { PatchGroup } from './index';
import { writeCodeModeHeadlessHosts } from './codeModeHeadlessHosts';
import { applyPatchImplementationsToGraph } from './nativeGraphDispatcher';
import { KNOWN, OPT_IN, settle } from './codeModeOptIn.fixture';

describe('writeCodeModeHeadlessHosts', () => {
  afterEach(() => {
    delete (globalThis as { __tweakccExports?: unknown }).__tweakccExports;
  });

  const patched = () => writeCodeModeHeadlessHosts(KNOWN + OPT_IN)!;

  it('refuses a host entrypoint and an opt-in outside --settings without the patch', async () => {
    const code = KNOWN + OPT_IN;
    expect(await settle(code, { entrypoint: 't3-code' })).toEqual({
      state: 'refused',
      why: 'entrypoint',
    });
    expect(await settle(code, { source: 'shell' })).toEqual({
      state: 'refused',
      why: 'not_passed',
    });
  });

  it('turns Code Mode on for a host with its own entrypoint', async () => {
    expect(await settle(patched(), { entrypoint: 't3-code' })).toEqual({
      state: 'on',
      source: 'flagSettings',
    });
  });

  it("keeps Claude Code's own hosts refused", async () => {
    for (const entrypoint of ['claude-vscode', 'claude-desktop', 'mcp']) {
      expect(await settle(patched(), { entrypoint })).toEqual({
        state: 'refused',
        why: 'entrypoint',
      });
    }
  });

  it('accepts the environment and user settings once the caveats were accepted', async () => {
    for (const source of ['shell', 'userSettings']) {
      expect(await settle(patched(), { source })).toEqual({
        state: 'on',
        source,
      });
      expect(
        await settle(patched(), { source, caveatsAccepted: false })
      ).toEqual({ state: 'refused', why: 'not_passed' });
    }
  });

  it('leaves interactive launches alone', async () => {
    expect(
      await settle(patched(), { headless: false, entrypoint: 't3-code' })
    ).toEqual({ state: 'refused', why: 'entrypoint' });
    expect(
      await settle(patched(), { headless: false, entrypoint: 'cli' })
    ).toEqual({ state: 'on', source: 'flagSettings' });
  });

  it('reads the table of entrypoints from the module that defines it', async () => {
    const owner = '/$bunfs/root/chunk-entry.js';
    const gate = '/$bunfs/root/chunk-gate.js';
    const sources = new Map([
      [owner, `${KNOWN}export{u5s,f5s};`],
      [gate, OPT_IN],
    ]);
    const { results } = applyPatchImplementationsToGraph(
      sources,
      { p: { fn: writeCodeModeHeadlessHosts } },
      [{ id: 'p', name: 'p', group: PatchGroup.FEATURES }]
    );
    expect(results[0]).toMatchObject({ applied: true });
    const gateCode = sources.get(gate)!;
    expect(gateCode).toContain(`${BRIDGE}.chunk_entry_js__f5s.has(`);

    new Function(sources.get(owner)!.replace(/export\{[^}]*\};$/, ''))();
    expect(await settle(gateCode, { entrypoint: 't3-code' })).toEqual({
      state: 'on',
      source: 'flagSettings',
    });
  });

  it('returns null when an anchor is missing', () => {
    expect(writeCodeModeHeadlessHosts('let x=1;')).toBeNull();
    expect(
      writeCodeModeHeadlessHosts(KNOWN + OPT_IN.replace('"not_passed"', '"x"'))
    ).toBeNull();
    expect(writeCodeModeHeadlessHosts(OPT_IN)).toBeNull();
  });
});
