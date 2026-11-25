// Please see the note about writing patches in ./index
//
// Code Mode Scan Guidance Patch - tell Claude to scan many files with one
// command, not one Read call each
//
// In Code Mode every file() read and every Read call in a script is a call
// of the Read tool, with its own permission check and PreToolUse and
// PostToolUse hooks:
//
// CC 2.1.332 (chunk-h3f56h75.js, the host side of file()):
//   readFile: async (v1, {path: v5, ...}) => { ... v1.useTool(<Read>, {file_path: v8, ...}) ... }
//
// The REPL tool's description calls work inside a script "comparatively
// free", so for a scan over a few hundred small files Claude reads each file
// with its own call: 742 Read calls, 2.4x slower than one `python3 -c` in
// normal mode (anthropics/claude-code#111033).
//
// This patch adds two sentences after the prompt's paragraph on what a
// `REPL` call costs (both of its variants):
//
// CC 2.1.332 (chunk-j03wwfcm.js, the REPL tool prompt):
//   J=s?"What a `REPL` call costs: mostly what it returns, ...":"What a `REPL` call costs: each call is ..."
//   ...return`\n${ue}\n\nThe REPL is one persistent JavaScript context: ...\n\n${J}\n\nA script's output is ...

import { showDiff } from './index';

const SCAN =
  ' To scan many files, run one command over all of them with `$` (`rg`, ' +
  '`grep -r`, or a short `python3 -c` or `awk` program) and work on its ' +
  'output in the script, instead of reading each file with `file()` or ' +
  '`Read`: every read is a tool call with its own permission check and hooks.';

export const writeCodeModeScanGuidance = (oldFile: string): string | null => {
  const pattern =
    /\n\n\$\{([$\w]+)\}\n\nA script's output is its last expression/g;
  const matches = [...oldFile.matchAll(pattern)];
  if (matches.length !== 1) {
    console.error(
      `patch: codeModeScanGuidance: expected one REPL prompt paragraph on call cost, found ${matches.length}`
    );
    return null;
  }

  const costParagraph = `\${${matches[0][1]}}`;
  const start = matches[0].index! + 2;
  const end = start + costParagraph.length;
  const replacement = costParagraph + SCAN.replace(/[`\\]/g, '\\$&');
  const newFile = oldFile.slice(0, start) + replacement + oldFile.slice(end);

  showDiff(oldFile, newFile, replacement, start, end);

  return newFile;
};
