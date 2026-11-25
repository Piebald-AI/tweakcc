// Please see the note about writing patches in ./index
//
// Code Mode Stable Note Order Patch - keep script rows from moving attachments
//
// Before each request, attachments (plugin notes from `$.session.append`,
// reminders, Code Mode's poll_events) move up the conversation until they
// meet an assistant row or a tool-result row, so they sit next to the tool
// results they follow. The script rows that Code Mode draws for a REPL
// script's inner tool calls (`isVirtual` rows) are never sent, but they still
// stop that move:
//
// CC 2.1.332 (chunk-bqhgd24a.js):
//   for(let H=e.length-1;H>=0;H--){let z=e[H],{type:Y}=z;
//     if(Y==="attachment"&&...)y.push(z);
//     else{...,_e=Y==="assistant"||...||Y==="user"&&(...[0]?.type==="tool_result"||...),
//       ie=n&&Yp(z);                 // Yp: the row is a script row
//       if(_e&&y.length>0){...h.push(Ge)...;if(!ie)h.push(z);...}  // stops here
//       else if(!ie)h.push(z);...}}
//
// The first request after a script settles is built from the query loop's
// list, which never holds the script rows (they are only yielded for the
// transcript and the UI); every later request is rebuilt from the stored
// rows, which do. When the script rows were stored after a row that does not
// stop the move (a skill body loaded by `tools.Skill`, for example) and
// before an attachment, that attachment lands before the skill body on the
// first send and after it on every later send. The message changes, earlier
// thinking is dropped (`prefix_mismatch`) and the prompt cache is written
// again from that message on (anthropics/claude-code#110999; 2.1.330 moved
// the script rows ahead of the skill body for a batch that ends on a tool
// result, but the rows still come after it when the batch ends on another
// user row).
//
// This patch skips script rows before anything else in that loop, so the
// layout is the same whether the script rows are in the list or not.

import { showDiff } from './index';

export const writeCodeModeStableNoteOrder = (
  oldFile: string
): string | null => {
  const pattern =
    /(for\(let ([$\w]+)=([$\w]+)\.length-1;\2>=0;\2--\)\{let ([$\w]+)=\3\[\2\],\{type:([$\w]+)\}=\4;)(if\(\5==="attachment"&&\4\.attachment\.type!=="message_pdf_reads"[^]{0,600}?,[$\w]+=([$\w]+)&&([$\w]+)\(\4\);if\()/g;
  const matches = [...oldFile.matchAll(pattern)];
  if (matches.length !== 1) {
    console.error(
      `patch: codeModeStableNoteOrder: expected one attachment-placement loop, found ${matches.length}`
    );
    return null;
  }

  const [whole, head, , , row, , rest, scriptRowsOn, isScriptRow] = matches[0];
  const replacement = `${head}if(${scriptRowsOn}&&${isScriptRow}(${row}))continue;${rest}`;
  const start = matches[0].index!;
  const end = start + whole.length;
  const newFile = oldFile.slice(0, start) + replacement + oldFile.slice(end);

  showDiff(oldFile, newFile, replacement, start, end);

  return newFile;
};
