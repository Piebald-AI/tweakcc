// Please see the note about writing patches in ./index
//
// Code Mode in -p and SDK Hosts Patch - let stream-json hosts such as T3 Code
// and Orca start Code Mode (anthropics/claude-code#109679)
//
// Claude Code 2.1.332 already runs Code Mode headless (-p, stream-json, the
// Agent SDK): script calls reach the host as ordinary tool_use blocks with
// `toolu_cc_` ids, and their permission prompts go through the host's
// permission prompt tool. Two checks keep other hosts out
// (chunk-4mjjf5rb.js):
//
//   var ce=new Set(["sdk-cli","sdk-ts","sdk-py"]);function I(e,n){...
//     let t=ge();if((t?!ce.has(cs()??""):cs()!=="cli")||...)return"entrypoint";
//   ...let v=I(e,!0),P=M&&o.source!=="flagSettings"&&v!=="entrypoint"?"not_passed":v;
//
// 1. A headless launch must use an SDK entrypoint. A host that sets its own
//    CLAUDE_CODE_ENTRYPOINT (T3 Code sets `t3-code`) is refused as
//    "entrypoint", although Claude Code treats such unknown entrypoints like
//    the SDK elsewhere (fn_49b9c200 in chunk-3h03n3jx.js:
//    `fn_a460df84(v1) || !val_60759ead.has(v1)`). This patch accepts every
//    entrypoint missing from Claude Code's own table of entrypoints
//    (`var f5s=new Set(Object.keys(u5s))`, u5s={cli:!0,mcp:!0,"sdk-cli":!0,...}).
//    Claude Code's own hosts (VS Code, Desktop, cloud) stay refused.
// 2. A headless launch must get CLAUDE_CODE_EXPERIMENTAL_CODE_MODE from the
//    env block of --settings; from the process environment or
//    ~/.claude/settings.json it is refused as "not_passed". Headless launches
//    can't show the opt-in dialog, so the host has to ask for the mode itself.
//    This patch also accepts the environment and user settings once the
//    dialog was answered in a terminal (`z()`: codeModeCaveatsAcceptedV1 and
//    codeModeAutoModeCaveatAcceptedV1 in ~/.claude.json).

import { isGraphContextActive, resolveAcrossGraph } from './graphContext';
import { showDiff } from './index';

/** Local name of Claude Code's set of known entrypoints in `source`. */
const findKnownEntrypoints = (source: string): string | undefined => {
  const table = source.match(
    /[,;{\s]([$\w]+)=\{cli:!0,mcp:!0,"sdk-cli":!0/
  )?.[1];
  if (!table) return undefined;
  const escaped = table.replace(/\$/g, '\\$');
  return source.match(
    new RegExp(`[,;{\\s]([$\\w]+)=new Set\\(Object\\.keys\\(${escaped}\\)\\)`)
  )?.[1];
};

const knownEntrypoints = (file: string): string | undefined =>
  findKnownEntrypoints(file) ??
  (isGraphContextActive()
    ? resolveAcrossGraph('known-entrypoints', findKnownEntrypoints)
    : undefined);

export const writeCodeModeHeadlessHosts = (oldFile: string): string | null => {
  const entrypointCheck =
    /\(([$\w]+)\?!([$\w]+)\.has\(([$\w]+)\(\)\?\?""\):\3\(\)!=="cli"\)/g;
  const optInCheck =
    /([$\w]+)&&([$\w]+)\.source!=="flagSettings"&&([$\w]+)!=="entrypoint"\?"not_passed":\3/g;
  const caveatsAccepted =
    /function ([$\w]+)\(\)\{let ([$\w]+)=[$\w]+\(\);return \2\.codeModeCaveatsAcceptedV1===!0&&\2\.codeModeAutoModeCaveatAcceptedV1===!0\}/g;

  const entrypoints = [...oldFile.matchAll(entrypointCheck)];
  const optIns = [...oldFile.matchAll(optInCheck)];
  const caveats = [...oldFile.matchAll(caveatsAccepted)];
  if (entrypoints.length !== 1 || optIns.length !== 1 || caveats.length !== 1) {
    console.error(
      `patch: codeModeHeadlessHosts: expected one entrypoint check, opt-in check and caveats check, found ${entrypoints.length}, ${optIns.length}, ${caveats.length}`
    );
    return null;
  }
  const known = knownEntrypoints(oldFile);
  if (!known) {
    console.error(
      'patch: codeModeHeadlessHosts: could not find the set of known entrypoints'
    );
    return null;
  }

  const [, headless, sdkEntrypoints, entrypoint] = entrypoints[0];
  const [, headlessOptIn, asked, refusal] = optIns[0];
  const accepted = caveats[0][1];
  // Applied back to front so the first edit does not move the second.
  const edits = [
    {
      match: entrypoints[0],
      replacement: `(${headless}?!(${sdkEntrypoints}.has(${entrypoint}()??"")||${entrypoint}()!==void 0&&!${known}.has(${entrypoint}())):${entrypoint}()!=="cli")`,
    },
    {
      match: optIns[0],
      replacement: `${headlessOptIn}&&${asked}.source!=="flagSettings"&&!${accepted}()&&${refusal}!=="entrypoint"?"not_passed":${refusal}`,
    },
  ].sort((a, b) => b.match.index! - a.match.index!);

  let newFile = oldFile;
  for (const { match, replacement } of edits) {
    const start = match.index!;
    const end = start + match[0].length;
    const before = newFile;
    newFile = newFile.slice(0, start) + replacement + newFile.slice(end);
    showDiff(before, newFile, replacement, start, end);
  }
  return newFile;
};
