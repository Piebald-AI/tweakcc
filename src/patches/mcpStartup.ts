// Please see the note about writing patches in ./index
//
// MCP Startup Optimization Patch
// Based on: https://cuipengfei.is-a.dev/blog/2026/01/24/claude-code-mcp-startup-optimization/
//
// This patch sets environment variables to speed up Claude Code startup when
// using multiple MCP servers:
// - MCP_CONNECTION_NONBLOCKING: Don't block startup waiting for all MCPs to connect
// - MCP_SERVER_CONNECTION_BATCH_SIZE: Connect more servers in parallel (default: 3)

import { showDiff } from './index';

/**
 * Find the insertion point for early code injection.
 * Returns the index after any hashbang line, or 0 if no hashbang.
 */
const getEarlyInjectionPoint = (fileContents: string): number => {
  // Check if file starts with a hashbang (#!/...)
  if (fileContents.startsWith('#!')) {
    // Find the end of the hashbang line
    const newlineIndex = fileContents.indexOf('\n');
    if (newlineIndex !== -1) {
      return newlineIndex + 1;
    }
  }
  return 0;
};

/**
 * Build the injection code for MCP startup optimization.
 * Only sets environment variables if they're not already set by the user.
 */
const buildInjectionCode = (
  nonBlocking: boolean,
  batchSize: number | null
): string => {
  const parts: string[] = [];

  if (nonBlocking) {
    // Only set if not already defined by user
    parts.push(
      `if(!process.env.MCP_CONNECTION_NONBLOCKING)process.env.MCP_CONNECTION_NONBLOCKING="1";`
    );
  }

  if (batchSize !== null && batchSize > 0) {
    // Only set if not already defined by user
    parts.push(
      `if(!process.env.MCP_SERVER_CONNECTION_BATCH_SIZE)process.env.MCP_SERVER_CONNECTION_BATCH_SIZE="${batchSize}";`
    );
  }

  if (parts.length === 0) {
    return '';
  }

  // Wrap in an IIFE to avoid polluting global scope (though these are just env var assignments)
  // Actually, env var assignments are fine at top level, keep it simple
  return parts.join('');
};

/**
 * Apply MCP startup optimization by injecting environment variable setup
 * at the very start of cli.js.
 *
 * @param oldFile - The original file contents
 * @param nonBlocking - Whether to enable non-blocking MCP connections
 * @param batchSize - Number of MCP servers to connect in parallel (null = use default)
 * @returns Modified file contents, or null if nothing to inject
 */
export const writeMcpStartupOptimization = (
  oldFile: string,
  nonBlocking: boolean,
  batchSize: number | null
): string | null => {
  const injectionCode = buildInjectionCode(nonBlocking, batchSize);

  if (!injectionCode) {
    // Nothing to inject
    return null;
  }

  const insertionPoint = getEarlyInjectionPoint(oldFile);

  const newFile =
    oldFile.slice(0, insertionPoint) +
    injectionCode +
    oldFile.slice(insertionPoint);

  showDiff(oldFile, newFile, injectionCode, insertionPoint, insertionPoint);

  return newFile;
};
