// Please see the note about writing patches in ./index
//
// Code Mode with Remote Control Patch - keep Remote Control in Code Mode
// sessions (anthropics/claude-code#109847)
//
// Claude Code 2.1.332 keeps the two apart from both sides. A launch with
// --remote-control does not start Code Mode (chunk-4mjjf5rb.js):
//
//   if(Yt()||e.teammate||e.remoteControl||s.CLAUDE_BRIDGE_REATTACH_SESSION!==void 0)return"unattended";
//
// and in a Code Mode session (`hi()`) the bridge stays off (chunk-z9wdpp31.js):
//
//   function a$(){if(_Ve())return!1;if(g())return!0;if(hi())return!1;return P()}  // isBridgeEnabled
//   function $xr(){return hi()&&!_Ve()&&!g()&&P()&&lft()==="allowed"}              // isBridgeOffByAnOptInAlone
//   async function Gxs(e){...if(g())return null;if(hi())return"repl_mode";...}      // getBridgeBlockedCode
//   async function qKn(){...if(g())return null;if(hi())return l("repl_mode",`Remote Control isn't available in ${GS} yet. ...`);...}
//
// The rest of Code Mode already serves Remote Control clients:
// clientsDrawScriptCalls() is `isRemoteControlOn() || outputShowsScriptCalls()`,
// so with Remote Control on each script call is written to the transcript
// as its own tool_use/tool_result rows (`visibleToRemoteClients`), and
// remoteClientUserFrames()/headlessScriptCallFrame() build the frames "the
// Remote Control apps" read, with the call's result text.
//
// This patch removes the --remote-control refusal and the four Code Mode
// checks above, so Remote Control can be turned on in a Code Mode session.
// It edits two modules and checks for all of its sites before it edits any.

import { graphMemo, graphSources, isGraphContextActive } from './graphContext';
import { showDiff } from './index';

const START_GATE =
  /(\|\|[$\w]+\.teammate)\|\|[$\w]+\.remoteControl(?=\|\|[^;]*\)return"unattended")/g;
const BLOCKED_CODE = /if\(([$\w]+)\(\)\)return"repl_mode";/g;

const escape = (name: string) => name.replace(/\$/g, '\\$');

/** The four bridge checks, given the name Code Mode is read with. */
const bridgeChecks = (codeMode: string) => {
  const on = `${escape(codeMode)}\\(\\)`;
  return [
    // isBridgeEnabled
    new RegExp(
      `(?<=if\\([$\\w]+\\(\\)\\)return!0;)if\\(${on}\\)return!1;`,
      'g'
    ),
    // isBridgeOffByAnOptInAlone
    new RegExp(
      `(?<=return )${on}(?=&&![$\\w]+\\(\\)&&![$\\w]+\\(\\)&&[$\\w]+\\(\\)&&[$\\w]+\\(\\)==="allowed")`,
      'g'
    ),
    // getBridgeBlockedCode
    new RegExp(`if\\(${on}\\)return"repl_mode";`, 'g'),
    // getBridgeDisabledDiagnosis
    new RegExp(`if\\(${on}\\)return [$\\w]+\\("repl_mode",\`[^\`]*\`\\);`, 'g'),
  ];
};
const BRIDGE_REPLACEMENTS = ['', '!1', '', ''];

/** Whether `sources` hold every site exactly once. */
const allSitesPresent = (sources: Iterable<string>): boolean => {
  let gates = 0;
  let bridges = 0;
  for (const source of sources) {
    gates += [...source.matchAll(START_GATE)].length;
    const codeMode = [...source.matchAll(BLOCKED_CODE)];
    if (codeMode.length === 0) continue;
    if (
      codeMode.length === 1 &&
      bridgeChecks(codeMode[0][1]).every(
        check => [...source.matchAll(check)].length === 1
      )
    )
      bridges++;
    else return false;
  }
  return gates === 1 && bridges === 1;
};

export const writeCodeModeRemoteControl = (oldFile: string): string | null => {
  const ready = isGraphContextActive()
    ? graphMemo('code-mode-remote-control', () =>
        allSitesPresent(graphSources()!.values())
      )
    : allSitesPresent([oldFile]);
  if (!ready) {
    console.error(
      'patch: codeModeRemoteControl: expected the --remote-control refusal and the four Code Mode checks of the bridge once each'
    );
    return null;
  }

  const edits: { start: number; end: number; replacement: string }[] = [];
  for (const match of oldFile.matchAll(START_GATE))
    edits.push({
      start: match.index!,
      end: match.index! + match[0].length,
      replacement: match[1],
    });
  const codeMode = oldFile.match(BLOCKED_CODE)?.[0].match(/^if\(([$\w]+)/)?.[1];
  if (codeMode)
    bridgeChecks(codeMode).forEach((check, i) => {
      const match = [...oldFile.matchAll(check)][0];
      edits.push({
        start: match.index!,
        end: match.index! + match[0].length,
        replacement: BRIDGE_REPLACEMENTS[i],
      });
    });
  if (edits.length === 0) return null;

  let newFile = oldFile;
  for (const { start, end, replacement } of edits.sort(
    (a, b) => b.start - a.start
  )) {
    const before = newFile;
    newFile = newFile.slice(0, start) + replacement + newFile.slice(end);
    showDiff(before, newFile, replacement, start, end);
  }
  return newFile;
};
