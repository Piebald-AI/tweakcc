// Please see the note about writing patches in ./index

/**
 * Keep claude.ai subscription features working while Claude Code runs against a
 * custom inference endpoint (`ANTHROPIC_BASE_URL` and/or `ANTHROPIC_AUTH_TOKEN`).
 *
 * With either variable set, Claude Code treats the session as "not a
 * subscriber": Remote Control, /voice and the cloud-session commands
 * (/teleport, /schedule, /remote-env, /autofix-pr, /web-setup, /ultraplan,
 * /ultrareview) disappear even though a claude.ai OAuth login is stored. All
 * of those features talk to Anthropic's own hosts with the OAuth token and
 * never to the inference endpoint, so they can be unlocked narrowly.
 *
 * The global predicates (isSubscriber, isAnthropicAuthEnabled, the first-party
 * base-URL check, ...) are deliberately NOT touched: they also steer the
 * inference client, `/upgrade`, `/desktop`, `/chrome`, cost warnings and the
 * model picker. Instead a helper `globalThis.__ccSubOK()` ("a valid
 * subscription OAuth login is stored and the provider is first party") is
 * defined next to the OAuth-scope check, and only the gates listed below call
 * it, always as `globalThis.__ccSubOK?.()` so a missing helper can never throw.
 *
 * ALL OR NOTHING. The patch spans many modules of a code-split build. Every
 * REQUIRED point must match exactly once in the whole graph; otherwise nothing
 * is changed and the result names the missing points. The two leak fixes
 * (P8, P9) are required: unlocking the gates makes code paths reachable that
 * would otherwise send the OAuth token to `ANTHROPIC_BASE_URL`. OPTIONAL points
 * are applied only when they match exactly once, and are skipped otherwise.
 *
 * Points (CC 2.1.332 names in parentheses are for orientation only; matching is
 * structural and never relies on minified names):
 *
 *  H   helper definition, appended to the module that defines the
 *      OAuth-scope check (`It`, `or`, `Xht`) [required]
 *  P1  first-party base-URL gate `D0()`: `...return dd()` -> `||helper` [required]
 *  P2  Remote Control "subscription auth" gate `_()` [required]
 *  P3  bridge token getter `c9()`: `!It()` -> `!(It()||helper)` [required]
 *  P4  command availability evaluator, case "claude-ai", limited by command
 *      name to an allow-list of commands that pass through it [required]
 *  P5a /teleport `isEnabled` [required]
 *  P5b /remote-env `isEnabled` [required]
 *  P6  /autofix-pr gate [required]
 *  P7a /schedule skill `isEnabled` [required]
 *  P7b RemoteTrigger tool `isEnabled` (used by /schedule) [required]
 *  P7c /voice visibility (`qun` -> `bEs`) [required]
 *  P7d /voice stream availability (`Rpr`) [required]
 *  P8  leak fix: bridge attachment upload base must not be ANTHROPIC_BASE_URL [required]
 *  P9  leak fix: project-file download base must not be ANTHROPIC_BASE_URL [required]
 *  P10 "available with Claude for Enterprise" upsell stubs that would shadow
 *      the real commands (only reachable with ANTHROPIC_AUTH_TOKEN and no
 *      custom base URL, and behind a server flag) [optional]
 */

const ID = '[$\\w]+';
const ENV = '[$\\w.]+'; // `s` in native builds, `process.env` in npm bundles

const MARKER = '/* tweakcc:subscription-features-with-custom-auth */';
const HELPER_CALL = 'globalThis.__ccSubOK?.()';

/**
 * Commands whose `availability` includes "claude-ai" and that are unlocked by
 * P4. Only commands that actually go through the availability evaluator are
 * listed: remote-control, schedule and ultrareview declare no `availability`
 * (they are gated by their own `isEnabled`, covered by other points), while
 * /upgrade, /desktop, /chrome, /access, /use-case and /install-slack-app stay
 * hidden.
 */
const P4_ALLOW_LIST = [
  'voice',
  'web-setup',
  'ultraplan',
  'teleport',
  'remote-env',
  'autofix-pr',
];

interface Point {
  id: string;
  /** What the point unlocks or fixes, for diagnostics. */
  label: string;
  required: boolean;
  /** Literal that must be in a module for the pattern to be tried (speed). */
  anchor: string;
  pattern: RegExp;
  replace: (groups: Record<string, string>) => string;
}

