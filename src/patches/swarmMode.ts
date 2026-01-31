// Please see the note about writing patches in ./index
//
// Swarm Mode Patch - Force-enable native multi-agent features in Claude Code 2.1.16+
//
// Native multi-agent features (swarms, TeammateTool, delegate mode, teammate coordination)
// are gated by the `tengu_brass_pebble` statsig flag checked via a gate function.
//
// This module patches the gate function to bypass the statsig check and force-enable all features.
//
// CC 2.1.23:
// ```diff
//  function b8() {
// +  return true;
//    if (J2(process.env.CLAUDE_CODE_AGENT_SWARMS)) return !1;
//    if (!G4("tengu_brass_pebble", !1)) return !1;
//    if (j91()) return !0;
//    if (ak()) return !0;
//    let A = Uq();
//    if (A === "max" || A === "team") return $5()?.hasExtraUsageEnabled === !0;
//    if (A === null) return !0;
//    return !1;
//  }
// ```

import { showDiff } from './index';

/**
 * Patch the CLI to enable swarm mode by inserting `return true;` at the
 * start of the gate function, bypassing all checks.
 */
export const writeSwarmMode = (oldFile: string): string | null => {
  // Match: function XX(){if(Yz(process.env.CLAUDE_CODE_AGENT_SWARMS))...
  // Capture group 1 is the 'i' in 'if' - we insert before it
  const pattern =
    /function [$\w]+\(\)\{if\([$\w]+\(process.env.CLAUDE_CODE_AGENT_SWARMS\)\)/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: swarmMode: failed to find swarm gate function pattern'
    );
    return null;
  }

  // Insert after the {, at the very beginning of the function body.
  const insertIndex = match.index + match[0].indexOf('{') + 1;
  const insertion = 'return true;';

  const newFile =
    oldFile.slice(0, insertIndex) + insertion + oldFile.slice(insertIndex);

  showDiff(
    oldFile,
    newFile,
    insertion,
    insertIndex,
    insertIndex // It's an insertion, not a replacement
  );

  return newFile;
};
