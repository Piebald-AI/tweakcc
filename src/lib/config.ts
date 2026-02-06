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
 */
export function getTweakccConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Get tweakcc's system prompts directory.
 *
 * This is where tweakcc stores editable markdown files for system prompts.
 */
export function getTweakccSystemPromptsDir(): string {
  return SYSTEM_PROMPTS_DIR;
}

/**
 * Read tweakcc's config file.
 */
export async function readTweakccConfig(): Promise<TweakccConfig> {
  return await readConfigFile();
}
