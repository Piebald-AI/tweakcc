import { describe, expect, it, vi } from 'vitest';

import {
  writeSubscriptionFeaturesWithCustomAuth,
  writeSubscriptionFeaturesWithCustomAuthModules,
} from './subscriptionFeaturesWithCustomAuth';
import { applySubscriptionFeaturesToGraph } from './index';
import { DEFAULT_SETTINGS } from '../defaultSettings';
import type { TweakccConfig } from '../types';

const CALL = 'globalThis.__ccSubOK?.()';

// Identifier tables. `real` are the CC 2.1.332 minified names; `renamed`
// proves nothing depends on them (including `$` and multi-char names).
const REAL = {
  It: 'It',
  ya: 'ya',
  or: 'or',
  rV: 'rV',
  Xht: 'Xht',
  NB: 'NB',
  Vn: 'Vn',
  dd: 'dd',
  D0: 'D0',
  Phn: 'Phn',
  US: '_',
  H: 'h',
  M: 'm',
  C: 'C',
  Q: 'w',
  R: 'R',
  Y: 'ye',
  c9: 'c9',
  iP: 'iP',
  rz: 'rz',
  qae: 'qae',
  fie: 'fie',
  no: 'no',
  X7n: 'X7n',
  a3: 'a3',
  Noo: 'Noo',
  In: 'In',
  Dde: 'Dde',
  E: 's',
  bEs: 'bEs',
  Tp: 'Tp',
  kEs: 'kEs',
  Hwn: 'Hwn',
  Rpr: 'Rpr',
  Kr: 'Kr',
  Ope: 'Ope',
  un: 'un',
  k: 'k',
  iXs: 'iXs',
  wne: 'wne',
  ye: 'ye',
};
const RENAMED = Object.fromEntries(
  Object.keys(REAL).map((key, i) => [key, `$${key}Z${i}$`])
) as typeof REAL;

type Names = typeof REAL;

