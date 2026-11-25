// Please see the note about writing patches in ./index
//
// Code Mode Async Script Output Patch - keep a settled async script's output for the transcript
//
// On the async REPL lane (bypassPermissions or auto mode), a script that runs
// past the settle window returns only a receipt, `(dispatched #N)` with
// `asyncDispatched: true`. Its outcome reaches the model later as a
// `repl-eval` poll event, through a Poll call or a queued command. The
// terminal draws neither: Poll is a transparent wrapper whose row is hidden,
// and the queued command is a meta message. So the expanded `Code(...)` row
// stays empty even with codeModeScriptOutput (anthropics/claude-code#111539).
//
// CC 2.1.332 (chunk-j03wwfcm.js, the async lane's settle), after the
// PostToolUse hooks ran on the script's output:
//   let{output:Ze,rewritten:Ae,withheld:je,said:ct}=await vo({dispatchCtx:k,
//     replToolUseID:L,parentMessage:s,input:n},z.data,Date.now()-pe,"settle",N.evalId);
//   if(je)A();let st={...Ze,refusedCalls:...}
//
// `Ze` is the output the settle event is built from. This patch records it by
// the REPL tool use id, unless a hook withheld it from the model, in a
// process-wide map that codeModeScriptOutput reads for an async receipt. The
// map holds the last 100 settles and lives in memory only, so a resumed
// session shows nothing for scripts that settled before the restart. Output a
// script logs after it settled is not included. Display only: nothing sent to
// the model changes.

import { SETTLED_OUTPUTS } from './codeModeScriptOutput';
import { showDiff } from './index';

const KEPT_SETTLES = 100;

const SETTLE =
  /\{output:([$\w]+),rewritten:[$\w]+,withheld:([$\w]+),said:[$\w]+\}=await [$\w]+\(\{dispatchCtx:[$\w]+,replToolUseID:([$\w]+),parentMessage:[$\w]+,input:[$\w]+\},[$\w]+\.data,Date\.now\(\)-[$\w]+,"settle",[$\w]+\.evalId\);if\(\2\)[$\w]+\(\);/g;

export const writeCodeModeAsyncScriptOutput = (
  oldFile: string
): string | null => {
  const settles = [...oldFile.matchAll(SETTLE)];
  if (settles.length !== 1) {
    console.error(
      `patch: codeModeAsyncScriptOutput: expected one async REPL settle, found ${settles.length}`
    );
    return null;
  }
  const [whole, output, withheld, toolUseId] = settles[0];
  const end = settles[0].index! + whole.length;

  const insertion =
    `if(!${withheld}){let $tccSettled=${SETTLED_OUTPUTS}??=new Map;` +
    `$tccSettled.set(${toolUseId},${output});` +
    `if($tccSettled.size>${KEPT_SETTLES})$tccSettled.delete($tccSettled.keys().next().value)}`;

  const newFile = oldFile.slice(0, end) + insertion + oldFile.slice(end);
  showDiff(oldFile, newFile, insertion, end, end);
  return newFile;
};
