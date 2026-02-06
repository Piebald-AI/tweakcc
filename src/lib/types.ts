/**
 * tweakcc Library Types
 *
 * These are the public types exposed by the library API.
 */

// ============================================================================
// Installation Types
// ============================================================================

/**
 * A Claude Code installation detected on the system.
 */
export interface Installation {
  /** Path to cli.js (npm) or native binary */
  path: string;
  /** Claude Code version, e.g., "2.1.0" */
  version: string;
  /** Type of installation */
  kind: 'npm' | 'native';
}

// ============================================================================
// Re-export config types from main types.ts
// ============================================================================

export type { TweakccConfig, Settings } from '../types';