// `pre`/`post` are the text around an inserted `||helper`; every pattern's
// groups cover the whole match so the replacement is rebuilt from them.
const orHelper = (g: Record<string, string>) =>
  `${g.pre}||${HELPER_CALL}${g.post}`;
const andNotHelper = (g: Record<string, string>) =>
  `${g.pre}&&!${HELPER_CALL}${g.post}`;
const wrapOrHelper = (g: Record<string, string>) =>
  `${g.pre}(${g.id}()||${HELPER_CALL})${g.post}`;

const POINTS: Point[] = [
  {
    id: 'P1',
    label: 'first-party base-URL gate (Remote Control, ultraplan, ultrareview)',
    required: true,
    anchor: 'tengu_ccr_bridge',
    // function D0(){...if(s.ANTHROPIC_UNIX_SOCKET)return!1;return dd()}function Phn(){return D0()&&_()&&(w("tengu_ccr_bridge",!1)||R())}
    pattern: new RegExp(
      `(?<pre>if\\(${ENV}\\.ANTHROPIC_UNIX_SOCKET\\)return!1;return ${ID}\\(\\))(?<post>\\}function ${ID}\\(\\)\\{return ${ID}\\(\\)&&${ID}\\(\\)&&\\(${ID}\\("tengu_ccr_bridge")`
    ),
    replace: orHelper,
  },
  {
    id: 'P2',
    label: 'Remote Control subscription-auth gate',
    required: true,
    anchor: '.oauthAccount',
    // function h(){try{return Boolean(or()?.scopes?.includes(tI))}catch{return!1}}function _(){try{return It()}catch{return!1}}function m(){...}function C(){try{return ye().oauthAccount}
    pattern: new RegExp(
      `(?<pre>\\?\\.scopes\\?\\.includes\\(${ID}\\)\\)\\}catch\\{return!1\\}\\}function ${ID}\\(\\)\\{try\\{return ${ID}\\(\\))(?<post>\\}catch\\{return!1\\}\\}function ${ID}\\(\\)\\{try\\{return ${ID}\\(\\)\\}catch\\{return!1\\}\\}function ${ID}\\(\\)\\{try\\{return ${ID}\\(\\)\\.oauthAccount)`
    ),
    replace: orHelper,
  },
  {
    id: 'P3',
    label: 'bridge OAuth token getter',
    required: true,
    anchor: '?.accessToken}',
    // function c9(){let e=iP();if(e!==void 0)return e;if(!Vn()||!It()||rz())return;return qae(or())?.accessToken}
    pattern: new RegExp(
      `(?<pre>function ${ID}\\(\\)\\{let (?<v>${ID})=${ID}\\(\\);if\\(\\k<v>!==void 0\\)return \\k<v>;if\\(!${ID}\\(\\)\\|\\|!)(?<id>${ID})\\(\\)(?<post>\\|\\|${ID}\\(\\)\\)return;return ${ID}\\(${ID}\\(\\)\\)\\?\\.accessToken\\})`
    ),
    replace: wrapOrHelper,
  },
  {
    id: 'P4',
    label: 'command availability "claude-ai" (allow-list by command name)',
    required: true,
    anchor: 'commandsOffHere',
    // function fie(e){if(no().commandsOffHere?.(e))return!1;if(!e.availability)return!0;for(let n of e.availability)switch(n){case"claude-ai":if(It())return!0;break;case"console":
    pattern: new RegExp(
      `(?<pre>function ${ID}\\((?<cmd>${ID})\\)\\{if\\(${ID}\\(\\)\\.commandsOffHere\\?\\.\\(\\k<cmd>\\)\\)return!1;if\\(!\\k<cmd>\\.availability\\)return!0;for\\(let ${ID} of \\k<cmd>\\.availability\\)switch\\(${ID}\\)\\{case"claude-ai":if\\()(?<id>${ID})\\(\\)(?<post>\\)return!0;break;case"console":)`
    ),
    replace: g =>
      `${g.pre}${g.id}()||${HELPER_CALL}&&${JSON.stringify(P4_ALLOW_LIST)}.includes(${g.cmd}.name)${g.post}`,
  },
  {
    id: 'P5a',
    label: '/teleport isEnabled',
    required: true,
    anchor: 'name:"teleport"',
    pattern: new RegExp(
      `(?<pre>name:"teleport",[\\s\\S]{0,200}?availability:\\["claude-ai","console-profile"\\],isEnabled:\\(\\)=>${ID}\\(\\))(?<post>\\|\\|${ID}\\(\\),policyGate:)`
    ),
    replace: orHelper,
  },
  {
    id: 'P5b',
    label: '/remote-env isEnabled',
    required: true,
    anchor: 'name:"remote-env"',
    pattern: new RegExp(
      `(?<pre>name:"remote-env",[\\s\\S]{0,200}?availability:\\["claude-ai","console-profile"\\],isEnabled:\\(\\)=>${ID}\\(\\))(?<post>\\|\\|${ID}\\(\\),policyGate:)`
    ),
    replace: orHelper,
  },
  {
    id: 'P6',
    label: '/autofix-pr gate',
    required: true,
    anchor: 'name:"autofix-pr"',
    // function Noo(){return(It()||X7n())&&In("allow_remote_sessions")}var D$s={type:"local-jsx",name:"autofix-pr"
    pattern: new RegExp(
      `(?<pre>function ${ID}\\(\\)\\{return\\(${ID}\\(\\))(?<post>\\|\\|${ID}\\(\\)\\)&&${ID}\\("allow_remote_sessions"\\)\\}var ${ID}=\\{type:"local-jsx",name:"autofix-pr")`
    ),
    replace: orHelper,
  },
  {
    id: 'P7a',
    label: '/schedule skill isEnabled',
    required: true,
    anchor: 'CLAUDE_CODE_REMOTE',
    // isEnabled:()=>Vn()&&It()&&!s.CLAUDE_CODE_REMOTE&&In(Dde),policyGate:a3
    pattern: new RegExp(
      `(?<pre>isEnabled:\\(\\)=>${ID}\\(\\)&&)(?<id>${ID})\\(\\)(?<post>&&!${ENV}\\.CLAUDE_CODE_REMOTE&&${ID}\\(${ID}\\),policyGate:)`
    ),
    replace: wrapOrHelper,
  },
  {
    id: 'P7b',
    label: 'RemoteTrigger tool isEnabled',
    required: true,
    anchor: 'CLAUDE_CODE_REMOTE',
    // isEnabled(){return Vn()&&It()&&!s.CLAUDE_CODE_REMOTE&&!0&&In("allow_remote_sessions")&&In(Dde)}
    pattern: new RegExp(
      `(?<pre>isEnabled\\(\\)\\{return ${ID}\\(\\)&&)(?<id>${ID})\\(\\)(?<post>&&!${ENV}\\.CLAUDE_CODE_REMOTE&&!0&&${ID}\\("allow_remote_sessions"\\)&&${ID}\\(${ID}\\)\\})`
    ),
    replace: wrapOrHelper,
  },
  {
    id: 'P7c',
    label: '/voice visibility',
    required: true,
    anchor: 'allow_voice_mode',
    // function bEs(){try{if(!ya())return!1;return Tp()}catch{return!1}}function kEs(){return Hwn()===null&&In("allow_voice_mode")}
    pattern: new RegExp(
      `(?<pre>function ${ID}\\(\\)\\{try\\{if\\(!${ID}\\(\\))(?<post>\\)return!1;return ${ID}\\(\\)\\}catch\\{return!1\\}\\}function ${ID}\\(\\)\\{return ${ID}\\(\\)===null&&${ID}\\("allow_voice_mode"\\)\\})`
    ),
    replace: andNotHelper,
  },
  {
    id: 'P7d',
    label: '/voice stream availability',
    required: true,
    anchor: '.accessToken!==null}',
    // function Rpr(){if(!ya())return!1;let e=or();return e!==null&&e.accessToken!==null}
    pattern: new RegExp(
      `(?<pre>function ${ID}\\(\\)\\{if\\(!${ID}\\(\\))(?<post>\\)return!1;let (?<v>${ID})=${ID}\\(\\);return \\k<v>!==null&&\\k<v>\\.accessToken!==null\\})`
    ),
    replace: andNotHelper,
  },
  {
    id: 'P8',
    label: 'leak fix: attachment upload base URL',
    required: true,
    anchor: 'BASE_API_URL}',
    // function Kr(){return Ope()??s.ANTHROPIC_BASE_URL??un().BASE_API_URL}
    pattern: new RegExp(
      `function (?<fn>${ID})\\(\\)\\{return (?<a>${ID})\\(\\)\\?\\?${ENV}\\.ANTHROPIC_BASE_URL\\?\\?(?<b>${ID})\\(\\)\\.BASE_API_URL\\}`
    ),
    replace: g => `function ${g.fn}(){return ${g.a}()??${g.b}().BASE_API_URL}`,
  },
  {
    id: 'P9',
    label: 'leak fix: project-file download base URL',
    required: true,
    anchor: 'forPrefetch',
    // {fileUuid:t.file_uuid,baseUrl:k()??s.ANTHROPIC_BASE_URL,modelCopy:!1,forPrefetch:!1,
    pattern: new RegExp(
      `(?<pre>fileUuid:${ID}\\.file_uuid,baseUrl:${ID}\\(\\))\\?\\?${ENV}\\.ANTHROPIC_BASE_URL(?<post>,modelCopy:!1,forPrefetch:!1)`
    ),
    replace: g => `${g.pre}${g.post}`,
  },
  {
    id: 'P10',
    label: 'Enterprise upsell stubs that shadow the real commands',
    required: false,
    anchor: '"ultraplan"',
    // function iXs(){return It()}var jEo=[wne({name:"ultraplan",
    pattern: new RegExp(
      `(?<pre>function ${ID}\\(\\)\\{return ${ID}\\(\\))(?<post>\\}var ${ID}=\\[${ID}\\(\\{name:"ultraplan",)`
    ),
    replace: orHelper,
  },
];