// Excerpts trimmed from CC 2.1.332 modules; one entry per module.
const modules = (n: Names): string[] => [
  // chunk-6bm6jz2w.js: isAnthropicAuthEnabled / isSubscriber / OAuth scopes
  `import{Vn as ${n.Vn}}from"/$bunfs/root/chunk-wkjwe08f.js";` +
    `function ${n.ya}(){let e=er();if(e&&HB())return!1;if(!gl())return!1;if(s.ANTHROPIC_UNIX_SOCKET)return!!s.CLAUDE_CODE_OAUTH_TOKEN;if(Ja())return!1;let n=!${n.Vn}(),o=lo()||{},g=e?Eg():vp(o.apiKeyHelper),h=Nh()??ko(),y;try{y=BN({skipRetrievingKeyFromApiKeyHelper:!0}).source}catch{return!1}return!n}` +
    `function ${n.or}(){if(HB()||jt()||aH()!==void 0)return null;return 1}` +
    `function ${n.rV}(e){return kSt(e)}function ${n.It}(){if(!${n.ya}())return!1;return ${n.rV}(${n.or}()?.scopes)}function ${n.NB}(){return ${n.Xht}(${n.or}())}` +
    `function ${n.Xht}(e){return ${n.rV}(e?.scopes)&&!!e?.accessToken}\n` +
    `export{${n.It} as isSubscriber,${n.or} as getOAuthTokens};`,
  // chunk-z9wdpp31.js: Remote Control gates
  `function ${n.D0}(){if(!${n.Vn}())return!1;if(vB()!==void 0)return!0;if(${n.E}.ANTHROPIC_UNIX_SOCKET)return!1;return ${n.dd}()}function ${n.Phn}(){return ${n.D0}()&&${n.US}()&&(${n.Q}("tengu_ccr_bridge",!1)||${n.R}())}function ${n.R}(){return!1}` +
    `function ${n.H}(){try{return Boolean(${n.or}()?.scopes?.includes(tI))}catch{return!1}}function ${n.US}(){try{return ${n.It}()}catch{return!1}}function ${n.M}(){try{return Gf()}catch{return!1}}function ${n.C}(){try{return ${n.ye}().oauthAccount}catch{return}}`,
  // chunk-f9ccqqn2.js: bridge token getter
  `function ${n.c9}(){let e=${n.iP}();if(e!==void 0)return e;if(!${n.Vn}()||!${n.It}()||${n.rz}())return;return ${n.qae}(${n.or}())?.accessToken}`,
  // chunk-xmt6jq00.js: command availability evaluator
  `function ${n.fie}(e){if(${n.no}().commandsOffHere?.(e))return!1;if(!e.availability)return!0;for(let n of e.availability)switch(n){case"claude-ai":if(${n.It}())return!0;break;case"console":if(!${n.It}()&&!AAe()&&ha())return!0;break;case"console-profile":if(vY()==="user_oauth"&&AP())return!0;break;default:{let r=n;break}}return!1}`,
  // chunk-bqhgd24a.js: /teleport, /remote-env, /autofix-pr, upsell stubs
  `var sBs={type:"local-jsx",name:"teleport",get description(){return"Resume a cloud session here"},aliases:["tp"],availability:["claude-ai","console-profile"],isEnabled:()=>${n.It}()||${n.X7n}(),policyGate:${n.a3},get isHidden(){return!nl(this)}};` +
    `var XEo={type:"local-jsx",name:"remote-env",description:"Choose the default environment for cloud agents",availability:["claude-ai","console-profile"],isEnabled:()=>${n.It}()||${n.X7n}(),policyGate:${n.a3},get isHidden(){return!nl(this)}};` +
    `function ${n.Noo}(){return(${n.It}()||${n.X7n}())&&${n.In}("allow_remote_sessions")}var D$s={type:"local-jsx",name:"autofix-pr",description:"Monitor and autofix any issues with the current PR",availability:["claude-ai","console-profile"]};` +
    `function ${n.iXs}(){return ${n.It}()}var jEo=[${n.wne}({name:"ultraplan",description:"A cloud session drafts a plan"})];`,
  // chunk-7hjyw5y0.js: /schedule skill
  `userInvocable:!0,isEnabled:()=>${n.Vn}()&&${n.It}()&&!${n.E}.CLAUDE_CODE_REMOTE&&${n.In}(${n.Dde}),policyGate:${n.a3},allowedTools:[Yr,"Bash(date *)"],`,
  // chunk-p0v2hpjq.js: RemoteTrigger tool
  `isEnabled(){return ${n.Vn}()&&${n.It}()&&!${n.E}.CLAUDE_CODE_REMOTE&&!0&&${n.In}("allow_remote_sessions")&&${n.In}(${n.Dde})},isConcurrencySafe(){return!0}`,
  // chunk-z2hgkt87.js: /voice visibility
  `function ${n.bEs}(){try{if(!${n.ya}())return!1;return ${n.Tp}()}catch{return!1}}function ${n.kEs}(){return ${n.Hwn}()===null&&${n.In}("allow_voice_mode")}function qun(){return ${n.bEs}()&&${n.kEs}()}`,
  // chunk-2mssrs1t.js: voice stream availability
  `function ${n.Rpr}(){if(!${n.ya}())return!1;let e=${n.or}();return e!==null&&e.accessToken!==null}var N=1024;`,
  // chunk-c8mkdy25.js: attachment upload base URL (leak)
  `function ${n.Kr}(){return ${n.Ope}()??${n.E}.ANTHROPIC_BASE_URL??${n.un}().BASE_API_URL}async function Ee(e){return 1}`,
  // chunk-kp3xqje3.js: project-file download (leak)
  `let e=await F(t.keep_existing?_.noTurn:_.startsTurn,0,y,void 0,{fileUuid:t.file_uuid,baseUrl:${n.k}()??${n.E}.ANTHROPIC_BASE_URL,modelCopy:!1,forPrefetch:!1,maxBytes:0,token:j});`,
];

