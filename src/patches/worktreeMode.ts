// Please see the note about writing patches in ./index
//
// Worktree Mode Patch - Force-enable the EnterWorktree tool in Claude Code
//
// The EnterWorktree tool creates a new git worktree and switches the session
// into it for isolated work. It (and the --worktree/--tmux CLI flags) is gated
// by `isWorktreeModeEnabled()`, which used to read the `tengu_worktree_mode`
// GrowthBook flag (default false).
//
// This module makes the gate function return true.
//
// CC 2.1.42:
// ```diff
//  function ef6() {
// +  return true;
//    return r8("tengu_worktree_mode", !1);
//  }
// ```
//
// CC 2.1.295 splits the gate across chunks and it is already hardwired on:
//   chunk-05hepw72.js: function Vmt(){return!0}export{Vmt};
//   chunk-am4fx1hs.js: import{Vmt}from"/$bunfs/root/chunk-05hepw72.js";export{Vmt as isWorktreeModeEnabled};
//   chunk-e02cmmnv.js (tool list): ...Vmt()?[wr,Rr]:[]   (wr = EnterWorktree, no isEnabled override)
//   chunk-68qfmyns.js (CLI):       Io=Vmt()?o.worktree:void 0
// A gate whose body is already `return!0` is reported as satisfied unchanged.

import { showDiff } from './index';

// Inserts `return !0;` at the top of `function <gate>(){...}`. Returns the
// content unchanged when the body already is `return!0`, null if not found.
const forceGateOn = (content: string, gate: string): string | null => {
  const head = `function ${gate}(){`;
  const at = content.indexOf(head);
  if (at === -1) return null;

  const insertIndex = at + head.length;
  if (content.startsWith('return!0}', insertIndex)) return content;

  const insertion = 'return !0;';
  const newFile =
    content.slice(0, insertIndex) + insertion + content.slice(insertIndex);

  showDiff(content, newFile, insertion, insertIndex, insertIndex);

  return newFile;
};

// Single bundle (npm / pre-2.1.280 native).
export const writeWorktreeMode = (oldFile: string): string | null => {
  const gate =
    oldFile.match(
      /function ([$\w]+)\(\)\{return [$\w]+\("tengu_worktree_mode"/
    )?.[1] ??
    // CC 2.1.295 shape: the --worktree option is read through the gate.
    oldFile.match(/=([$\w]+)\(\)\?[$\w]+\.worktree:void 0/)?.[1];

  const newFile = gate ? forceGateOn(oldFile, gate) : null;
  if (newFile === null) {
    console.error(
      'patch: worktreeMode: failed to find worktree gate function pattern'
    );
  }
  return newFile;
};

// Split bundle (CC 2.1.280+): follow the `isWorktreeModeEnabled` re-export to
// the chunk that defines the gate.
export const writeWorktreeModeModules = (
  modules: Map<string, string>
): Map<string, string> | null => {
  for (const [name, content] of modules) {
    const local = content.match(
      /export\{([$\w]+) as isWorktreeModeEnabled\}/
    )?.[1];
    if (!local) continue;

    let defModule = name;
    let gate = local;
    for (const m of content.matchAll(/import\{([^}]*)\}from"([^"]+)"/g)) {
      for (const spec of m[1].split(',')) {
        const [imported, alias = imported] = spec.split(' as ');
        if (alias === local) {
          defModule = m[2];
          gate = imported;
        }
      }
    }
    const def = modules.get(defModule);
    const newDef = def === undefined ? null : forceGateOn(def, gate);
    if (newDef === null) break;
    return newDef === def ? new Map() : new Map([[defModule, newDef]]);
  }

  console.error(
    'patch: worktreeMode: failed to find isWorktreeModeEnabled gate'
  );
  return null;
};
