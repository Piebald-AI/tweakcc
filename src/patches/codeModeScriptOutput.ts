// Please see the note about writing patches in ./index
//
// Code Mode Script Output Patch - show a REPL script's output in the transcript
//
// In Code Mode the REPL tool is a transparent wrapper: the terminal draws no
// result row for it. In the Ctrl+O transcript, ScriptSourceRow draws the
// `Code(...)` row, and expanding it (ctrl+e, click or `[`) shows the script
// source and nothing else. The return value and the log lines, which are what
// the model reads, appear nowhere (anthropics/claude-code#111539).
//
// CC 2.1.332 (chunk-x3dt93az.js, ScriptSourceRow):
//   function Mo(s){let t=k(65),{tool:r,toolUseId:_,input:b,toolLabel:z,output:d,...}=s,...
//   let[Z,m]=jD(uo),...                                   // m: row expanded
//   ...w=U(po.replace(O,`\n`).replace(Q,`$&\n`)).trimEnd();...
//   let a;if(t[53]!==H||t[54]!==m||t[55]!==w)
//     a=m&&e(Qn,{children:e(YT,{code:w,filePath:"script.js",width:H-J,lineNumbers:!1})}),...;
//   else a=t[56];
//
// `output` is the REPL tool's result data (stdout, stderr, result, ...). This
// patch adds its log, stderr and result below the source when the row is
// expanded, each passed through the row's own display sanitizer. Display only:
// the tool_result sent to the model is built elsewhere and does not change.
// An async receipt (`asyncDispatched`) carries no output; for it the row shows
// the output codeModeAsyncScriptOutput recorded when the script settled, if
// any.

import { showDiff } from './index';

/** Settled async REPL outputs by REPL tool use id, for display only. */
export const SETTLED_OUTPUTS = 'globalThis.__tweakccSettledReplOutputs';

const ANCHOR =
  /([$\w]+)=([$\w]+)&&([$\w]+)\(([$\w]+),\{children:\3\([$\w]+,\{code:([$\w]+),filePath:"script\.js",[^}]*\}\)\}\),[^;]*;else \1=[$\w]+\[\d+\];/g;

export const writeCodeModeScriptOutput = (oldFile: string): string | null => {
  const anchors = [...oldFile.matchAll(ANCHOR)];
  if (anchors.length !== 1) {
    console.error(
      `patch: codeModeScriptOutput: expected one script source block, found ${anchors.length}`
    );
    return null;
  }
  const anchor = anchors[0];
  const [whole, block, expanded, jsx, gutter, code] = anchor;
  const end = anchor.index! + whole.length;

  // The rest of the names come from the same function, before the anchor.
  const fnStart = oldFile.lastIndexOf('function ', anchor.index!);
  const body = oldFile.slice(fnStart, anchor.index!);
  const toolUseId = body.match(/,toolUseId:([$\w]+),input:/)?.[1];
  const output = body.match(/,output:([$\w]+),shouldAnimate:/)?.[1];
  const box = body.match(/\(([$\w]+),\{flexShrink:0,children:/)?.[1];
  const text = body.match(/\(([$\w]+),\{dimColor:!0,children:\[/)?.[1];
  const sanitize = body.match(
    new RegExp(
      `[;,]${code.replace(/\$/g, '\\$')}=([$\\w]+)\\([$\\w]+\\.replace\\(`
    )
  )?.[1];
  if (!toolUseId || !output || !box || !text || !sanitize) {
    console.error(
      'patch: codeModeScriptOutput: could not find the props, Box, Text or sanitizer'
    );
    return null;
  }

  const insertion =
    `let $tccOut=${output}?.asyncDispatched===!0?${SETTLED_OUTPUTS}?.get(${toolUseId}):${output};` +
    `if(${expanded}&&$tccOut){` +
    `let $tccParts=[["log",$tccOut.stdout],["stderr",$tccOut.stderr],["result",$tccOut.result]]` +
    `.filter(([,$tccV])=>$tccV!==void 0&&$tccV!=="");` +
    `if($tccParts.length>0)${block}=${jsx}(${box},{flexDirection:"column",children:[${block},` +
    `${jsx}(${gutter},{children:${jsx}(${box},{flexDirection:"column",children:$tccParts.map(([$tccK,$tccV])=>` +
    `${jsx}(${text},{children:[${jsx}(${text},{dimColor:!0,children:$tccK+": "}),` +
    `${sanitize}(typeof $tccV==="string"?$tccV:JSON.stringify($tccV,null,2))]},$tccK))})},"tcc-output")]})}`;

  const newFile = oldFile.slice(0, end) + insertion + oldFile.slice(end);
  showDiff(oldFile, newFile, insertion, end, end);
  return newFile;
};
