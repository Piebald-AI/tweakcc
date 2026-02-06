/**
 * Tweakcc Config Utilities
 *
 * Access tweakcc's configuration paths and data.
 * These are tweakcc-specific (not generic patching utilities).
 */

import {
  getConfigDir,
  CONFIG_FILE,
  SYSTEM_PROMPTS_DIR,
  readConfigFile,
} from '../config';
import { TweakccConfig } from './types';

// ============================================================================
// Public API
// ============================================================================

/**
 * Get tweakcc's config directory path.
 *
 * Respects TWEAKCC_CONFIG_DIR environment variable.
 * Falls back to ~/.tweakcc, ~/.claude/tweakcc, or $XDG_CONFIG_HOME/tweakcc.
 *
 * @returns Absolute path to config directory
 */
export function getTweakccConfigDir(): string {
  return getConfigDir();
}

/**
 * Get tweakcc's config file path.
 *
 * @returns Absolute path to config.json
 */
export function getTweakccConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Get tweakcc's system prompts directory.
 *
 * This is where tweakcc stores editable markdown files for system prompts.
 *
 * @returns Absolute path to system-prompts directory
 */
export function getTweakccSystemPromptsDir(): string {
  return SYSTEM_PROMPTS_DIR;
}

/**
 * Read tweakcc's config file.
 *
 * Returns null if the config file doesn't exist.
 *  *
 * @returns The config object, or null if file doesn't exist
 */
export async function readTweakccConfig(): Promise<TweakccConfig | null> {
  try {
    // Use the internal function which handles defaults
    const config = await readConfigFile();
    return config;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
