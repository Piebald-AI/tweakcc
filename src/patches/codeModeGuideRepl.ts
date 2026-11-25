// Please see the note about writing patches in ./index
//
// Code Mode Guide Agent Patch - give the built-in claude-code-guide agent the REPL tool
//
// A subagent runs in Code Mode only when its tools resolve to the REPL tool:
// an agent with no tool list (general-purpose, Explore) gets it, and an agent
// with a fixed list gets it only when the list names it. The built-in
// claude-code-guide agent has a fixed list without it:
//
// CC 2.1.332 (chunk-bqhgd24a.js):
//   whenToUse:`...claude-code-guide agent that you can continue via ${kn}.`,
//   get tools(){return UA()&&gc()?[ke,Oe,jn,yc]:[io,Sr,Oe,jn,yc]},
//   source:"built-in",...
//
// (Bash, Read, WebFetch, WebSearch, or Glob, Grep, Read, WebFetch, WebSearch.)
// So in a Code Mode session it makes one tool call per search and per page,
// and every page it reads enters its context whole (#111386).
//
// This patch adds "REPL" to both lists, as a custom agent with
// `tools: Read, Grep, Glob, REPL` would. In Code Mode its tools then resolve
// to REPL (and Poll), and its scripts can call exactly the tools listed. In a
// session without the REPL tool the name resolves to nothing, and the agent
// keeps the tools it has today.

import { showDiff } from './index';

export const writeCodeModeGuideRepl = (oldFile: string): string | null => {
  const pattern =
    /(claude-code-guide agent that you can continue via [^`]*`,get tools\(\)\{return )([^{}]+)(\},source:"built-in")/g;
  const matches = [...oldFile.matchAll(pattern)];
  if (matches.length !== 1) {
    console.error(
      `patch: codeModeGuideRepl: expected one claude-code-guide tool list, found ${matches.length}`
    );
    return null;
  }

  const [whole, head, tools, tail] = matches[0];
  const replacement = `${head}[...(${tools}),"REPL"]${tail}`;
  const start = matches[0].index!;
  const end = start + whole.length;
  const newFile = oldFile.slice(0, start) + replacement + oldFile.slice(end);

  showDiff(oldFile, newFile, replacement, start, end);

  return newFile;
};
