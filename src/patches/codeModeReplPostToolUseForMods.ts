// Please see the note about writing patches in ./index
//
// Code Mode REPL PostToolUse For Mods Patch - let a mod's catch-all
// classic.PostToolUse hook see the REPL and Poll output
//
// Under Code Mode, a mod's tool hooks see a script's inner tool calls; a
// registration that does not name REPL (or Poll) is left out for the REPL and
// Poll calls themselves, for every event in this table:
//
// CC 2.1.332 (chunk-cy4eag9j.js):
//   var Ut={"tool.call":"tool",...,"classic.PermissionDenied":"tool_name",
//     "classic.PostToolUse":"tool_name","classic.PostToolUseFailure":"tool_name"};
//   function Xbo(e,o,n){...{let f=Ut[o];if(f===void 0||!hi()||!UQ(n))return e;
//     let m=n[f],...;if(!(typeof m==="string"&&(m===bo||hs(m))&&...))return e;
//     return co(e,o,(g)=>go(g[f]).some((h)=>m===bo?h===m:hs(h)))}...}
//
// Since 2.1.328 Code Mode tells you to redact a script's output with a
// PostToolUse hook's `updatedToolOutput`, and the REPL PostToolUse pass that
// runs when a script settles (and for its late output) does run mods'
// classic.PostToolUse hooks; but a catch-all registration is left out there by
// the table above, so a redaction mod never sees the output and cannot scrub a
// value the script built itself without calling a tool
// (anthropics/claude-code#111259). A settings command hook with matcher `*`
// sees it; a mod has no equivalent.
//
// This patch takes classic.PostToolUse out of the table, so a catch-all
// classic.PostToolUse registration sees REPL and Poll results the way a
// settings PostToolUse hook does. Its `updatedToolOutput` is still checked
// against the REPL tool's output shape. The other events (tool.call,
// PreToolUse, PermissionRequest, ...) keep seeing only the inner calls, so
// permission decisions do not change.

import { showDiff } from './index';

export const writeCodeModeReplPostToolUseForMods = (
  oldFile: string
): string | null => {
  const pattern =
    /("classic\.PermissionDenied":"tool_name",)"classic\.PostToolUse":"tool_name",("classic\.PostToolUseFailure":"tool_name"\};function [$\w]+\([$\w]+,([$\w]+),[$\w]+\)\{if\(\3==="tool\.check")/g;
  const matches = [...oldFile.matchAll(pattern)];
  if (matches.length !== 1) {
    console.error(
      `patch: codeModeReplPostToolUseForMods: expected one Code Mode tool-hook table, found ${matches.length}`
    );
    return null;
  }

  const [whole, before, after] = matches[0];
  const replacement = before + after;
  const start = matches[0].index!;
  const end = start + whole.length;
  const newFile = oldFile.slice(0, start) + replacement + oldFile.slice(end);

  showDiff(oldFile, newFile, replacement, start, end);

  return newFile;
};
