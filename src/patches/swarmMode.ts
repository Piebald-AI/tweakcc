// Please see the note about writing patches in ./index
//
// Swarm Mode Patch - Force-enable native multi-agent features in Claude Code 2.1.16+
//
// Native multi-agent features (swarms, TeammateTool, delegate mode, teammate coordination)
// are gated by the `tengu_brass_pebble` statsig flag checked via a gate function.
//
// This module patches the gate function to bypass the statsig check and force-enable all features.
//
// Features enabled by this patch:
// - TeammateTool for team coordination
// - Delegate mode for Task tool
// - Swarm spawning via ExitPlanMode
// - Teammate mailbox/messaging
// - Task ownership and claiming
//
// Gate function pattern (minified):
//   function XX(){if(Yz(process.env.CLAUDE_CODE_AGENT_SWARMS))return!1;return xK("tengu_brass_pebble",!1)}
//
// After patching:
//   function XX(){return!0}

import { LocationResult, showDiff } from './index';

export type SwarmModeState = 'enabled' | 'disabled' | 'unknown';

// The gate function checks CLAUDE_CODE_AGENT_SWARMS env var, then statsig flag
// Pattern: function XX(){if(Yz(process.env.CLAUDE_CODE_AGENT_SWARMS))return!1;return xK("tengu_brass_pebble",!1)}
const SWARM_GATE_MARKER = /tengu_brass_pebble/;

// Match the gate function definition - captures the function name
// The function has a specific pattern: checks env var, then calls xK() for statsig
// Using [$\w]+ instead of \w+ to match identifiers with $ (common in minified code)
const SWARM_GATE_FN_RE =
  /function\s+([$\w]+)\(\)\{if\(([$\w]+)\(process\.env\.CLAUDE_CODE_AGENT_SWARMS\)\)return!1;return\s*([$\w]+)\("tengu_brass_pebble",!1\)\}/;

/**
 * Get location information for the swarm gate function
 */
const getSwarmGateLocation = (oldFile: string): LocationResult | null => {
  // First verify the marker exists
  if (!SWARM_GATE_MARKER.test(oldFile)) {
    return null;
  }

  const match = oldFile.match(SWARM_GATE_FN_RE);
  if (!match || match.index === undefined) {
    console.error(
      'patch: swarmMode: found tengu_brass_pebble marker but failed to match gate function pattern'
    );
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    identifiers: [match[1]], // function name
  };
};

/**
 * Check if swarm mode is already patched (gate returns true unconditionally)
 */
const isAlreadyPatched = (content: string, fnName: string): boolean => {
  // Escape $ in function name for regex
  const escapedFnName = fnName.replace(/\$/g, '\\$');
  const patchedRe = new RegExp(
    `function\\s+${escapedFnName}\\(\\)\\{return!0\\}`
  );
  return patchedRe.test(content);
};

/**
 * Detect the current swarm mode state in CLI content
 */
export const detectSwarmModeState = (content: string): SwarmModeState => {
  const location = getSwarmGateLocation(content);

  if (location && location.identifiers) {
    // Found the original gate function - not patched
    return 'disabled';
  }

  // If the marker is gone, the gate was likely patched
  // Check for signs that swarm code exists but gate is patched
  if (!SWARM_GATE_MARKER.test(content)) {
    // Look for swarm-related code that would indicate the feature exists
    const hasSwarmCode = /TeammateTool|teammate_mailbox|launchSwarm/.test(
      content
    );
    if (hasSwarmCode) {
      // Swarm code exists but marker is gone - likely patched to enabled
      return 'enabled';
    }
    // No swarm code at all - unknown/unsupported version
    return 'unknown';
  }

  // The marker exists but the full gate function doesn't - ambiguous state
  return 'unknown';
};

/**
 * Get information about the swarm gate for diagnostics
 */
export const getSwarmGateInfo = (
  content: string
): {
  found: boolean;
  fnName?: string;
  state: SwarmModeState;
} => {
  const location = getSwarmGateLocation(content);
  const state = detectSwarmModeState(content);

  if (location && location.identifiers) {
    return { found: true, fnName: location.identifiers[0], state };
  }

  return { found: false, state };
};

/**
 * Patch the CLI to enable swarm mode by replacing the gate function
 * with one that always returns true.
 *
 * @param oldFile - The CLI content to patch
 * @returns The patched content, or null if the patch could not be applied
 */
export const writeSwarmMode = (oldFile: string): string | null => {
  const location = getSwarmGateLocation(oldFile);

  if (!location || !location.identifiers) {
    // Check if already patched
    const currentState = detectSwarmModeState(oldFile);
    if (currentState === 'enabled') {
      // Already patched, nothing to do
      return null;
    }
    // Gate not found and not already patched
    console.error(
      'patch: swarmMode: swarm gate function not found in CLI content'
    );
    return null;
  }

  const fnName = location.identifiers[0];

  // Check if already patched
  if (isAlreadyPatched(oldFile, fnName)) {
    // Already patched, nothing to do
    return null;
  }

  // Create the patched function that always returns true
  const patchedFunction = `function ${fnName}(){return!0}`;

  const newFile =
    oldFile.slice(0, location.startIndex) +
    patchedFunction +
    oldFile.slice(location.endIndex);

  showDiff(
    oldFile,
    newFile,
    patchedFunction,
    location.startIndex,
    location.endIndex
  );

  return newFile;
};
