/**
 * Content I/O Utilities
 *
 * Read and write Claude Code's JavaScript content.
 * Handles both npm (cli.js) and native binary installations.
 */

import * as fs from 'node:fs/promises';

import {
  extractNativeInstallationModules,
  repackNativeInstallationModuleGraph,
} from '../nativeInstallationLoader';
import { replaceFileBreakingHardLinks } from '../utils';
import { Installation } from './types';

// ============================================================================
// Public API
// ============================================================================

async function readNativeEntryModule(path: string) {
  const graph = await extractNativeInstallationModules(path);
  const entry = graph?.modules[graph.entryPointIndex];
  if (!entry) {
    throw new Error(
      `Failed to extract JavaScript from native installation: ${path}`
    );
  }
  return entry;
}

/**
 * Read Claude Code's JavaScript content.
 *
 * - npm installs: reads cli.js directly
 * - native installs: extracts embedded JS from binary
 *
 * @param installation - The installation to read from
 * @returns The JavaScript content as a string
 */
export async function readContent(installation: Installation): Promise<string> {
  if (installation.kind === 'native') {
    const entry = await readNativeEntryModule(installation.path);
    return entry.contents.toString('utf8');
  } else {
    return fs.readFile(installation.path, { encoding: 'utf8' });
  }
}

/**
 * Write modified JavaScript content back to Claude Code.
 *
 * - npm installs: writes to cli.js (handles permissions, hard links)
 * - native installs: repacks JS into binary
 *
 * @param installation - The installation to write to
 * @param content - The modified JavaScript content
 */
export async function writeContent(
  installation: Installation,
  content: string
): Promise<void> {
  if (installation.kind === 'native') {
    const entry = await readNativeEntryModule(installation.path);
    const modifiedBuffer = Buffer.from(content, 'utf8');
    if (modifiedBuffer.equals(entry.contents)) return;
    // Replace only the entry module in place; rebuilding the whole payload
    // relocates bytecode and breaks bytecode builds (#683, #745).
    await repackNativeInstallationModuleGraph(
      installation.path,
      new Map([[entry.name, modifiedBuffer]]),
      installation.path
    );
  } else {
    await replaceFileBreakingHardLinks(installation.path, content, 'patch');
  }
}