/** One located match of a pattern, in graph (module index) coordinates. */
interface Location {
  module: number;
  start: number;
  end: number;
  groups: Record<string, string>;
}

/** Every match of `pattern` in the sources that contain `anchor`. */
const locateAll = (
  sources: readonly string[],
  anchor: string,
  pattern: RegExp
): Location[] => {
  const out: Location[] = [];
  const global = new RegExp(pattern.source, 'g');
  sources.forEach((source, module) => {
    if (!source.includes(anchor)) return;
    for (const match of source.matchAll(global)) {
      out.push({
        module,
        start: match.index!,
        end: match.index! + match[0].length,
        groups: { ...match.groups },
      });
    }
  });
  return out;
};

// The OAuth-scope check lives in one module:
//   function It(){if(!ya())return!1;return rV(or()?.scopes)}function NB(){return Xht(or())}
// groups: rV (scope test), or (stored OAuth tokens), Xht (valid subscription login).
const SCOPE_CHECK = new RegExp(
  `function ${ID}\\(\\)\\{if\\(!${ID}\\(\\)\\)return!1;return (?<scope>${ID})\\((?<or>${ID})\\(\\)\\?\\.scopes\\)\\}function ${ID}\\(\\)\\{return (?<xht>${ID})\\(\\k<or>\\(\\)\\)\\}`
);
// ...in the same module, isAnthropicAuthEnabled() starts with the provider check:
//   let n=!Vn(),o=lo()||{},g=e?Eg():vp(o.apiKeyHelper),
const FIRST_PARTY_CHECK = new RegExp(
  `;let ${ID}=!(?<vn>${ID})\\(\\),${ID}=${ID}\\(\\)\\|\\|\\{\\},${ID}=${ID}\\?${ID}\\(\\):${ID}\\(${ID}\\.apiKeyHelper\\),`
);

