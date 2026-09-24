import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  writePreventUnsupportedUpdates,
  writePreventUnsupportedUpdatesModules,
} from './preventUnsupportedUpdates';

// Minified call boundaries transcribed from CC 2.1.261. Business logic between
// them is replaced with deterministic policy/installer stubs: no tests install
// packages, switch native versions, or contact GitHub.
const installer = `
function Pce(e,t=!1,r){if(t)return dt(e,t,r);let d=Sn.of(U().host);if(d.inFlight)return n("installLatest: joining in-flight call"),d.inFlight;let f=dt(e,t,r);d.begin(f);let o=()=>{d.reset()};return f.then(o,o),f}
async function dt(e,t=!1,r){let d=await En(e,t);return {wasUpdated:d.success&&!d.wasSkipped,latestVersion:d.latestVersion}}
async function En(e,t=!1){let b=policyVersion??e;if(!t&&Oce(b))return i("tengu_native_update_skipped_minimum_version",{}),{success:!0,wasSkipped:!0,latestVersion:b};install(b);return {success:!0,latestVersion:b}}
`;
const caller = `
async function automatic(W){let R={};i("tengu_native_auto_updater_start",{});try{let J=await Pce(W,!1,R),Te="2.1.261";return J}catch(e){throw e}}
async function npmAutomatic(pe){let ce=false,me="2.1.261";if(!pe)return;if(ce)i("tengu_auto_updater_forced_downgrade",{from_version:Ms(me),to_version:Ms(pe)});install(pe)}
`;

/** Evaluates only fixture code, with controlled I/O and installer boundaries. */
function runtime(
  sources: string[],
  fetch = vi.fn().mockResolvedValue({ status: 200 })
) {
  const install = vi.fn();
  const state = {
    inFlight: null as Promise<unknown> | null,
    begin(p: Promise<unknown>) {
      this.inFlight = p;
    },
    reset() {
      this.inFlight = null;
    },
  };
  const sandbox = {
    fetch,
    install,
    AbortController,
    setTimeout,
    clearTimeout,
    policyVersion: null as string | null,
    Sn: { of: () => state },
    U: () => ({ host: {} }),
    n: vi.fn(),
    i: vi.fn(),
    Oce: () => false,
    Ms: (value: string) => value,
  };
  const api = vm.runInNewContext(
    sources.join('\n') + ';({automatic,npmAutomatic,manual:Pce});',
    sandbox
  ) as {
    automatic: (version: string) => Promise<{ wasUpdated: boolean }>;
    npmAutomatic: (version: string | null) => Promise<void>;
    manual: (version: string) => Promise<{ wasUpdated: boolean }>;
  };
  return { api, sandbox, fetch, install, state };
}

afterEach(() => vi.useRealTimers());

describe('modern automatic update guard', () => {
  it('requires all boundaries and rejects missing/ambiguous modules without partial edits', () => {
    expect(writePreventUnsupportedUpdatesModules([caller])).toBeNull();
    expect(writePreventUnsupportedUpdatesModules([installer])).toBeNull();
    expect(
      writePreventUnsupportedUpdatesModules([caller, installer, installer])
    ).toBeNull();
    expect(
      writePreventUnsupportedUpdatesModules([
        caller,
        installer.replace(
          'tengu_native_update_skipped_minimum_version',
          'changed-marker'
        ),
      ])
    ).toBeNull();
  });

  it('keeps unrelated modules byte-identical and recognizes a complete applied corpus', () => {
    const input = [caller, installer, '/* unrelated */'];
    const result = writePreventUnsupportedUpdatesModules(input)!;
    expect(result).not.toBeNull();
    expect(result[2]).toBe(input[2]);
    expect(input).toEqual([caller, installer, '/* unrelated */']);
    expect(writePreventUnsupportedUpdatesModules(result)).toEqual(result);
    expect(
      writePreventUnsupportedUpdatesModules([result[0], installer])
    ).toBeNull();
  });

  it('allows a published final target and preserves upstream policy selection', async () => {
    const run = runtime(
      writePreventUnsupportedUpdatesModules([caller, installer])!
    );
    run.sandbox.policyVersion = '2.1.262';
    expect((await run.api.automatic('latest')).wasUpdated).toBe(true);
    expect(run.install).toHaveBeenCalledWith('2.1.262');
    expect(run.fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/Piebald-AI/tweakcc/refs/heads/main/data/prompts/prompts-2.1.262.json',
      expect.objectContaining({
        method: 'HEAD',
        signal: expect.any(AbortSignal),
      })
    );
  });

  it.each([404, 429, 500, 204])(
    'blocks native and npm automatic updates on HTTP %i',
    async status => {
      const run = runtime(
        writePreventUnsupportedUpdatesModules([caller, installer])!,
        vi.fn().mockResolvedValue({ status })
      );
      expect((await run.api.automatic('2.1.262')).wasUpdated).toBe(false);
      await run.api.npmAutomatic('2.1.262');
      expect(run.install).not.toHaveBeenCalled();
    }
  );

  it('fails closed on transport errors and invalid version strings', async () => {
    const run = runtime(
      writePreventUnsupportedUpdatesModules([caller, installer])!,
      vi.fn().mockRejectedValue(new Error('offline'))
    );
    expect((await run.api.automatic('2.1.262')).wasUpdated).toBe(false);
    await run.api.npmAutomatic('../../main?x');
    await run.api.npmAutomatic(null);
    expect(run.fetch).toHaveBeenCalledTimes(1);
    expect(run.install).not.toHaveBeenCalled();
  });

  it('bounds a hung request to five seconds and aborts its signal', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    const run = runtime(
      writePreventUnsupportedUpdatesModules([caller, installer])!,
      fetch
    );
    const pending = run.api.automatic('2.1.262');
    await vi.advanceTimersByTimeAsync(5000);
    expect((await pending).wasUpdated).toBe(false);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(run.install).not.toHaveBeenCalled();
  });

  it('does not gate manual calls or join them to guarded single-flight work', async () => {
    const run = runtime(
      writePreventUnsupportedUpdatesModules([caller, installer])!,
      vi.fn().mockResolvedValue({ status: 404 })
    );
    // An existing manual promise must not substitute for a guarded candidate.
    run.state.inFlight = Promise.resolve({ wasUpdated: true });
    expect((await run.api.automatic('2.1.262')).wasUpdated).toBe(false);
    run.state.inFlight = null;
    expect((await run.api.manual('2.1.262')).wasUpdated).toBe(true);
    expect(run.fetch).toHaveBeenCalledTimes(1);
    expect(run.install).toHaveBeenCalledTimes(1);
  });

  it('chooses hygienic injected names even if the default identifier is in source', async () => {
    const result = writePreventUnsupportedUpdatesModules([
      caller + 'const __tweakcc408Supports = 1;',
      installer,
    ])!;
    const run = runtime(result);
    await run.api.automatic('2.1.262');
    expect(run.install).toHaveBeenCalledOnce();
  });
});

