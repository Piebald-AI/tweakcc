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
  // Match: !VARNAME(process.env.MCP_CONNECTION_NONBLOCKING)
  // The variable name changes between npm/native builds, so we match any identifier
  const pattern = /![$\w]+\(process\.env\.MCP_CONNECTION_NONBLOCKING\)/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: mcpStartup: failed to find MCP_CONNECTION_NONBLOCKING check'
    );
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
  };
};

/**
 * Find the MCP batch size default value location.
 *
 * Pattern: parseInt(process.env.MCP_SERVER_CONNECTION_BATCH_SIZE||"",10)||3
 * We want to replace the "3" with a higher value.
 */
const getBatchSizeLocation = (oldFile: string): LocationResult | null => {
  // Match the full pattern and capture position of the default "3"
  // Pattern: MCP_SERVER_CONNECTION_BATCH_SIZE||"",10)||3
  const pattern = /MCP_SERVER_CONNECTION_BATCH_SIZE\|\|"",10\)\|\|(\d+)/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: mcpStartup: failed to find MCP_SERVER_CONNECTION_BATCH_SIZE default'
    );
    return null;
  }

  // Find the position of the default number (the captured group)
  const fullMatch = match[0];
  const defaultValue = match[1];
  const defaultValueOffset = fullMatch.lastIndexOf(defaultValue);

  const startIndex = match.index + defaultValueOffset;
  const endIndex = startIndex + defaultValue.length;

  return {
    startIndex,
    endIndex,
  };
};

/**
 * Apply non-blocking MCP startup by replacing the blocking check with "false".
 */
export const writeMcpNonBlocking = (oldFile: string): string | null => {
  const location = getNonBlockingCheckLocation(oldFile);
  if (!location) {
    return null;
  }

  // Replace the check with "false" to force non-blocking mode
  const newValue = 'false';
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
