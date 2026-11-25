// Please see the note about writing patches in ./index
//
// Read Result Content Patch - show what Read returned in verbose and transcript views
//
// Every other tool's result can be opened in the terminal (Bash output, Grep
// matches, Write and Edit diffs), but a Read row only ever says how many lines
// it read, even in the Ctrl+O transcript or with verbose on. The same row is
// drawn for the Read calls a Code Mode script makes, so what a script read is
// not visible either (anthropics/claude-code#111539).
//
// CC 2.1.332 (chunk-wdr92kma.js, the Read tool's renderToolResultMessage):
//   function F(t){switch(t.type){case"image":...
//   case"text":{let r=Pyo(t.file);return o(Dt,{tone:"plain",oneRow:!0,
//     children:["Read ",e(n,{bold:!0,children:r})," ",r===1?"line":"lines"]})}}}
//
// The function is called with (output, progressMessages, {verbose,
// isTranscriptMode, ...}) like every renderToolResultMessage; it ignores the
// options. This patch reads them and, when either is set, adds the file text
// under the summary line, the way Bash output is shown in full there. Control
// characters are shown as visible symbols so file bytes cannot drive the
// terminal. Display only: the tool_result sent to the model does not change.
// A Read result stored in a session file has its content dropped
// (stripForStorage), so after a resume only the summary line is left.

import { showDiff } from './index';

const TEXT_CASE =
  /case"text":\{let ([$\w]+)=([$\w]+)\(([$\w]+)\.file\);return ([$\w]+)\(([$\w]+),\{tone:"plain",oneRow:!0,children:\["Read ",([$\w]+)\(([$\w]+),\{bold:!0,children:\1\}\)," ",\1===1\?"line":"lines"\]\}\)\}/g;

const shownContent = (output: string) =>
  `${output}.file.content.replace(/\\r\\n?/g,"\\n").replace(/\\n$/,"")` +
  String.raw`.replace(/[\x00-\x08\x0b-\x1f\x7f]/g,$tccC=>String.fromCharCode($tccC==="\x7f"?9249:9216+$tccC.charCodeAt(0)))`;

export const writeReadResultContent = (oldFile: string): string | null => {
  const cases = [...oldFile.matchAll(TEXT_CASE)];
  if (cases.length !== 1) {
    console.error(
      `patch: readResultContent: expected one Read text result, found ${cases.length}`
    );
    return null;
  }
  const textCase = cases[0];
  const [, count, lineCount, output, jsx, row, jsx2, text] = textCase;

  const fnStart = oldFile.lastIndexOf('function ', textCase.index!);
  const header = oldFile
    .slice(fnStart)
    .match(/^function [$\w]+\(([$\w]+)\)\{switch\(\1\.type\)\{/);
  if (!header || header[1] !== output) {
    console.error(
      'patch: readResultContent: the Read text result is not in the expected function'
    );
    return null;
  }
  const headerEnd = fnStart + header[0].length;
  const newHeader = header[0].replace(
    `(${output})`,
    `(${output},$tccProgress,$tccOptions)`
  );

  const newCase =
    `case"text":{let ${count}=${lineCount}(${output}.file),` +
    `$tccShown=($tccOptions.verbose||$tccOptions.isTranscriptMode)&&typeof ${output}.file.content==="string"?${shownContent(output)}:"";` +
    `return ${jsx}(${row},{tone:"plain",oneRow:!$tccShown,children:["Read ",${jsx2}(${text},{bold:!0,children:${count}})," ",${count}===1?"line":"lines",$tccShown&&"\\n"+$tccShown]})}`;

  const caseStart = textCase.index!;
  const caseEnd = caseStart + textCase[0].length;
  const newFile =
    oldFile.slice(0, fnStart) +
    newHeader +
    oldFile.slice(headerEnd, caseStart) +
    newCase +
    oldFile.slice(caseEnd);

  showDiff(oldFile, newFile, newCase, caseStart, caseEnd);
  return newFile;
};