const FIXTURES: Array<[string, Names]> = [
  ['real names', REAL],
  ['renamed identifiers', RENAMED],
];

const apply = (n: Names) => {
  const out = writeSubscriptionFeaturesWithCustomAuthModules(modules(n));
  if (!out.ok) throw new Error(`failed: ${out.missing.join(', ')}`);
  return out;
};

describe.each(FIXTURES)('subscriptionFeaturesWithCustomAuth (%s)', (_l, n) => {
  it('applies every point', () => {
    const out = apply(n);
    const [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10] = out.sources;
    expect(out.alreadyApplied).toBe(false);
    expect(out.skippedOptional).toEqual([]);

    // helper: appended before the trailing export, with resolved names
    expect(m0).toContain(
      `globalThis.__ccSubOK=()=>{try{return ${n.Vn}()&&${n.Xht}(${n.or}())}catch{return!1}};`
    );
    expect(m0.trimEnd().endsWith('getOAuthTokens};')).toBe(true);
    expect(m0.indexOf('__ccSubOK=')).toBeLessThan(m0.lastIndexOf('export{'));
    // P1, P2
    expect(m1).toContain(`return ${n.dd}()||${CALL}}function ${n.Phn}`);
    expect(m1).toContain(`try{return ${n.It}()||${CALL}}catch`);
    // P3
    expect(m2).toContain(
      `if(!${n.Vn}()||!(${n.It}()||${CALL})||${n.rz}())return;`
    );
    // P4 (allow-list by command name)
    expect(m3).toContain(
      `case"claude-ai":if(${n.It}()||${CALL}&&["voice","web-setup","ultraplan","teleport","remote-env","autofix-pr"].includes(e.name))return!0;break;case"console":`
    );
    // P5a, P5b (both), P6, P10
    expect(
      m4.split(`isEnabled:()=>${n.It}()||${CALL}||${n.X7n}(),policyGate:`)
        .length
    ).toBe(3);
    expect(m4).toContain(`return(${n.It}()||${CALL}||${n.X7n}())&&`);
    expect(m4).toContain(`function ${n.iXs}(){return ${n.It}()||${CALL}}`);
    // P7a, P7b
    expect(m5).toContain(
      `${n.Vn}()&&(${n.It}()||${CALL})&&!${n.E}.CLAUDE_CODE_REMOTE`
    );
    expect(m6).toContain(
      `${n.Vn}()&&(${n.It}()||${CALL})&&!${n.E}.CLAUDE_CODE_REMOTE&&!0`
    );
    // P7c, P7d
    expect(m7).toContain(`if(!${n.ya}()&&!${CALL})return!1;return ${n.Tp}()`);
    expect(m8).toContain(
      `function ${n.Rpr}(){if(!${n.ya}()&&!${CALL})return!1;`
    );
    // P8, P9: the OAuth token must never be sent to ANTHROPIC_BASE_URL
    expect(m9).toContain(
      `function ${n.Kr}(){return ${n.Ope}()??${n.un}().BASE_API_URL}`
    );
    expect(m10).toContain(`baseUrl:${n.k}(),modelCopy:!1,forPrefetch:!1`);
    expect(out.sources.join('\n')).not.toContain('ANTHROPIC_BASE_URL');
    // global predicates are untouched
    expect(m0).toContain(
      `function ${n.It}(){if(!${n.ya}())return!1;return ${n.rV}(${n.or}()?.scopes)}`
    );
  });

  it('produces parsable modules', () => {
    // Fixtures 5, 6 and 10 are object/statement fragments: wrap them.
    const wrap = [
      (c: string) => c,
      (c: string) => c,
      (c: string) => c,
      (c: string) => c,
      (c: string) => c,
      (c: string) => `({${c}})`,
      (c: string) => `({${c}})`,
      (c: string) => c,
      (c: string) => c,
      (c: string) => c,
      (c: string) => `async function f(){${c}}`,
    ];
    apply(n).sources.forEach((source, i) => {
      const code = source.replace(/^import.*?;|export\{[^}]*\};?\s*$/gs, '');
      expect(() => new Function(wrap[i](code))).not.toThrow();
    });
  });

  it('is all-or-nothing: a missing required point changes nothing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const drop of [2, 9, 10]) {
      // P3 / P8 / P9 each live alone in their module: break only that one
      const sources = modules(n);
      sources[drop] = 'function unrelated(){}';
      const out = writeSubscriptionFeaturesWithCustomAuthModules(sources);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.missing.join()).toMatch(/P3|P8|P9/);
      expect(
        writeSubscriptionFeaturesWithCustomAuth(sources.join('\n'))
      ).toBeNull();
    }
    spy.mockRestore();
  });

  it('fails when a required point is ambiguous', () => {
    const sources = modules(n);
    sources.push(sources[10]); // duplicate P9
    const out = writeSubscriptionFeaturesWithCustomAuthModules(sources);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.missing.join()).toContain('P9');
  });

  it('skips the optional upsell-stub point when it is missing', () => {
    const sources = modules(n).map(s =>
      s.replace(/function [^{]+\{return [^}]+\}var jEo=\[/, 'var jEo=[')
    );
    const out = writeSubscriptionFeaturesWithCustomAuthModules(sources);
    expect(out.ok && out.skippedOptional.join()).toContain('P10');
  });

  it('is idempotent', () => {
    const once = apply(n).sources;
    const twice = writeSubscriptionFeaturesWithCustomAuthModules(once);
    expect(twice.ok && twice.alreadyApplied).toBe(true);
    expect(twice.ok && twice.sources).toEqual(once);
  });

  it('only unlocks the allow-listed commands in availability', () => {
    const m3 = apply(n).sources[3];
    for (const name of ['upgrade', 'desktop', 'chrome', 'install-github-app'])
      expect(m3).not.toContain(`"${name}"`);
    // the original isSubscriber path stays first, intact
    expect(m3).toContain(`case"claude-ai":if(${n.It}()||`);
  });

  it('works on a single bundle (cli.js path)', () => {
    const single = modules(n).join('\n');
    const out = writeSubscriptionFeaturesWithCustomAuth(single);
    expect(out).not.toBeNull();
    expect(out!.split('globalThis.__ccSubOK=').length).toBe(2);
    expect(writeSubscriptionFeaturesWithCustomAuth(out!)).toBe(out);
  });
});

