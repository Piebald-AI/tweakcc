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
 * Old CC: !someVar(process.env.MCP_CONNECTION_NONBLOCKING) decides whether to
 * block on MCP connections; replacing it with "false" forces non-blocking.
 *
 * CC 2.1.295 (chunk with the headless MCP connect orchestrator):
 *   g=a.MCP_CONNECTION_NONBLOCKING!==!1;ERo(g);
 * `a` is the parsed env (MCP_CONNECTION_NONBLOCKING is a triBool), so
 * non-blocking is already the default and only an explicit
 * MCP_CONNECTION_NONBLOCKING=0/false opts back into blocking. Replacing the
 * check with "!0" makes non-blocking unconditional, like the old patch.
 */
const getNonBlockingCheckLocation = (
  oldFile: string
): { location: LocationResult; newValue: string } | null => {
  const match =
    oldFile.match(/![$\w]+\(process\.env\.MCP_CONNECTION_NONBLOCKING\)/) ??
    oldFile.match(/[$\w]+\.MCP_CONNECTION_NONBLOCKING!==!1/);
  if (!match || match.index === undefined) {
    return null;
  }

  return {
    location: {
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    },
    newValue: match[0].startsWith('!') ? 'false' : '!0',
  };
};

/**
 * Find the MCP batch size default value location.
 *
 * Old CC: parseInt(process.env.MCP_SERVER_CONNECTION_BATCH_SIZE||"",10)||3
 * CC ≥2.1.140: parseInt(process.env.MCP_SERVER_CONNECTION_BATCH_SIZE||"",10);return H>0?H:3
 * CC 2.1.295: return a.MCP_SERVER_CONNECTION_BATCH_SIZE??3
 */
const getBatchSizeLocation = (oldFile: string): LocationResult | null => {
  const pattern =
    /MCP_SERVER_CONNECTION_BATCH_SIZE(?:\|\|"",10\)(?:\|\||;return [$\w]+>0\?[$\w]+:)|\?\?)(\d+)/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    return null;
  }

  const startIndex = match.index + match[0].length - match[1].length;
  return {
    startIndex,
    endIndex: startIndex + match[1].length,
  };
};

/**
 * Apply non-blocking MCP startup by forcing the non-blocking check on.
 */
export const writeMcpNonBlocking = (oldFile: string): string | null => {
  const found = getNonBlockingCheckLocation(oldFile);
  if (!found) {
    return null;
  }

  const { location, newValue } = found;
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
