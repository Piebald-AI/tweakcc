// Please see the note about writing patches in ./index
//
// MCP Startup Optimization Patch
// Based on: https://cuipengfei.is-a.dev/blog/2026/01/24/claude-code-mcp-startup-optimization/
//
// This patch modifies Claude Code's MCP connection behavior:
// - MCP_CONNECTION_NONBLOCKING: Don't block startup waiting for all MCPs to connect
// - MCP_SERVER_CONNECTION_BATCH_SIZE: Connect more servers in parallel (default: 3)

import { showDiff, LocationResult } from './index';

/**
 * Find the MCP non-blocking check location.
 *
 * Pattern: !someVar(process.env.MCP_CONNECTION_NONBLOCKING)
 * This check determines whether to block on MCP connections.
 * Replacing it with "false" forces non-blocking mode.
 */
const getNonBlockingCheckLocation = (
  oldFile: string
): LocationResult | null => {
  // CC ≥2.1.97: R3=B6(process.env.MCP_CONNECTION_NONBLOCKING)
  // We replace the assignment value with !0 (true) to force non-blocking
  const newPattern =
    /([$\w]+)=[$\w]+\(process\.env\.MCP_CONNECTION_NONBLOCKING\)/;
  const newMatch = oldFile.match(newPattern);

  if (newMatch && newMatch.index !== undefined) {
    // Replace the whole assignment RHS: VAR=B6(...) → VAR=!0
    const varName = newMatch[1];
    return {
      startIndex: newMatch.index,
      endIndex: newMatch.index + newMatch[0].length,
      identifiers: [varName],
    };
  }

  // Fall back to old pattern: !VARNAME(process.env.MCP_CONNECTION_NONBLOCKING)
  const oldPattern = /![$\w]+\(process\.env\.MCP_CONNECTION_NONBLOCKING\)/;
  const oldMatch = oldFile.match(oldPattern);

  if (!oldMatch || oldMatch.index === undefined) {
    // CC ≥2.1.97: non-blocking may be hardcoded as R3=!0 (already default)
    // Check if the flag is already true — if so, no patch needed
    const hardcodedPattern = /([$\w]+)=!0,.{0,100}MCP_CONNECTION_NONBLOCKING/;
    if (oldFile.match(hardcodedPattern)) {
      return null; // Already non-blocking by default
    }

    console.error(
      'patch: mcpStartup: failed to find MCP_CONNECTION_NONBLOCKING check'
    );
    return null;
  }

  return {
    startIndex: oldMatch.index,
    endIndex: oldMatch.index + oldMatch[0].length,
  };
};

/**
 * Find the MCP batch size default value location.
 *
 * Pattern: parseInt(process.env.MCP_SERVER_CONNECTION_BATCH_SIZE||"",10)||3
 * We want to replace the "3" with a higher value.
 */
const getBatchSizeLocation = (oldFile: string): LocationResult | null => {
  // CC ≥2.1.97: return q>0?q:3  (inside a function that parses the env var)
  const newPattern =
    /MCP_SERVER_CONNECTION_BATCH_SIZE\|\|"",10\);return [$\w]+>0\?[$\w]+:(\d+)/;
  const newMatch = oldFile.match(newPattern);

  if (newMatch && newMatch.index !== undefined) {
    const fullMatch = newMatch[0];
    const defaultValue = newMatch[1];
    const defaultValueOffset = fullMatch.lastIndexOf(defaultValue);

    const startIndex = newMatch.index + defaultValueOffset;
    const endIndex = startIndex + defaultValue.length;

    return { startIndex, endIndex };
  }

  // Fall back to old pattern: MCP_SERVER_CONNECTION_BATCH_SIZE||"",10)||3
  const oldPattern = /MCP_SERVER_CONNECTION_BATCH_SIZE\|\|"",10\)\|\|(\d+)/;
  const oldMatch = oldFile.match(oldPattern);

  if (!oldMatch || oldMatch.index === undefined) {
    console.error(
      'patch: mcpStartup: failed to find MCP_SERVER_CONNECTION_BATCH_SIZE default'
    );
    return null;
  }

  const fullMatch = oldMatch[0];
  const defaultValue = oldMatch[1];
  const defaultValueOffset = fullMatch.lastIndexOf(defaultValue);

  const startIndex = oldMatch.index + defaultValueOffset;
  const endIndex = startIndex + defaultValue.length;

  return { startIndex, endIndex };
};

/**
 * Apply non-blocking MCP startup by replacing the blocking check with "false".
 */
export const writeMcpNonBlocking = (oldFile: string): string | null => {
  const location = getNonBlockingCheckLocation(oldFile);
  if (!location) {
    // CC ≥2.1.97: non-blocking is already the default (hardcoded !0)
    const hardcoded = /([$\w]+)=!0,.{0,100}MCP_CONNECTION_NONBLOCKING/;
    if (oldFile.match(hardcoded)) return oldFile;
    return null;
  }

  // New pattern (CC ≥2.1.97): replace VAR=B6(...) with VAR=!0
  // Old pattern: replace !fn(...) with false
  const newValue = location.identifiers
    ? `${location.identifiers[0]}=!0`
    : 'false';
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newValue +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newValue, location.startIndex, location.endIndex);
  return newFile;
};

/**
 * Apply MCP batch size optimization by replacing the default value.
 */
export const writeMcpBatchSize = (
  oldFile: string,
  batchSize: number
): string | null => {
  const location = getBatchSizeLocation(oldFile);
  if (!location) {
    return null;
  }

  const newValue = String(batchSize);
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newValue +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newValue, location.startIndex, location.endIndex);
  return newFile;
};
