/**
 * Content I/O Utilities
 *
 * Read and write Claude Code's JavaScript content.
 * Handles both npm (cli.js) and native binary installations.
 */

import * as fs from 'node:fs/promises';

import {
  extractClaudeJsFromNativeInstallation,
  repackNativeInstallation,
} from '../nativeInstallationLoader';
import { replaceFileBreakingHardLinks } from '../utils';
import { Installation } from './types';

// ============================================================================
// Public API
// ============================================================================

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
    const buffer = await extractClaudeJsFromNativeInstallation(
      installation.path
    );
    if (!buffer) {
      throw new Error(
        `Failed to extract JavaScript from native installation: ${installation.path}`
      );
    }
    return buffer.toString('utf8');
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
    const modifiedBuffer = Buffer.from(content, 'utf8');
    await repackNativeInstallation(
      installation.path,
      modifiedBuffer,
      installation.path
    );
  } else {
    await replaceFileBreakingHardLinks(installation.path, content, 'patch');
  }
}