/** Includes all four shipped automatic installer branches, not just version lookup. */
function legacyFixture(current: string): string {
  return `async function update(){let ${current}={ISSUES_EXPLAINER:"report",VERSION:"2.1.20",BUILD_TIME:"time"}.VERSION,channel=settings()?.autoUpdatesChannel??"latest",target=await resolveVersion(channel),other=adjacent();if(target===${current})return target;let result,kind;if(method==="npm-local")log("AutoUpdater: Using local update method"),kind="local",result=await localInstall(channel);else if(method==="npm-global")log("AutoUpdater: Using global update method"),kind="global",result=await globalInstall();else{if(fallbackLocal)result=await localInstall(channel);else result=await globalInstall()}log("tengu_auto_updater_success");return target}`;
}

describe('legacy npm update guard', () => {
  it.each(['npm-local', 'npm-global', 'fallback-local', 'fallback-global'])(
    'pins %s to the checked candidate instead of resolving a tag again',
    async method => {
      const original = legacyFixture('current');
      const patched = writePreventUnsupportedUpdates(original)!;
      expect(patched).not.toBeNull();
      const localInstall = vi.fn();
      const globalInstall = vi.fn();
      const api = vm.runInNewContext(patched + ';update;', {
        settings: () => ({ autoUpdatesChannel: 'stable' }),
        resolveVersion: async () => '2.1.21',
        adjacent: () => {},
        method,
        fallbackLocal: method === 'fallback-local',
        localInstall,
        globalInstall,
        log: () => {},
        fetch: async () => ({ status: 200 }),
        AbortController,
        setTimeout,
        clearTimeout,
      }) as () => Promise<string>;
      expect(await api()).toBe('2.1.21');
      if (method.endsWith('local')) {
        expect(localInstall).toHaveBeenCalledWith('stable', '2.1.21');
        expect(globalInstall).not.toHaveBeenCalled();
      } else {
        expect(globalInstall).toHaveBeenCalledWith('2.1.21');
        expect(localInstall).not.toHaveBeenCalled();
      }
    }
  );

  it('rejects a legacy layout without all installer boundaries', () => {
    expect(
      writePreventUnsupportedUpdates(
        legacyFixture('current').replace(
          'else result=await globalInstall()',
          'else return'
        )
      )
    ).toBeNull();
  });

  it.each(['v', 'r', 'e', '$'])(
    'does not shadow an upstream current-version identifier named %s',
    async current => {
      const original = legacyFixture(current);
      const patched = writePreventUnsupportedUpdates(original)!;
      expect(patched).not.toBeNull();
      const adjacent = vi.fn();
      const api = vm.runInNewContext(patched + ';update;', {
        settings: () => ({}),
        resolveVersion: async () => '2.1.21',
        adjacent,
        fetch: async () => ({ status: 404 }),
        AbortController,
        setTimeout,
        clearTimeout,
      }) as () => Promise<string>;
      expect(await api()).toBe('2.1.20');
      expect(adjacent).toHaveBeenCalledOnce();
      expect(writePreventUnsupportedUpdates(patched)).toBe(patched);
    }
  );
});
