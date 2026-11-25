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
// (anthropics/claude-code#112152).
//
// This patch adds one paragraph after the prompt's paragraph on
// `preview(out)`: start a command that waits, let it run in the background,
// and end the turn. How to put a command in the background depends on the
// lane. The async lane refuses `run_in_background` unless the session is
// headless, and names a short timeout instead:
//
// CC 2.1.332 (chunk-h3f56h75.js, a script's tool call):
//   if(c==="async"&&!Lg()&&(e.name===ke||e.name===kt)&&j.data.run_in_background===!0)
//     return te(`${e.name}: run_in_background is not available in the async
//     REPL. Await the command instead. To keep it running ..., give it a short
//     timeout, such as 3000 ms: when the timeout passes, it moves to the
//     background.`)
//
// so the paragraph uses the prompt's own lane values: the async-lane flag
// `I=Gte()&&(!Lg()||...)` and the headless check `Lg()`. Headless sessions
// and the sync lane get `run_in_background`, as the prompt's own headless
// note ("To leave a job running, start it with `await ${v0}({command,
// run_in_background: true, timeout})`") already says. The paragraph is left
// out where background tasks are off (`${Lfe()?"is stopped after 10 minutes
// (background tasks are off ...`), and names the session's shell tool as the
// prompt does elsewhere (\`Grep\`, \`${y}\`, etc.).

import { showDiff } from './index';

const LEAD =
  "\n\nDon't wait inside a script for something outside this machine, such " +
  'as a CI run, a deploy or a review: a script that waits with sleep() or a ' +
  'polling loop holds the session until it ends. Start a command that waits ' +
  'for it and let it run in the background instead: ';
const SHORT_TIMEOUT =
  '`await $`gh pr checks 123 --watch --fail-fast`.timeout(3000)` moves it ' +
  'to the background after 3 s.';
const BACKGROUND_BEFORE_TOOL = '`await tools.';
const BACKGROUND_AFTER_TOOL =
  "({command: 'gh pr checks 123 --watch --fail-fast', run_in_background: " +
  'true})` returns at once.';
const TAIL =
  ' Then end your turn: its completion notification starts your next turn. ' +
  'Awaiting a local build or test run inside a script is fine.';

export const writeCodeModeWaitGuidance = (oldFile: string): string | null => {
  const anchor = "it starts with the output's size and the file's path.";
  const backgroundOff = oldFile.match(
    /\$\{([$\w]+)\(\)\?"is stopped after 10 minutes \(background tasks are off/
  );
  const shellTool = oldFile.match(/\\`Grep\\`, \\`\$\{([$\w]+)\}\\`, etc\./);
  const lane = oldFile.match(
    /,([$\w]+)=[$\w]+\(\)&&\(!([$\w]+)\(\)\|\|([$\w]+)\.some\(\(([$\w]+)\)=>\4\.isMcp!==!0&&[$\w]+\(\4,[$\w]+\)\)\),/
  );
  const start = oldFile.indexOf(anchor);
  if (
    !backgroundOff ||
    !shellTool ||
    !lane ||
    start === -1 ||
    oldFile.indexOf(anchor, start + 1) !== -1
  ) {
    console.error(
      'patch: codeModeWaitGuidance: failed to find the REPL prompt paragraph on preview(out)'
    );
    return null;
  }

  const [, asyncLane, headless] = lane;
  const howToBackground =
    `(${asyncLane}&&!${headless}()?${JSON.stringify(SHORT_TIMEOUT)}:` +
    `${JSON.stringify(BACKGROUND_BEFORE_TOOL)}+${shellTool[1]}+${JSON.stringify(BACKGROUND_AFTER_TOOL)})`;
  const end = start + anchor.length;
  const replacement =
    anchor +
    `\${${backgroundOff[1]}()?"":${JSON.stringify(LEAD)}+${howToBackground}+${JSON.stringify(TAIL)}}`;
  const newFile = oldFile.slice(0, start) + replacement + oldFile.slice(end);

  showDiff(oldFile, newFile, replacement, start, end);

  return newFile;
};
