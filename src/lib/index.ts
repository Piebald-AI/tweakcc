/**
 * tweakcc Library
 *
 * Claude Code patching utilities - the building blocks that tweakcc uses,
 * exposed for others to build their own tools.
 *
 * @example
 * ```typescript
 * import {
 *   findAllInstallations,
 *   tryDetectInstallation,
 *   readContent,
 *   writeContent,
 *   backupFile,
 *   helpers,
 * } from 'tweakcc';
 *
 * // Find Claude Code
 * const installation = await tryDetectInstallation({ interactive: true });
 *
 * // Backup first
 * await backupFile(installation.path, './backup');
 *
 * // Read, patch, write
 * let content = await readContent(installation);
 * content = content.replace(/something/g, 'something else');
 * await writeContent(installation, content);
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  Installation,
  // Re-exported config types
  TweakccConfig,
  Settings,
} from './types';

// ============================================================================
// Installation Detection
// ============================================================================

export {
  findAllInstallations,
  tryDetectInstallation,
  showInteractiveInstallationPicker,
  type DetectInstallationOptions,
} from './detection';

// ============================================================================
// Content I/O
// ============================================================================

export { readContent, writeContent } from './content';

// ============================================================================
// Backup & Restore
// ============================================================================

export { backupFile, restoreBackup } from './backup';

// ============================================================================
// Tweakcc Config
// ============================================================================

export {
  getTweakccConfigDir,
  getTweakccConfigPath,
  getTweakccSystemPromptsDir,
  readTweakccConfig,
} from './config';

// ============================================================================
// Helpers
// ============================================================================

import {
  findChalkVar,
  getModuleLoaderFunction,
  getReactVar,
  getRequireFuncName,
  findTextComponent,
  findBoxComponent,
  clearCaches,
} from '../patches/helpers';

import { globalReplace, showDiff } from '../patches/patchDiffing';

/**
 * Helper utilities for writing patches against minified code.
 *
 * Includes functions to find minified variable names and utilities for
 * performing replacements with diff output.
 *
 * @example
 * ```typescript
 * const reactVar = helpers.getReactVar(content);
 * if (reactVar) {
 *   content = content.replace(
 *     new RegExp(`${reactVar}\\.createElement`),
 *     // ...
 *   );
 * }
 *
 * // Clear caches when processing multiple files
 * helpers.clearCaches();
 * ```
 */
export const helpers = {
  // Find minified identifiers
  findChalkVar,
  getModuleLoaderFunction,
  getReactVar,
  getRequireFuncName,
  findTextComponent,
  findBoxComponent,

  // Cache management
  clearCaches,

  // Diff utilities
  globalReplace,
  showDiff,
};
