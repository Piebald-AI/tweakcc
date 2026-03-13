/**
 * Async wrappers around nativeInstallation.ts.
 *
 * nativeInstallation.ts uses a lazy require() for node-lief, so it loads
 * safely on all platforms. LIEF is only required at call time for MachO/PE
 * code paths; ELF binaries (Linux/NixOS) never touch LIEF.
 */

import {
  extractClaudeJsFromNativeInstallation as extractFn,
  repackNativeInstallation as repackFn,
  resolveNixBinaryWrapper as resolveFn,
} from './nativeInstallation';
import { debug } from './utils';

let loadError: string | null = null;
let loadErrorChecked = false;

/** Returns the reason node-lief failed to load, or null if it loaded successfully. */
export function getNativeModuleLoadError(): string | null {
  if (!loadErrorChecked) {
    loadErrorChecked = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('node-lief');
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
      debug(`node-lief not available: ${loadError}`);
    }
  }
  return loadError;
}

/**
 * Extracts claude.js from a native installation binary.
 * Returns null if extraction fails.
 */
export async function extractClaudeJsFromNativeInstallation(
  nativeInstallationPath: string
): Promise<Buffer | null> {
  return extractFn(nativeInstallationPath);
}

/**
 * Repacks a modified claude.js back into the native installation binary.
 */
export async function repackNativeInstallation(
  binPath: string,
  modifiedClaudeJs: Buffer,
  outputPath: string
): Promise<void> {
  repackFn(binPath, modifiedClaudeJs, outputPath);
}

/**
 * Detects whether a binary is a Nix `makeBinaryWrapper` wrapper and returns
 * the path to the real wrapped executable, or null if not a wrapper.
 */
export async function resolveNixBinaryWrapper(
  binaryPath: string
): Promise<string | null> {
  try {
    return resolveFn(binaryPath);
  } catch {
    return null;
  }
}