describe('applySubscriptionFeaturesToGraph', () => {
  const config = (enabled: boolean) =>
    ({
      settings: {
        ...DEFAULT_SETTINGS,
        misc: {
          ...DEFAULT_SETTINGS.misc,
          subscriptionFeaturesWithCustomAuth: enabled,
        },
      },
    }) as unknown as TweakccConfig;
  const graph = () =>
    new Map(
      modules(REAL).map((source, i) => [`/$bunfs/root/m${i}.js`, source])
    );

  it('is skipped when the setting is off', () => {
    const g = graph();
    expect(applySubscriptionFeaturesToGraph(config(false), g)?.skipped).toBe(
      true
    );
    expect([...g.values()]).toEqual(modules(REAL));
  });

  it('patches the whole graph when enabled', () => {
    const g = graph();
    const result = applySubscriptionFeaturesToGraph(config(true), g);
    expect(result).toMatchObject({ applied: true, failed: false });
    expect([...g.values()].join('\n')).toContain('__ccSubOK=');
  });

  it('reports failure naming the points and leaves the graph untouched', () => {
    const g = graph();
    g.set('/$bunfs/root/m10.js', 'nothing');
    const result = applySubscriptionFeaturesToGraph(config(true), g);
    expect(result).toMatchObject({ applied: false, failed: true });
    expect(result?.details).toContain('P9');
    expect(g.get('/$bunfs/root/m0.js')).toBe(modules(REAL)[0]);
  });
});
