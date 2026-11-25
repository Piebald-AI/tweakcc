// Please see the note about writing patches in ./index
//
// Code Mode in Background Sessions Patch - let `claude --bg` sessions start
// Code Mode (anthropics/claude-code#111183)
//
// A background session is an interactive session that the daemon runs in a
// pseudo-terminal (CLAUDE_CODE_SESSION_KIND=bg, FORCE_COLOR=3); clients attach
// to it from the agent view. Claude Code 2.1.332 refuses Code Mode there
// (chunk-4mjjf5rb.js, `Yt` is isBgSession):
//
//   if(Yt()||e.teammate||e.remoteControl||s.CLAUDE_BRIDGE_REATTACH_SESSION!==void 0)return"unattended";
//
// Code Mode runs in such a session as in a terminal, except for one step: the
// first opt-in shows a dialog and restarts Claude Code into Code Mode, and "a
// background session cannot restart itself". Once the dialog was answered in
// a terminal (`z()`: codeModeCaveatsAcceptedV1 and
// codeModeAutoModeCaveatAcceptedV1 in ~/.claude.json), the opt-in settles at
// start-up with no dialog and no restart:
//
//   ...let k=C();if(k||!z()){if(u)return t(k?"gate":"unsaved");return $Hl()}m({state:"on",source:o.source})
//
// This patch lets a background session start Code Mode once that answer is
// saved, so `claude --bg`, `claude respawn` and sessions opened from the agent
// view get Code Mode from ~/.claude/settings.json. Moving or copying a Code
// Mode session to the background stays refused: the session the daemon starts
// gets the daemon's environment, which may not turn Code Mode on, and a Code
// Mode session can't be resumed without it.

import { showDiff } from './index';

export const writeCodeModeBackgroundSessions = (
  oldFile: string
): string | null => {
  const gate =
    /if\(([$\w]+\(\))(\|\|[$\w]+\.teammate[^;]*\)return"unattended")/g;
  const caveatsAccepted =
    /function ([$\w]+)\(\)\{let ([$\w]+)=[$\w]+\(\);return \2\.codeModeCaveatsAcceptedV1===!0&&\2\.codeModeAutoModeCaveatAcceptedV1===!0\}/g;

  const gates = [...oldFile.matchAll(gate)];
  const caveats = [...oldFile.matchAll(caveatsAccepted)];
  if (gates.length !== 1 || caveats.length !== 1) {
    console.error(
      `patch: codeModeBackgroundSessions: expected one unattended check and one caveats check, found ${gates.length}, ${caveats.length}`
    );
    return null;
  }

  const [whole, isBgSession, rest] = gates[0];
  const replacement = `if(${isBgSession}&&!${caveats[0][1]}()${rest}`;
  const start = gates[0].index!;
  const end = start + whole.length;
  const newFile = oldFile.slice(0, start) + replacement + oldFile.slice(end);

  showDiff(oldFile, newFile, replacement, start, end);

  return newFile;
};
