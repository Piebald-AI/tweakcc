// Please see the note about writing patches in ./index
//
// Hooks See Whole Script Shell Output Patch - give PostToolUse hooks the output a
// Code Mode script gets from a shell call, not the 30,000-char preview
//
// A Bash or PowerShell result keeps at most BASH_MAX_OUTPUT_LENGTH characters of
// stdout (default 30,000, at most 150,000; or settings.bashOutputMaxChars) and
// saves the whole output to tool-results/. The model reads that preview, and so do
// PostToolUse hooks (tool_response). A Code Mode script instead gets the whole
// stdout: after the hooks ran, the saved file is read back. So a redaction hook
// (anthropics/claude-code#112065):
//   - that rewrites the output cuts the script's data to the 30,000 chars it was
//     given (the read-back is skipped, since the file has the text the hook did
//     not see), and
//   - never sees a secret past the preview, which then reaches the script whole.
//
// CC 2.1.332 (chunk-h3f56h75.js), a script's tool call:
//   let Ao=!1,In=ge.byHook!==void 0,{shellOutputSpilled:er,shellOutputCut:Co}=...,
//     xo=(B,de)=>{let ie={folder:TN(n.session),projectsDir:Am()};if(de===void 0)return Or(B,ie);...},
//     ...,Io=ge.data,tr,nr=Promise.withResolvers();using Vc=...;
//   try{for(let B of ...)for await(let de of mdt(Je,e,L,o.message.id,Et,ge.data,...)){
//     ...if("updatedToolOutput"in de&&...){...ge.data=ie,In=!0...}}}...
//   let hn=ge.data;if(e.name===ke||e.name===kt){
//     if(hn=In?Cr(hn,er,Co):er&&Ece().includes(e)?await gd(hn):hn,...)...}
// `Cr` marks a rewritten result as cut; `gd` reads the saved output back.
//
// Raising the limit would grow every result the model reads, and leaving script
// calls out of the hooks would let a script read what the hook exists to hide.
// This patch reads the saved output back before the hooks run, when the script
// call's output was saved and could be read whole (at most 1 MiB), and hands the
// hooks that stdout; a result the hooks rewrote from it is then not marked as cut.
// Otherwise the hooks get the preview, as unpatched.

import { showDiff } from './index';

export const writeHooksSeeWholeScriptShellOutput = (
  oldFile: string
): string | null => {
  const pattern =
    /(?<head>(?<rewritten>[$\w]+)=(?<call>[$\w]+)\.byHook!==void 0,\{shellOutputSpilled:(?<spilled>[$\w]+),shellOutputCut:(?<cut>[$\w]+)\}=\k<call>\.byHook\?.{0,600}?,(?<readBack>[$\w]+)=\([$\w]+,(?<facts>[$\w]+)\)=>\{let [$\w]+=\{folder:[$\w]+\([$\w]+\.session\),projectsDir:[$\w]+\(\)\};if\(\k<facts>===void 0\)return .{0,400}?=Promise\.withResolvers\(\))(?<toHookInput>;using .{0,300}?for await\(let [$\w]+ of [$\w]+\((?:[$\w.]+,){5})\k<call>\.data,(?<toMarkCut>.{0,2500}?=\k<rewritten>\?)(?<markCut>[$\w]+)\((?<result>[$\w]+),\k<spilled>,\k<cut>\)(?=:\k<spilled>&&(?<scriptTools>[$\w]+)\(\)\.includes\((?<tool>[$\w]+)\)\?await )/g;
  const matches = [...oldFile.matchAll(pattern)];
  if (matches.length !== 1) {
    console.error(
      `patch: hooksSeeWholeScriptShellOutput: expected one script shell call, found ${matches.length}`
    );
    return null;
  }

  const g = matches[0].groups!;
  const whole = '$tccWholeOutput';
  const replacement =
    g.head +
    `,${whole}=${g.spilled}&&!${g.rewritten}&&${g.scriptTools}().includes(${g.tool})` +
    `?await ${g.readBack}(${g.call}.data,void 0).then(($tccRead)=>$tccRead.stdoutTruncated===!0?void 0:{...${g.call}.data,stdout:$tccRead.stdout}):void 0` +
    g.toHookInput +
    `${g.rewritten}||${whole}===void 0?${g.call}.data:${whole},` +
    g.toMarkCut +
    `${g.markCut}(${g.result},${g.spilled}&&${whole}===void 0,${g.cut})`;
  const start = matches[0].index!;
  const end = start + matches[0][0].length;
  const newFile = oldFile.slice(0, start) + replacement + oldFile.slice(end);

  showDiff(oldFile, newFile, replacement, start, end);

  return newFile;
};
