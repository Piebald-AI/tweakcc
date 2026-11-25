// Please see the note about writing patches in ./index
//
// Code Mode Wait Guidance Patch - tell Claude not to wait for outside events
// inside REPL scripts
//
// The REPL tool's description tells Claude that waiting inside a script is
// free, and to await builds and test runs there:
//
// CC 2.1.332 (chunk-j03wwfcm.js, the REPL tool prompt):
//   So waiting inside a script costs you no turns and keeps no one waiting
//   on you ... Put all the work this turn can do into one script, including
//   awaiting a build or a test run ...
//
// Nothing says what to do about a wait on something outside the machine,
// such as a 20-minute CI run. Claude writes `await sleep(420000)` or a
// sleep-and-poll loop, each script holds the session for up to 10 minutes,
// then it starts another; the session looks frozen and only Esc stops it
// (anthropics/claude-code#112152). The way out already works from a script:
// a shell tool call with `run_in_background`, whose completion notification
// starts the next turn.
//
// This patch adds one paragraph saying so, after the prompt's paragraph on
// `preview(out)`. It is left out where background tasks are off, using the
// prompt's own check, and names the session's shell tool (Bash or
// PowerShell) as the prompt does elsewhere:
//   ${Lfe()?"is stopped after 10 minutes (background tasks are off ...
//   \`Grep\`, \`${y}\`, etc.

import { showDiff } from './index';

const BEFORE_TOOL =
  "\n\nDon't wait inside a script for something outside this machine, such " +
  'as a CI run, a deploy or a review: a script that waits with sleep() or a ' +
  'polling loop holds the session until it ends. Start a command that waits ' +
  'for it in the background instead, for example `await tools.';
const AFTER_TOOL =
  "({command: 'gh pr checks 123 --watch --fail-fast', run_in_background: " +
  'true})`, and end your turn: its completion notification starts your next ' +
  'turn. Awaiting a local build or test run inside a script is fine.';

export const writeCodeModeWaitGuidance = (oldFile: string): string | null => {
  const anchor = "it starts with the output's size and the file's path.";
  const backgroundOff = oldFile.match(
    /\$\{([$\w]+)\(\)\?"is stopped after 10 minutes \(background tasks are off/
  );
  const shellTool = oldFile.match(/\\`Grep\\`, \\`\$\{([$\w]+)\}\\`, etc\./);
  const start = oldFile.indexOf(anchor);
  if (
    !backgroundOff ||
    !shellTool ||
    start === -1 ||
    oldFile.indexOf(anchor, start + 1) !== -1
  ) {
    console.error(
      'patch: codeModeWaitGuidance: failed to find the REPL prompt paragraph on preview(out)'
    );
    return null;
  }

  const end = start + anchor.length;
  const replacement =
    anchor +
    `\${${backgroundOff[1]}()?"":${JSON.stringify(BEFORE_TOOL)}+${shellTool[1]}+${JSON.stringify(AFTER_TOOL)}}`;
  const newFile = oldFile.slice(0, start) + replacement + oldFile.slice(end);

  showDiff(oldFile, newFile, replacement, start, end);

  return newFile;
};
