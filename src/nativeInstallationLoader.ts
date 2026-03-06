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
  resolveNixBinaryWrapper as ResolveNixFn,
} from './nativeInstallation';

import {
  isELFFile,
  extractClaudeJsFromELFBinary,
  repackELFBinary,
} from './elfInstallation';
import { debug } from './utils';

interface NativeInstallationModule {
  extractClaudeJsFromNativeInstallation: typeof ExtractFn;
  repackNativeInstallation: typeof RepackFn;
  resolveNixBinaryWrapper: typeof ResolveNixFn;
}

let cachedModule: NativeInstallationModule | null = null;
let loadError: string | null = null;

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
    cachedModule = await import('./nativeInstallation');
    return cachedModule;
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    debug(`Error loading native installation module: ${loadError}`);
    if (err instanceof Error) {
      debug(err);
    }
    // node-lief not available
    return null;
  }
}

/** Returns the reason node-lief failed to load, or null if it loaded successfully. */
export function getNativeModuleLoadError(): string | null {
  return loadError;
}

/**
 * Extracts claude.js from a native installation binary.
 * For ELF files (Linux/NixOS), bypasses node-lief entirely.
 * Returns null if extraction fails or node-lief is not available for non-ELF binaries.
 */
export async function extractClaudeJsFromNativeInstallation(
  nativeInstallationPath: string
): Promise<Buffer | null> {
  if (isELFFile(nativeInstallationPath)) {
    return extractClaudeJsFromELFBinary(nativeInstallationPath);
  }
  const mod = await tryLoadNativeInstallationModule();
  if (!mod) {
    return null;
  }
  return mod.extractClaudeJsFromNativeInstallation(nativeInstallationPath);
}

/**
 * Repacks a modified claude.js back into the native installation binary.
 * For ELF files (Linux/NixOS), bypasses node-lief entirely.
 */
export async function repackNativeInstallation(
  binPath: string,
  modifiedClaudeJs: Buffer,
  outputPath: string
): Promise<void> {
  if (isELFFile(binPath)) {
    repackELFBinary(binPath, modifiedClaudeJs, outputPath);
    return;
  }
  const mod = await tryLoadNativeInstallationModule();
  if (!mod) {
    throw new Error('node-lief not available for non-ELF binary');
  }
  mod.repackNativeInstallation(binPath, modifiedClaudeJs, outputPath);
}

/**
 * Detects whether a binary is a Nix `makeBinaryWrapper` wrapper and returns
 * the path to the real wrapped executable, or null if not a wrapper.
 * Returns null if node-lief is not available.
 */
export async function resolveNixBinaryWrapper(
  binaryPath: string
): Promise<string | null> {
  const mod = await tryLoadNativeInstallationModule();
  if (!mod) {
    return null;
  }
  return mod.resolveNixBinaryWrapper(binaryPath);
}