const escapeRegExp = (s: string) => s.replace(/[$]/g, '\\$&');

type HelperResolution =
  | { ok: true; module: number; code: string }
  | { ok: false; missing: string };

/** Resolves the helper's dependencies from their bodies and builds its source. */
const resolveHelper = (sources: readonly string[]): HelperResolution => {
  const scope = locateAll(sources, '?.scopes)}', SCOPE_CHECK);
  if (scope.length !== 1)
    return {
      ok: false,
      missing: `H (OAuth-scope check, ${scope.length} matches)`,
    };
  const { module, groups } = scope[0];
  const source = sources[module];
  const xhtDefinition = new RegExp(
    `function ${escapeRegExp(groups.xht)}\\((?<v>${ID})\\)\\{return ${escapeRegExp(groups.scope)}\\(\\k<v>\\?\\.scopes\\)&&!!\\k<v>\\?\\.accessToken\\}`
  );
  if (locateAll([source], 'accessToken', xhtDefinition).length !== 1)
    return { ok: false, missing: 'H (valid-subscription check definition)' };
  const firstParty = locateAll([source], 'apiKeyHelper', FIRST_PARTY_CHECK);
  if (firstParty.length !== 1)
    return { ok: false, missing: 'H (first-party provider check)' };
  const { vn } = firstParty[0].groups;
  return {
    ok: true,
    module,
    code: `${MARKER}globalThis.__ccSubOK=()=>{try{return ${vn}()&&${groups.xht}(${groups.or}())}catch{return!1}};`,
  };
};

