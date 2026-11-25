// Please see the note about writing patches in ./index
//
// Code Mode in the Desktop App Patch - let the Desktop app's Code tab start
// Code Mode (anthropics/claude-code#110673)
//
// The Code tab runs Claude Code headless: stream-json in and out, permission
// prompts over stdio, CLAUDE_CODE_ENTRYPOINT=claude-desktop. Claude Code
// 2.1.332 runs Code Mode headless for the Agent SDK's entrypoints only
// (chunk-4mjjf5rb.js):
//
//   var ce=new Set(["sdk-cli","sdk-ts","sdk-py"]);function I(e,n){
//     if(!se())return"runtime";...
//     let t=ge();if((t?!ce.has(cs()??""):cs()!=="cli")||...)return"entrypoint";
//
// so the Code tab is refused as "entrypoint". Nothing else in the headless
// Code Mode path depends on the entrypoint: script calls reach any
// stream-json host as tool_use blocks with `toolu_cc_` ids, their permission
// prompts go through the host's permission prompt tool, and
// outputShowsScriptCalls() is true for every stream-json launch in Code Mode.
// Claude in Chrome and computer use are turned off in Code Mode for every
// surface ("the API doesn't yet add its safety rules for them").
//
// This patch adds "claude-desktop" to that set. Pre-warmed spares
// (--await-claim) stay refused, and the opt-in still has to come from the env
// block of --settings unless the Code Mode in -p and SDK hosts patch is on.

import { showDiff } from './index';

export const writeCodeModeDesktop = (oldFile: string): string | null => {
  const pattern =
    /([$\w]+=new Set\(\["sdk-cli","sdk-ts","sdk-py")(\]\);function [$\w]+\([$\w]+,[$\w]+\)\{if\(![$\w]+\(\)\)return"runtime")/g;
  const matches = [...oldFile.matchAll(pattern)];
  if (matches.length !== 1) {
    console.error(
      `patch: codeModeDesktop: expected one set of Code Mode entrypoints, found ${matches.length}`
    );
    return null;
  }

  const [, head] = matches[0];
  const start = matches[0].index! + head.length;
  const insertion = ',"claude-desktop"';
  const newFile = oldFile.slice(0, start) + insertion + oldFile.slice(start);

  showDiff(oldFile, newFile, insertion, start, start);

  return newFile;
};
