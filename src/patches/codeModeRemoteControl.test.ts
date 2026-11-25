import { describe, expect, it } from 'vitest';

import { writeCodeModeRemoteControl } from './codeModeRemoteControl';
import { KNOWN, OPT_IN, settle } from './codeModeOptIn.fixture';
import { PatchGroup } from './index';
import { applyPatchImplementationsToGraph } from './nativeGraphDispatcher';

// The bridge's eligibility checks from CC 2.1.332 (chunk-z9wdpp31.js):
// isBridgeEnabled, its helper, isBridgeOffByAnOptInAlone,
// getBridgeBlockedCode and getBridgeDisabledDiagnosis.
const BRIDGE =
  'var l=(e,n)=>({reason:n,code:e,orgPolicyDenied:!1});function a$(){if(_Ve())return!1;if(g())return!0;if(hi())return!1;return P()}function P(){if(TK())return!1;return!AK()&&Phn()}function $xr(){return hi()&&!_Ve()&&!g()&&P()&&lft()==="allowed"}async function Gxs(e){if(_Ve())return"not_signed_in";if(g())return null;if(hi())return"repl_mode";if(TK())return"managed_disabled";if(!D0())return"not_first_party";if(AK())return"cloud_session";if(!_())return h()?"not_subscription_auth":"not_signed_in";if(await Y(e),R()||await sR("tengu_ccr_bridge"))return null;if(!kd())return"flags_disabled";return Qs()?"gate_off":"flags_unreachable"}async function qKn(){let e=YKn();if(e!==void 0)return l("not_signed_in",e);if(g())return null;if(hi())return l("repl_mode",`Remote Control isn\'t available in ${GS} yet. ${X5i()}`);if(!D0())return l("not_first_party",le());if(AK())return l("cloud_session","Remote Control is not available inside a cloud session.");if(TK())return l("managed_disabled",Due);let n=vud();if(n!==void 0)return l("not_signed_in",n);if(!h())return l("not_signed_in","Remote Control requires a claude.ai subscription. Run `claude auth login` to sign in with your claude.ai account.");if(!_())return l("not_subscription_auth",mxt({prefix:"Remote Control requires claude.ai subscription auth.",suffix:"to use Remote Control."}));await Y(void 0);let o=K();if(!o&&!m())return l("token_scope_limited",Imt()??"Remote Control requires a full-scope login token. Long-lived tokens (from `claude setup-token` or CLAUDE_CODE_OAUTH_TOKEN) are limited to inference-only for security reasons. Run `claude auth login` to use Remote Control.");if(!o&&!C()?.organizationUuid)return l("no_organization","Unable to determine your organization for Remote Control eligibility. Run `claude auth login` to refresh your account information.");await p_e();let r=lft();if(r==="unavailable")return l("policy_unverified",rPs);if(r==="denied")return{reason:j(),code:"org_policy_denied",orgPolicyDenied:!0};if(R())return null;if(!kd()){let a=Ber()??FW();if(a)return l("flags_disabled",`Remote Control requires feature-flag evaluation, which is disabled because ${a} is set. Unset it (or run in a shell without it) to use Remote Control.`);return l("flags_disabled","Remote Control requires feature-flag evaluation, which is unavailable in this environment.")}if(!await sR("tengu_ccr_bridge")){if(!Qs()){if($j(),await sR("tengu_ccr_bridge"))return null;if(!Qs())return l("flags_unreachable","Couldn\'t verify Remote Control eligibility \\u2014 the feature-flag service was unreachable (offline or blocked). Retry, or run with `--debug` / `claude doctor` for details.")}return l("gate_off","Remote Control isn\'t enabled for this account. If you recently changed plans, run `claude auth logout` then `claude auth login` to refresh your entitlements, or `claude doctor` for details.")}return null}';

const NAMES = [
  '$j',
  'AK',
  'Ber',
  'C',
  'D0',
  'FW',
  'Imt',
  'K',
  'Phn',
  'Qs',
  'R',
  'TK',
  'X5i',
  'Y',
  'YKn',
  '_',
  '_Ve',
  'g',
  'h',
  'hi',
  'j',
  'kd',
  'le',
  'lft',
  'm',
  'mxt',
  'p_e',
  'sR',
  'vud',
  'GS',
  'Due',
  'rPs',
];

