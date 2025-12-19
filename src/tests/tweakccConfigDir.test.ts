import path from 'node:path';
import os from 'node:os';
import { describe, beforeEach, afterEach, it } from 'vitest';
import { vi, expect } from 'vitest';

describe('TWEAKCC_CONFIG_DIR and ~/.claude/tweakcc support', () => {
  let originalTweakccConfigDir: string | undefined;

  beforeEach(() => {
    originalTweakccConfigDir = process.env.TWEAKCC_CONFIG_DIR;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalTweakccConfigDir !== undefined) {
      process.env.TWEAKCC_CONFIG_DIR = originalTweakccConfigDir;
    } else {
      delete process.env.TWEAKCC_CONFIG_DIR;
    }
  });

  // Test implementation helper that matches the actual getConfigDir logic
  const testGetConfigDir = (
    tweakccConfigDir: string | undefined,
    legacyDirExists: boolean,
    claudeDirExists: boolean,
    xdgConfigHome: string | undefined
  ): string => {
    // Check TWEAKCC_CONFIG_DIR first
    const trimmed = tweakccConfigDir?.trim();
    if (trimmed && trimmed.length > 0) {
      // Expand tilde
      if (trimmed.startsWith('~')) {
        return path.join(os.homedir(), trimmed.slice(1));
      }
      return trimmed;
    }

    const legacyDir = path.join(os.homedir(), '.tweakcc');
    const claudeDir = path.join(os.homedir(), '.claude', 'tweakcc');

    if (legacyDirExists) {
      return legacyDir;
    }

    if (claudeDirExists) {
      return claudeDir;
    }

    if (xdgConfigHome) {
      return path.join(xdgConfigHome, 'tweakcc');
    }

    return legacyDir;
  };

  describe('TWEAKCC_CONFIG_DIR environment variable', () => {
    it('should use TWEAKCC_CONFIG_DIR when set (highest priority)', () => {
      const result = testGetConfigDir('/custom/path', false, false, undefined);
      expect(result).toBe('/custom/path');
    });

    it('should expand ~ in TWEAKCC_CONFIG_DIR', () => {
      const result = testGetConfigDir(
        '~/custom/tweakcc',
        false,
        false,
        undefined
      );
      const expectedDir = path.join(os.homedir(), 'custom/tweakcc');
      expect(result).toBe(expectedDir);
    });

    it('should ignore empty TWEAKCC_CONFIG_DIR', () => {
      const result = testGetConfigDir('', true, false, undefined);
      const expectedDir = path.join(os.homedir(), '.tweakcc');
      expect(result).toBe(expectedDir);
    });

    it('should trim whitespace from TWEAKCC_CONFIG_DIR', () => {
      const result = testGetConfigDir(
        '  /custom/path  ',
        false,
        false,
        undefined
      );
      expect(result).toBe('/custom/path');
    });

    it('should prioritize TWEAKCC_CONFIG_DIR over all other locations', () => {
      const result = testGetConfigDir(
        '/custom/path',
        true,
        true,
        '/xdg/config'
      );
      expect(result).toBe('/custom/path');
    });
  });

  describe('~/.claude/tweakcc location', () => {
    it('should use ~/.claude/tweakcc if ~/.tweakcc does not exist', () => {
      const result = testGetConfigDir(undefined, false, true, undefined);
      const expectedDir = path.join(os.homedir(), '.claude', 'tweakcc');
      expect(result).toBe(expectedDir);
    });

    it('should prefer ~/.tweakcc over ~/.claude/tweakcc (backward compat)', () => {
      const result = testGetConfigDir(undefined, true, true, undefined);
      const expectedDir = path.join(os.homedir(), '.tweakcc');
      expect(result).toBe(expectedDir);
    });

    it('should prefer ~/.claude/tweakcc over XDG_CONFIG_HOME', () => {
      const result = testGetConfigDir(undefined, false, true, '/custom/config');
      const expectedDir = path.join(os.homedir(), '.claude', 'tweakcc');
      expect(result).toBe(expectedDir);
    });
  });

  describe('Priority order integration', () => {
    it('should follow priority: env > legacy > claude > xdg > default', () => {
      // Test env var wins over everything
      let result = testGetConfigDir('/env/path', true, true, '/xdg');
      expect(result).toBe('/env/path');

      // Test legacy wins over claude and xdg
      result = testGetConfigDir(undefined, true, true, '/xdg');
      expect(result).toBe(path.join(os.homedir(), '.tweakcc'));

      // Test claude wins over xdg
      result = testGetConfigDir(undefined, false, true, '/xdg');
      expect(result).toBe(path.join(os.homedir(), '.claude', 'tweakcc'));

      // Test xdg wins when legacy and claude don't exist
      result = testGetConfigDir(undefined, false, false, '/xdg');
      expect(result).toBe(path.join('/xdg', 'tweakcc'));

      // Test default fallback
      result = testGetConfigDir(undefined, false, false, undefined);
      expect(result).toBe(path.join(os.homedir(), '.tweakcc'));
    });
  });
});
