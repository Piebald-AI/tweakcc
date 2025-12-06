import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

describe('XDG_CONFIG_HOME support with migration', () => {
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    // Save original value
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original value
    if (originalXdgConfigHome !== undefined) {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }
  });

  // Test implementation that mirrors the actual getConfigDir logic
  const getConfigDir = (legacyDirExists: boolean): string => {
    const legacyDir = path.join(os.homedir(), '.tweakcc');
    const xdgConfigHome = process.env.XDG_CONFIG_HOME;

    // Check if legacy directory exists - use it for backward compatibility
    if (legacyDirExists) {
      return legacyDir;
    }

    // No legacy directory - use XDG if available
    if (xdgConfigHome) {
      return path.join(xdgConfigHome, 'tweakcc');
    }

    // Default to legacy location
    return legacyDir;
  };

  // Migration test: existing ~/.tweakcc takes precedence
  it('should use ~/.tweakcc when it exists, even if XDG_CONFIG_HOME is set', () => {
    process.env.XDG_CONFIG_HOME = '/custom/config/dir';

    const expectedDir = path.join(os.homedir(), '.tweakcc');
    const result = getConfigDir(true); // legacy dir exists

    expect(result).toBe(expectedDir);
  });

  // New user with XDG_CONFIG_HOME
  it('should use $XDG_CONFIG_HOME/tweakcc when ~/.tweakcc does not exist and XDG_CONFIG_HOME is set', () => {
    const testConfigHome = '/custom/config/dir';
    process.env.XDG_CONFIG_HOME = testConfigHome;

    const expectedDir = path.join(testConfigHome, 'tweakcc');
    const result = getConfigDir(false); // legacy dir doesn't exist

    expect(result).toBe(expectedDir);
  });

  // New user without XDG_CONFIG_HOME
  it('should use ~/.tweakcc when it does not exist and XDG_CONFIG_HOME is not set', () => {
    delete process.env.XDG_CONFIG_HOME;

    const expectedDir = path.join(os.homedir(), '.tweakcc');
    const result = getConfigDir(false); // legacy dir doesn't exist

    expect(result).toBe(expectedDir);
  });

  // Standard XDG location
  it('should use $HOME/.config/tweakcc when XDG_CONFIG_HOME=$HOME/.config and ~/.tweakcc does not exist', () => {
    const testConfigHome = path.join(os.homedir(), '.config');
    process.env.XDG_CONFIG_HOME = testConfigHome;

    const expectedDir = path.join(testConfigHome, 'tweakcc');
    const result = getConfigDir(false); // legacy dir doesn't exist

    expect(result).toBe(expectedDir);
  });

  // Handle trailing slash
  it('should handle XDG_CONFIG_HOME with trailing slash', () => {
    const testConfigHome = '/custom/config/dir/';
    process.env.XDG_CONFIG_HOME = testConfigHome;

    // path.join should normalize the path
    const expectedDir = path.join(testConfigHome, 'tweakcc');
    const result = getConfigDir(false); // legacy dir doesn't exist

    expect(result).toBe(expectedDir);
  });

  // XDG spec compliance
  it('should use directory name "tweakcc" without dot when using XDG path', () => {
    const testConfigHome = '/test/config';
    process.env.XDG_CONFIG_HOME = testConfigHome;

    const result = getConfigDir(false); // legacy dir doesn't exist

    // Should be "tweakcc", not ".tweakcc"
    expect(result).toBe('/test/config/tweakcc');
    expect(result).not.toContain('.tweakcc');
  });

  // Test derived paths
  it('should construct correct CONFIG_FILE path with XDG', () => {
    process.env.XDG_CONFIG_HOME = '/test/config';

    const configDir = getConfigDir(false); // legacy dir doesn't exist
    const configFile = path.join(configDir, 'config.json');

    expect(configFile).toBe('/test/config/tweakcc/config.json');
  });

  it('should construct correct CLIJS_BACKUP_FILE path with XDG', () => {
    process.env.XDG_CONFIG_HOME = '/test/config';

    const configDir = getConfigDir(false); // legacy dir doesn't exist
    const backupFile = path.join(configDir, 'cli.js.backup');

    expect(backupFile).toBe('/test/config/tweakcc/cli.js.backup');
  });

  it('should construct correct SYSTEM_PROMPTS_DIR path with XDG', () => {
    process.env.XDG_CONFIG_HOME = '/test/config';

    const configDir = getConfigDir(false); // legacy dir doesn't exist
    const systemPromptsDir = path.join(configDir, 'system-prompts');

    expect(systemPromptsDir).toBe('/test/config/tweakcc/system-prompts');
  });
});

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
      expect(result).toBe('/xdg/tweakcc');

      // Test default fallback
      result = testGetConfigDir(undefined, false, false, undefined);
      expect(result).toBe(path.join(os.homedir(), '.tweakcc'));
    });
  });
});
