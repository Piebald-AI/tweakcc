// Please see the note about writing patches in ./index
//
// Worktree Mode Patch - Force-enable the EnterWorktree tool in Claude Code
//
// The EnterWorktree tool creates a new git worktree and switches the session
// into it for isolated work. It's gated by the `tengu_worktree_mode` GrowthBook
// feature flag (default false) checked via `isWorktreeModeEnabled()`.
//
// This module patches the gate function to bypass the flag and force-enable the tool.
//
// CC 2.1.42:
// ```diff
//  function ef6() {
// +  return true;
//    return r8("tengu_worktree_mode", !1);
//  }
// ```

import { showDiff } from './index';

export const writeWorktreeMode = (oldFile: string): string | null => {
  const pattern = /function [$\w]+\(\)\{return [$\w]+\("tengu_worktree_mode"/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: worktreeMode: failed to find worktree gate function pattern'
    );
    return null;
  }

  const insertIndex = match.index + match[0].indexOf('{') + 1;
  const insertion = 'return !0;';

  const newFile =
    oldFile.slice(0, insertIndex) + insertion + oldFile.slice(insertIndex);

  showDiff(oldFile, newFile, insertion, insertIndex, insertIndex);

  return newFile;
};