export type SubscriptionFeaturesOutcome =
  | {
      ok: true;
      sources: string[];
      /** The graph already carries the patch; sources are unchanged. */
      alreadyApplied: boolean;
      /** Optional points that were not found exactly once and so were skipped. */
      skippedOptional: string[];
    }
  | { ok: false; missing: string[] };

/**
 * Patches a complete source corpus (every JavaScript module of a code-split
 * native build, or a one-element array for a single bundle). Locates every
 * point first; returns `ok: false` naming the points that matched 0 or more
 * than 1 times, without producing any edit.
 */
export const writeSubscriptionFeaturesWithCustomAuthModules = (
  sources: readonly string[]
): SubscriptionFeaturesOutcome => {
  if (sources.some(source => source.includes(MARKER)))
    return {
      ok: true,
      sources: [...sources],
      alreadyApplied: true,
      skippedOptional: [],
    };

  const missing: string[] = [];
  const skippedOptional: string[] = [];
  const edits: Array<Location & { text: string }> = [];

  const helper = resolveHelper(sources);
  if (!helper.ok) missing.push(helper.missing);

  for (const point of POINTS) {
    const found = locateAll(sources, point.anchor, point.pattern);
    if (found.length === 1) {
      edits.push({ ...found[0], text: point.replace(found[0].groups) });
    } else if (point.required) {
      missing.push(`${point.id} ${point.label} (${found.length} matches)`);
    } else {
      skippedOptional.push(`${point.id} (${found.length} matches)`);
    }
  }
  if (missing.length > 0 || !helper.ok) return { ok: false, missing };

  // Overlapping edits would corrupt each other: treat as a failed location.
  const byModule = new Map<number, Array<Location & { text: string }>>();
  for (const edit of edits)
    byModule.set(edit.module, [...(byModule.get(edit.module) ?? []), edit]);
  for (const list of byModule.values()) {
    list.sort((a, b) => a.start - b.start);
    if (list.some((edit, i) => i > 0 && edit.start < list[i - 1].end))
      return { ok: false, missing: ['overlapping patch points'] };
  }

  const result = [...sources];
  for (const [module, list] of byModule) {
    // Right to left so earlier offsets stay valid.
    for (const edit of [...list].reverse())
      result[module] =
        result[module].slice(0, edit.start) +
        edit.text +
        result[module].slice(edit.end);
  }

  // Append the helper, keeping a trailing `export{…};` last.
  const hostSource = result[helper.module];
  const trailingExport = hostSource.match(/export\{[^}]*\};?\s*$/);
  result[helper.module] =
    trailingExport?.index !== undefined
      ? hostSource.slice(0, trailingExport.index) +
        helper.code +
        '\n' +
        hostSource.slice(trailingExport.index)
      : hostSource + '\n' + helper.code;

  return { ok: true, sources: result, alreadyApplied: false, skippedOptional };
};

/**
 * Single-bundle path (cli.js, or a native build that is one claude.js): the
 * same locate/replace over one source. Returns it unchanged if already
 * patched, or null (naming the missing points) if any required point fails.
 */
export const writeSubscriptionFeaturesWithCustomAuth = (
  oldFile: string
): string | null => {
  const outcome = writeSubscriptionFeaturesWithCustomAuthModules([oldFile]);
  if (!outcome.ok) {
    console.error(
      `patch: subscriptionFeaturesWithCustomAuth: required points not found exactly once: ${outcome.missing.join('; ')}`
    );
    return null;
  }
  return outcome.sources[0];
};