/** The bridge's checks for a signed-in session in Code Mode. */
const bridge = async (code: string) => {
  const stubs: Record<string, unknown> = {
    _Ve: () => false,
    g: () => false,
    hi: () => true,
    TK: () => false,
    AK: () => false,
    Phn: () => true,
    lft: () => 'allowed',
    D0: () => true,
    _: () => true,
    h: () => true,
    Y: async () => {},
    R: () => true,
    sR: async () => true,
    kd: () => true,
    K: () => true,
    p_e: async () => {},
    X5i: () => 'Quit and start again.',
    GS: 'Code Mode',
  };
  const checks = new Function(
    ...NAMES,
    `${code};return {isBridgeEnabled:a$,offByOptIn:$xr,blockedCode:Gxs,diagnosis:qKn};`
  )(...NAMES.map(name => stubs[name] ?? (() => undefined)));
  return {
    isBridgeEnabled: checks.isBridgeEnabled(),
    offByOptIn: checks.offByOptIn(),
    blockedCode: await checks.blockedCode(),
    diagnosis: (await checks.diagnosis())?.code ?? null,
  };
};

const GATE_MODULE = '/$bunfs/root/chunk-4mjjf5rb.js';
const BRIDGE_MODULE = '/$bunfs/root/chunk-z9wdpp31.js';

const onGraph = (modules: Record<string, string>) => {
  const sources = new Map(Object.entries(modules));
  const { results } = applyPatchImplementationsToGraph(
    sources,
    { p: { fn: writeCodeModeRemoteControl } },
    [{ id: 'p', name: 'p', group: PatchGroup.FEATURES }]
  );
  return { sources, result: results[0] };
};

describe('writeCodeModeRemoteControl', () => {
  it('keeps Code Mode and Remote Control apart without the patch', async () => {
    expect(await settle(KNOWN + OPT_IN, { remoteControl: true })).toEqual({
      state: 'refused',
      why: 'unattended',
    });
    expect(await bridge(BRIDGE)).toEqual({
      isBridgeEnabled: false,
      offByOptIn: true,
      blockedCode: 'repl_mode',
      diagnosis: 'repl_mode',
    });
  });

  it('lets a Code Mode session use Remote Control', async () => {
    const { sources, result } = onGraph({
      [GATE_MODULE]: KNOWN + OPT_IN,
      [BRIDGE_MODULE]: BRIDGE,
    });
    expect(result).toMatchObject({ applied: true });
    expect(
      await settle(sources.get(GATE_MODULE)!, {
        headless: false,
        entrypoint: 'cli',
        remoteControl: true,
      })
    ).toEqual({ state: 'on', source: 'flagSettings' });
    expect(await bridge(sources.get(BRIDGE_MODULE)!)).toEqual({
      isBridgeEnabled: true,
      offByOptIn: false,
      blockedCode: null,
      diagnosis: null,
    });
  });

  it('keeps background sessions and teammates refused', async () => {
    const patched = writeCodeModeRemoteControl(KNOWN + OPT_IN + BRIDGE)!;
    const interactive = { headless: false, entrypoint: 'cli' };
    expect(await settle(patched, { ...interactive, bgSession: true })).toEqual({
      state: 'refused',
      why: 'unattended',
    });
    expect(patched).toContain('e.teammate||s.CLAUDE_BRIDGE_REATTACH_SESSION');
  });

  it('changes nothing unless every site is there', () => {
    const modules = { [GATE_MODULE]: KNOWN + OPT_IN };
    const { sources, result } = onGraph(modules);
    expect(result).toMatchObject({ applied: false, failed: true });
    expect(Object.fromEntries(sources)).toEqual(modules);
    expect(writeCodeModeRemoteControl('let x=1;')).toBeNull();
    expect(
      writeCodeModeRemoteControl(
        KNOWN + OPT_IN + BRIDGE.replace('if(hi())return!1;', '')
      )
    ).toBeNull();
  });
});
