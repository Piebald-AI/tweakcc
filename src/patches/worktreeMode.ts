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
//
// Code-split builds (CC 2.1.2xx) re-export the gate from the chunk that
// defines it. In CC 2.1.295 it is hardwired on, so the patch is satisfied
// without an edit:
//   chunk-05hepw72.js: function Vmt(){return!0}export{Vmt};
//   chunk-am4fx1hs.js: import{Vmt}from"/$bunfs/root/chunk-05hepw72.js";export{Vmt as isWorktreeModeEnabled};
//   chunk-e02cmmnv.js (tools): ...Vmt()?[wr,Rr]:[]  (wr = EnterWorktree)
//   chunk-68qfmyns.js (CLI):   Io=Vmt()?o.worktree:void 0

import {
  findExportOwner,
  graphMemo,
  graphSources,
  isGraphContextActive,
} from './graphContext';
import { showDiff } from './index';

/** Module and local name of the function exported as isWorktreeModeEnabled. */
const findGraphGate = () => {
  const owner = findExportOwner('isWorktreeModeEnabled');
  const source = owner && graphSources()?.get(owner);
  const local = source?.match(
    /export\{(?:[^}]*,)?([$\w]+) as isWorktreeModeEnabled[,}]/
  )?.[1];
  if (!owner || !source || !local) return undefined;
  for (const m of source.matchAll(/import\{([^}]*)\}from"([^"]+)"/g)) {
    for (const item of m[1].split(',')) {
      const [imported, alias = imported] = item.split(' as ');
      if (alias === local) return { module: m[2], name: imported };
    }
  }
  return { module: owner, name: local };
};

export const writeWorktreeMode = (oldFile: string): string | null => {
  const pattern =
    /function [$\w]+\(\)\{(?=return [$\w]+\("tengu_worktree_mode")/;

  const match = oldFile.match(pattern);
  let insertIndex =
    match?.index === undefined ? undefined : match.index + match[0].length;

  if (insertIndex === undefined && isGraphContextActive()) {
    const gate = graphMemo('worktree-mode-gate', findGraphGate);
    const head = gate && `function ${gate.name}(){`;
    if (head && graphSources()?.get(gate.module) === oldFile) {
      const at = oldFile.indexOf(head);
      if (at !== -1) {
        insertIndex = at + head.length;
        // Already hardwired on (CC 2.1.295).
        if (oldFile.startsWith('return!0}', insertIndex)) return oldFile;
      }
    }
  }

  if (insertIndex === undefined) {
    console.error(
      'patch: worktreeMode: failed to find worktree gate function pattern'
    );
    return null;
  }

  const insertion = 'return !0;';

  const newFile =
    oldFile.slice(0, insertIndex) + insertion + oldFile.slice(insertIndex);

  showDiff(oldFile, newFile, insertion, insertIndex, insertIndex);

  return newFile;
};
