/**
 * Helper module for dynamically loading nativeInstallation.ts.
 *
 * nativeInstallation.ts depends on node-lief, which may not be available on all systems
 * (e.g., NixOS or systems without proper C++ libraries). This module provides a safe way
 * to dynamically import nativeInstallation.ts only when node-lief is available.
 */

import type {
  extractClaudeJsFromNativeInstallation as ExtractFn,
  repackNativeInstallation as RepackFn,
} from './nativeInstallation.js';

import { debug } from './utils.js';

interface NativeInstallationModule {
  extractClaudeJsFromNativeInstallation: typeof ExtractFn;
  repackNativeInstallation: typeof RepackFn;
}

let cachedModule: NativeInstallationModule | null = null;

/**
 * Attempts to load the nativeInstallation module.
 * Returns null if node-lief is not available.
 */
async function tryLoadNativeInstallationModule(): Promise<NativeInstallationModule | null> {
  if (cachedModule !== null) {
    return cachedModule;
  }

  try {
    // First check if node-lief is available
    await import('node-lief');
    // If it is, dynamically import the module that uses it
    cachedModule = await import('./nativeInstallation.js');
    return cachedModule;
  } catch (err) {
    debug(
      `Error loading native installation module: ${err instanceof Error ? err.message : String(err)}`
    );
    if (err instanceof Error) {
      debug(err);
    }
    // node-lief not available
    return null;
  }
}

/**
 * Extracts claude.js from a native installation binary.
 * Returns null if node-lief is not available or extraction fails.
 */
export async function extractClaudeJsFromNativeInstallation(
  nativeInstallationPath: string
): Promise<Buffer | null> {
  const mod = await tryLoadNativeInstallationModule();
  if (!mod) {
    return null;
  }
  return mod.extractClaudeJsFromNativeInstallation(nativeInstallationPath);
}

/**
 * Repacks a modified claude.js back into the native installation binary.
 * This should only be called after a successful extractClaudeJsFromNativeInstallation(),
 * which ensures the module is already loaded and cached.
 */
export async function repackNativeInstallation(
  binPath: string,
  modifiedClaudeJs: Buffer,
  outputPath: string
): Promise<void> {
  // The module should already be cached from a prior extractClaudeJsFromNativeInstallation() call
  const mod = await tryLoadNativeInstallationModule();
  if (!mod) {
    throw new Error(
      '`repackNativeInstallation()` called but `node-lief` is not available. ' +
        'This is unexpected - `extractClaudeJsFromNativeInstallation()` should have been called first.'
    );
  }
  mod.repackNativeInstallation(binPath, modifiedClaudeJs, outputPath);
}
