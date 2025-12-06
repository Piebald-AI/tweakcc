import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as config from './config.js';
import {
  ClaudeCodeInstallationInfo,
  CLIJS_SEARCH_PATHS,
  CONFIG_DIR,
  CONFIG_FILE,
  DEFAULT_SETTINGS,
} from './types.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import type { Stats } from 'node:fs';
import path from 'node:path';
import * as misc from './misc.js';
import * as systemPromptHashIndex from './systemPromptHashIndex.js';
import { execSync } from 'node:child_process';
import * as nativeInstallation from './nativeInstallation.js';

vi.mock('node:fs/promises');
vi.mock('node:child_process');
vi.mock('./nativeInstallation.js', () => ({
  extractClaudeJsFromNativeInstallation: vi.fn(),
  repackNativeInstallation: vi.fn(),
}));
vi.mock('node:fs');

// Mock the replaceFileBreakingHardLinks function
vi.spyOn(misc, 'replaceFileBreakingHardLinks').mockImplementation(
  async (filePath, content) => {
    // Simulate the function by calling the mocked fs.writeFile
    await fs.writeFile(filePath, content);
  }
);

const lstatSpy = vi.spyOn(fs, 'lstat');

const createEnoent = () => {
  const error: NodeJS.ErrnoException = new Error(
    'ENOENT: no such file or directory'
  );
  error.code = 'ENOENT';
  return error;
};

const createEnotdir = () => {
  const error: NodeJS.ErrnoException = new Error('ENOTDIR: not a directory');
  error.code = 'ENOTDIR';
  return error;
};

const createEacces = () => {
  const error: NodeJS.ErrnoException = new Error('EACCES: permission denied');
  error.code = 'EACCES';
  return error;
};

const createEperm = () => {
  const error: NodeJS.ErrnoException = new Error(
    'EPERM: operation not permitted'
  );
  error.code = 'EPERM';
  return error;
};

const createSymlinkStats = (): Stats =>
  ({
    isSymbolicLink: () => true,
  }) as unknown as Stats;

const createRegularStats = (): Stats =>
  ({
    isSymbolicLink: () => false,
  }) as unknown as Stats;

describe('config.ts', () => {
  let originalSearchPathsLength: number;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'clear').mockImplementation(() => {});
    lstatSpy.mockReset();
    lstatSpy.mockRejectedValue(createEnoent());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Mock hasUnappliedSystemPromptChanges to always return false by default
    vi.spyOn(
      systemPromptHashIndex,
      'hasUnappliedSystemPromptChanges'
    ).mockResolvedValue(false);

    // Save original length to detect mutations
    originalSearchPathsLength = CLIJS_SEARCH_PATHS.length;
  });

  afterEach(() => {
    // Clean up any mutations to CLIJS_SEARCH_PATHS
    // findClaudeCodeInstallation mutates the array with unshift()
    while (CLIJS_SEARCH_PATHS.length > originalSearchPathsLength) {
      CLIJS_SEARCH_PATHS.shift();
    }
  });

  describe('warnAboutMultipleConfigs', () => {
    it('should warn when multiple config locations exist', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Mock multiple locations existing
      vi.spyOn(fsSync, 'existsSync').mockImplementation(p => {
        const pathStr = p.toString();
        // CONFIG_DIR is one location, simulate another exists
        return pathStr.includes('.tweakcc') || pathStr.includes('.claude');
      });

      config.warnAboutMultipleConfigs();

      expect(warnSpy).toHaveBeenCalled();
      // Check that warning mentions multiple locations
      const warnings = warnSpy.mock.calls.map(call => call[0]);
      const hasMultipleWarning = warnings.some((w: string) =>
        w.includes('Multiple configuration locations')
      );
      expect(hasMultipleWarning).toBe(true);
    });

    it('should not warn when only one config location exists', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Mock only CONFIG_DIR existing
      vi.spyOn(fsSync, 'existsSync').mockImplementation(p => {
        return p.toString() === CONFIG_DIR;
      });

      config.warnAboutMultipleConfigs();

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('ensureConfigDir', () => {
    it('should create the config directory', async () => {
      const mkdirSpy = vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      await config.ensureConfigDir();
      expect(mkdirSpy).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true });
    });
  });

  describe('readConfigFile', () => {
    it('should return the default config if the file does not exist', async () => {
      vi.spyOn(fs, 'readFile').mockRejectedValue(createEnoent());
      const result = await config.readConfigFile();
      expect(result).toEqual({
        ccVersion: '',
        ccInstallationDir: null,
        lastModified: expect.any(String),
        changesApplied: true,
        settings: DEFAULT_SETTINGS,
      });
    });

    it('should return the parsed config if the file exists', async () => {
      const mockConfig = { ccVersion: '1.0.0' };
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockConfig));
      const result = await config.readConfigFile();
      expect(result).toEqual(expect.objectContaining(mockConfig));
    });
  });

  describe('updateConfigFile', () => {
    it('should update the config file', async () => {
      const writeFileSpy = vi
        .spyOn(fs, 'writeFile')
        .mockResolvedValue(undefined);
      vi.spyOn(fs, 'readFile').mockRejectedValue(createEnoent()); // Start with default config
      const newSettings = { ...DEFAULT_SETTINGS, themes: [] };
      await config.updateConfigFile(c => {
        c.settings = newSettings;
      });

      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      const [filePath, fileContent] = writeFileSpy.mock.calls[0];
      expect(filePath).toBe(CONFIG_FILE);
      const writtenConfig = JSON.parse(fileContent as string);
      expect(writtenConfig.settings).toEqual(newSettings);
    });
  });

  describe('restoreClijsFromBackup', () => {
    it('should copy the backup file and update the config', async () => {
      // Mock the clearAllAppliedHashes function to avoid file system operations
      vi.spyOn(
        systemPromptHashIndex,
        'clearAllAppliedHashes'
      ).mockResolvedValue(undefined);

      // Mock reading the backup file
      const readFileSpy = vi
        .spyOn(fs, 'readFile')
        .mockResolvedValueOnce(Buffer.from('backup content')) // Reading backup file
        .mockRejectedValue(createEnoent()); // Reading config file and others

      // Mock file operations for the helper function
      vi.spyOn(fs, 'stat').mockRejectedValue(createEnoent()); // File doesn't exist
      vi.spyOn(fs, 'unlink').mockResolvedValue(undefined);
      const writeFileSpy = vi
        .spyOn(fs, 'writeFile')
        .mockResolvedValue(undefined);
      vi.spyOn(fs, 'chmod').mockResolvedValue(undefined);

      const ccInstInfo = {
        cliPath: '/fake/path/cli.js',
      } as ClaudeCodeInstallationInfo;

      await config.restoreClijsFromBackup(ccInstInfo);

      // Verify the backup was read
      expect(readFileSpy).toHaveBeenCalledWith(
        expect.stringContaining('cli.js.backup')
      );

      // Verify writeFile was called (at least twice - once for cli.js, once for config)
      expect(writeFileSpy).toHaveBeenCalled();

      // Find the call that wrote to cli.js (not config.json)
      const cliWriteCall = writeFileSpy.mock.calls.find(
        call => call[0] === ccInstInfo.cliPath
      );

      expect(cliWriteCall).toBeDefined();
      expect(cliWriteCall![1]).toEqual(Buffer.from('backup content'));
    });
  });

  describe('findClaudeCodeInstallation', () => {
    it('should include the brew path on non-windows systems', () => {
      if (process.platform !== 'win32') {
        expect(CLIJS_SEARCH_PATHS).toContain(
          path.join(
            '/opt',
            'homebrew',
            'lib',
            'node_modules',
            '@anthropic-ai',
            'claude-code'
          )
        );
      }
    });

    it('should find the installation and return the correct info', async () => {
      const mockConfig = {
        ccInstallationDir: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const mockCliPath = path.join(CLIJS_SEARCH_PATHS[0], 'cli.js');
      // Mock cli.js content with VERSION strings
      const mockCliContent =
        'some code VERSION:"1.2.3" more code VERSION:"1.2.3" and VERSION:"1.2.3"';

      // Mock fs.stat to simulate that cli.js exists
      vi.spyOn(fs, 'stat').mockImplementation(async p => {
        if (p === mockCliPath) {
          return {} as Stats; // File exists
        }
        throw createEnoent(); // File not found
      });

      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === mockCliPath && encoding === 'utf8') {
          return mockCliContent;
        }
        throw new Error('File not found');
      });

      const result = await config.findClaudeCodeInstallation(mockConfig);

      expect(result).toEqual({
        cliPath: mockCliPath,
        version: '1.2.3',
      });
    });

    it('should return null if the installation is not found', async () => {
      const mockConfig = {
        ccInstallationDir: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      // Mock fs.stat to simulate that no cli.js files exist
      vi.spyOn(fs, 'stat').mockRejectedValue(createEnoent());
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'));

      const result = await config.findClaudeCodeInstallation(mockConfig);

      expect(result).toBe(null);
    });

    it('should gracefully skip paths with ENOTDIR errors', async () => {
      const mockConfig = {
        ccInstallationDir: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      // Mock fs.stat to simulate ENOTDIR on first path, then find cli.js on second path
      const mockSecondCliPath = path.join(CLIJS_SEARCH_PATHS[1], 'cli.js');
      const mockCliContent =
        'some code VERSION:"1.2.3" more code VERSION:"1.2.3" and VERSION:"1.2.3"';

      let callCount = 0;
      vi.spyOn(fs, 'stat').mockImplementation(async p => {
        callCount++;
        // First search path returns ENOTDIR (simulating ~/.claude being a file)
        if (callCount === 1) {
          throw createEnotdir();
        }
        // Second search path has cli.js
        if (p === mockSecondCliPath) {
          return {} as Stats;
        }
        throw createEnoent();
      });

      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === mockSecondCliPath && encoding === 'utf8') {
          return mockCliContent;
        }
        throw new Error('File not found');
      });

      const result = await config.findClaudeCodeInstallation(mockConfig);

      expect(result).toEqual({
        cliPath: mockSecondCliPath,
        version: '1.2.3',
      });
    });

    it('should gracefully skip paths with EACCES permission errors', async () => {
      const mockConfig = {
        ccInstallationDir: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      // Mock fs.stat to simulate EACCES on first path (NixOS /usr/local), then find cli.js on second path
      const mockSecondCliPath = path.join(CLIJS_SEARCH_PATHS[1], 'cli.js');
      const mockCliContent =
        'some code VERSION:"1.2.3" more code VERSION:"1.2.3" and VERSION:"1.2.3"';

      let callCount = 0;
      vi.spyOn(fs, 'stat').mockImplementation(async p => {
        callCount++;
        // First search path returns EACCES (simulating permission denied on /usr/local)
        if (callCount === 1) {
          throw createEacces();
        }
        // Second search path has cli.js
        if (p === mockSecondCliPath) {
          return {} as Stats;
        }
        throw createEnoent();
      });

      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === mockSecondCliPath && encoding === 'utf8') {
          return mockCliContent;
        }
        throw new Error('File not found');
      });

      const result = await config.findClaudeCodeInstallation(mockConfig);

      expect(result).toEqual({
        cliPath: mockSecondCliPath,
        version: '1.2.3',
      });
    });

    it('should gracefully skip paths with EPERM permission errors', async () => {
      const mockConfig = {
        ccInstallationDir: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      // Mock fs.stat to simulate EPERM on first path, then find cli.js on second path
      const mockSecondCliPath = path.join(CLIJS_SEARCH_PATHS[1], 'cli.js');
      const mockCliContent =
        'some code VERSION:"1.2.3" more code VERSION:"1.2.3" and VERSION:"1.2.3"';

      let callCount = 0;
      vi.spyOn(fs, 'stat').mockImplementation(async p => {
        callCount++;
        // First search path returns EPERM
        if (callCount === 1) {
          throw createEperm();
        }
        // Second search path has cli.js
        if (p === mockSecondCliPath) {
          return {} as Stats;
        }
        throw createEnoent();
      });

      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === mockSecondCliPath && encoding === 'utf8') {
          return mockCliContent;
        }
        throw new Error('File not found');
      });

      const result = await config.findClaudeCodeInstallation(mockConfig);

      expect(result).toEqual({
        cliPath: mockSecondCliPath,
        version: '1.2.3',
      });
    });

    it('should handle symlink resolution when which claude resolves to cli.js', async () => {
      const mockConfig = {
        ccInstallationDir: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const mockResolvedPath =
        '/usr/local/share/nvm/versions/node/v23.11.1/lib/node_modules/@anthropic-ai/claude-code/cli.js';
      const mockSymlinkPath =
        '/usr/local/share/nvm/versions/node/v23.11.1/bin/claude';

      // Simulate all standard search paths failing, but symlink exists
      vi.spyOn(fs, 'stat').mockImplementation(async filePath => {
        const fileStr = filePath.toString();
        // Standard search paths don't have cli.js
        if (fileStr.includes('node_modules') && fileStr.endsWith('cli.js')) {
          // Except the resolved path exists
          if (fileStr === mockResolvedPath) {
            return {} as Stats;
          }
          throw createEnoent();
        }
        // Symlink exists
        if (fileStr === mockSymlinkPath) {
          return {} as Stats;
        }
        throw createEnoent();
      });

      // Mock which claude command
      vi.mocked(execSync).mockReturnValue(mockSymlinkPath + '\n');

      lstatSpy.mockImplementation(async filePath => {
        if (filePath === mockSymlinkPath) {
          return createSymlinkStats();
        }
        throw createEnoent();
      });

      // Mock fs.realpath to resolve symlink
      vi.spyOn(fs, 'realpath').mockResolvedValue(mockResolvedPath);

      // Mock cli.js content
      const mockCliContent =
        'some code VERSION:"2.0.11" more code VERSION:"2.0.11" and VERSION:"2.0.11"';
      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === mockResolvedPath && encoding === 'utf8') {
          return mockCliContent;
        }
        throw createEnoent();
      });

      const result = await config.findClaudeCodeInstallation(mockConfig);

      expect(result).toEqual({
        cliPath: mockResolvedPath,
        version: '2.0.11',
      });
    });

    it('should detect cli.js path from symlink and treat as NPM installation', async () => {
      const mockConfig = {
        ccInstallationDir: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      // All standard paths fail
      vi.spyOn(fs, 'stat').mockImplementation(async filePath => {
        const fileStr = filePath.toString();
        if (fileStr.includes('node_modules') && fileStr.endsWith('cli.js')) {
          if (
            fileStr ===
            '/usr/local/share/nvm/versions/node/v23.11.1/lib/node_modules/@anthropic-ai/claude-code/cli.js'
          ) {
            return {} as Stats;
          }
        }
        throw createEnoent();
      });

      // Mock which command
      vi.mocked(execSync).mockReturnValue(
        '/usr/local/share/nvm/versions/node/v23.11.1/bin/claude\n'
      );

      lstatSpy.mockImplementation(async filePath => {
        if (
          filePath === '/usr/local/share/nvm/versions/node/v23.11.1/bin/claude'
        ) {
          return createSymlinkStats();
        }
        throw createEnoent();
      });

      // Symlink resolves to cli.js (NPM installation)
      const resolvedCliPath =
        '/usr/local/share/nvm/versions/node/v23.11.1/lib/node_modules/@anthropic-ai/claude-code/cli.js';
      vi.spyOn(fs, 'realpath').mockResolvedValue(resolvedCliPath);

      // Mock VERSION content in cli.js
      const mockCliContent =
        'VERSION:"2.0.11" VERSION:"2.0.11" VERSION:"2.0.11"';
      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === resolvedCliPath && encoding === 'utf8') {
          return mockCliContent;
        }
        throw createEnoent();
      });

      const result = await config.findClaudeCodeInstallation(mockConfig);

      // Should detect it as NPM install with cliPath set
      expect(result).not.toBe(null);
      expect(result!.cliPath).toBe(resolvedCliPath);
      expect(result!.version).toBe('2.0.11');
      expect(result!.nativeInstallationPath).toBeUndefined();
    });

    it('should derive cli.js from a symlink target that resides inside the claude-code package', async () => {
      const mockConfig = {
        ccInstallationDir: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const packageRoot =
        '/usr/local/share/nvm/versions/node/v23.11.1/lib/node_modules/@anthropic-ai/claude-code';
      const resolvedBinaryPath = `${packageRoot}/dist/bin/claude`;
      const symlinkPath =
        '/usr/local/share/nvm/versions/node/v23.11.1/bin/claude';
      const expectedCliPath = path.join(packageRoot, 'cli.js');
      const mockCliContent =
        'VERSION:"2.0.12" more text VERSION:"2.0.12" even more VERSION:"2.0.12"';

      vi.spyOn(fs, 'stat').mockImplementation(async filePath => {
        if (filePath === expectedCliPath) {
          return {} as Stats;
        }
        throw createEnoent();
      });

      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === expectedCliPath && encoding === 'utf8') {
          return mockCliContent;
        }
        throw createEnoent();
      });

      vi.mocked(execSync).mockReturnValue(`${symlinkPath}\n`);
      lstatSpy.mockImplementation(async filePath => {
        if (filePath === symlinkPath) {
          return createSymlinkStats();
        }
        throw createEnoent();
      });
      vi.spyOn(fs, 'realpath').mockResolvedValue(resolvedBinaryPath);

      const result = await config.findClaudeCodeInstallation(mockConfig);

      expect(result).not.toBe(null);
      expect(result!.cliPath).toBe(expectedCliPath);
      expect(result!.version).toBe('2.0.12');
    });

    it('should skip PATH fallback checks on Windows platforms', async () => {
      const mockConfig = {
        ccInstallationDir: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      vi.spyOn(fs, 'stat').mockRejectedValue(createEnoent());
      vi.spyOn(fs, 'readFile').mockRejectedValue(createEnoent());

      const platformSpy = vi
        .spyOn(process, 'platform', 'get')
        .mockReturnValue('win32');

      try {
        const result = await config.findClaudeCodeInstallation(mockConfig);

        expect(execSync).not.toHaveBeenCalled();
        expect(result).toBe(null);
      } finally {
        platformSpy.mockRestore();
      }
    });

    it('should fall back to native installation extraction if symlink does not end with cli.js', async () => {
      const mockConfig = {
        ccInstallationDir: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      // All standard paths fail
      vi.spyOn(fs, 'stat').mockImplementation(async () => {
        throw createEnoent();
      });

      // Mock which command
      vi.mocked(execSync).mockReturnValue('/usr/local/bin/claude\n');

      // Symlink resolves to actual binary (not cli.js)
      const resolvedBinaryPath = '/opt/claude-code/bin/claude';
      lstatSpy.mockImplementation(async filePath => {
        if (filePath === '/usr/local/bin/claude') {
          return createSymlinkStats();
        }
        throw createEnoent();
      });
      vi.spyOn(fs, 'realpath').mockResolvedValue(resolvedBinaryPath);

      vi.spyOn(fs, 'readFile').mockRejectedValue(createEnoent());

      const result = await config.findClaudeCodeInstallation(mockConfig);

      // Should return null since we can't extract from native (mocked to fail)
      expect(result).toBe(null);
    });

    // HIGH PRIORITY: Test ccInstallationDir override
    it('should prioritize ccInstallationDir when specified in config', async () => {
      const customInstallDir = '/custom/claude/installation';
      const mockConfig = {
        ccInstallationDir: customInstallDir,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const customCliPath = path.join(customInstallDir, 'cli.js');
      const mockCliContent = 'VERSION:"3.0.0" VERSION:"3.0.0" VERSION:"3.0.0"';

      // Mock fs.stat to make custom path exist
      vi.spyOn(fs, 'stat').mockImplementation(async p => {
        if (p === customCliPath) {
          return {} as Stats;
        }
        throw createEnoent();
      });

      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === customCliPath && encoding === 'utf8') {
          return mockCliContent;
        }
        throw createEnoent();
      });

      const result = await config.findClaudeCodeInstallation(mockConfig);

      expect(result).not.toBe(null);
      expect(result!.cliPath).toBe(customCliPath);
      expect(result!.version).toBe('3.0.0');
    });

    it('should use ccInstallationDir before falling back to standard paths', async () => {
      const customInstallDir = '/custom/claude/installation';
      const mockConfig = {
        ccInstallationDir: customInstallDir,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const customCliPath = path.join(customInstallDir, 'cli.js');
      const standardCliPath = path.join(CLIJS_SEARCH_PATHS[0], 'cli.js');
      const mockCliContent = 'VERSION:"3.5.0" VERSION:"3.5.0" VERSION:"3.5.0"';

      let checkedCustomFirst = false;

      // Mock fs.stat to fail custom path, then succeed on standard path
      vi.spyOn(fs, 'stat').mockImplementation(async p => {
        if (p === customCliPath) {
          checkedCustomFirst = true;
          throw createEnoent(); // Custom path doesn't exist
        }
        if (p === standardCliPath) {
          // Verify custom path was checked first
          expect(checkedCustomFirst).toBe(true);
          return {} as Stats;
        }
        throw createEnoent();
      });

      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === standardCliPath && encoding === 'utf8') {
          return mockCliContent;
        }
        throw createEnoent();
      });

      // Mock execSync to ensure it doesn't find anything on PATH
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('command not found');
      });

      const result = await config.findClaudeCodeInstallation(mockConfig);

      expect(result).not.toBe(null);
      expect(result!.cliPath).toBe(standardCliPath);
      expect(result!.version).toBe('3.5.0');
    });

    // Note: Native installation success tests are difficult to mock properly due to ESM module import hoisting.
    // The actual native installation logic is tested implicitly through integration tests.
    // We test the failure cases below which provide good coverage of the error handling paths.

    it('should return null if native extraction fails to find version', async () => {
      const mockConfig = {
        ccInstallationDir: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const nativeBinaryPath = '/usr/local/bin/claude';

      // All NPM search paths fail
      vi.spyOn(fs, 'stat').mockImplementation(async () => {
        throw createEnoent();
      });

      // Mock which command
      vi.mocked(execSync).mockReturnValue(nativeBinaryPath + '\n');
      lstatSpy.mockImplementation(async filePath => {
        if (filePath === nativeBinaryPath) {
          return createRegularStats();
        }
        throw createEnoent();
      });
      vi.spyOn(fs, 'realpath').mockResolvedValue(nativeBinaryPath);

      // Mock extractClaudeJsFromNativeInstallation to return content without VERSION
      vi.mocked(
        nativeInstallation.extractClaudeJsFromNativeInstallation
      ).mockReturnValue(Buffer.from('no version here'));

      const result = await config.findClaudeCodeInstallation(mockConfig);

      expect(result).toBe(null);
    });

    it('should return null if native extraction returns null', async () => {
      const mockConfig = {
        ccInstallationDir: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const nativeBinaryPath = '/usr/local/bin/claude';

      // All NPM search paths fail
      vi.spyOn(fs, 'stat').mockImplementation(async () => {
        throw createEnoent();
      });

      // Mock which command
      vi.mocked(execSync).mockReturnValue(nativeBinaryPath + '\n');
      lstatSpy.mockImplementation(async filePath => {
        if (filePath === nativeBinaryPath) {
          return createRegularStats();
        }
        throw createEnoent();
      });
      vi.spyOn(fs, 'realpath').mockResolvedValue(nativeBinaryPath);

      // Mock extractClaudeJsFromNativeInstallation to return null (extraction failed)
      vi.mocked(
        nativeInstallation.extractClaudeJsFromNativeInstallation
      ).mockReturnValue(null);

      const result = await config.findClaudeCodeInstallation(mockConfig);

      expect(result).toBe(null);
    });
  });

  describe('startupCheck', () => {
    it('should backup cli.js if no backup exists', async () => {
      const mockCliPath = path.join(CLIJS_SEARCH_PATHS[0], 'cli.js');
      const mockCliContent =
        'some code VERSION:"1.0.0" more code VERSION:"1.0.0" and VERSION:"1.0.0"';

      // Mock fs.stat to make cli.js exist but backup not exist
      vi.spyOn(fs, 'stat').mockImplementation(async filePath => {
        if (filePath.toString().includes('cli.js.backup')) {
          throw createEnoent(); // Backup doesn't exist
        }
        if (filePath === mockCliPath) {
          return {} as Stats; // cli.js exists
        }
        throw createEnoent();
      });

      const copyFileSpy = vi.spyOn(fs, 'copyFile').mockResolvedValue(undefined);
      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === mockCliPath && encoding === 'utf8') {
          return mockCliContent;
        }
        if (p === CONFIG_FILE) {
          return JSON.stringify({ ccVersion: '1.0.0' });
        }
        throw createEnoent();
      });
      vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      await config.startupCheck();

      expect(copyFileSpy).toHaveBeenCalled();
    });

    it('should re-backup if the version has changed', async () => {
      const mockCliPath = path.join(CLIJS_SEARCH_PATHS[0], 'cli.js');
      const mockCliContent =
        'some code VERSION:"2.0.0" more code VERSION:"2.0.0" and VERSION:"2.0.0"';

      // Mock fs.stat to make both cli.js and backup exist
      vi.spyOn(fs, 'stat').mockImplementation(async filePath => {
        if (filePath === mockCliPath) {
          return {} as Stats; // cli.js exists
        }
        if (filePath.toString().includes('cli.js.backup')) {
          return {} as Stats; // Backup exists
        }
        throw createEnoent();
      });

      const unlinkSpy = vi.spyOn(fs, 'unlink').mockResolvedValue(undefined);
      const copyFileSpy = vi.spyOn(fs, 'copyFile').mockResolvedValue(undefined);
      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === mockCliPath && encoding === 'utf8') {
          return mockCliContent;
        }
        if (p === CONFIG_FILE) {
          return JSON.stringify({ ccVersion: '1.0.0' }); // Different version
        }
        throw createEnoent();
      });
      vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      const result = await config.startupCheck();

      expect(unlinkSpy).toHaveBeenCalled();
      expect(copyFileSpy).toHaveBeenCalled();
      expect(result).not.toBe(null);
      expect(result!.wasUpdated).toBe(true);
    });
  });

  describe('userMessageDisplay migration', () => {
    it('should migrate old prefix/message structure to new format string', async () => {
      const oldConfig = {
        ccVersion: '1.0.0',
        ccInstallationDir: null,
        lastModified: '2024-01-01',
        changesApplied: true,
        settings: {
          ...DEFAULT_SETTINGS,
          userMessageDisplay: {
            prefix: {
              format: '>',
              styling: ['bold'],
              foregroundColor: 'rgb(255,0,0)',
              backgroundColor: 'rgb(0,0,0)',
            },
            message: {
              format: '{}',
              styling: ['italic'],
              foregroundColor: 'rgb(0,255,0)',
              backgroundColor: 'rgb(0,0,0)',
            },
          },
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(oldConfig));

      const result = await config.readConfigFile();

      expect(result.settings.userMessageDisplay).toEqual({
        format: '> {}',
        styling: ['bold', 'italic'],
        foregroundColor: 'rgb(0,255,0)',
        backgroundColor: null,
        borderStyle: 'none',
        borderColor: 'rgb(255,255,255)',
        paddingX: 0,
        paddingY: 0,
      });
    });

    it('should convert rgb(0,0,0) to default/null', async () => {
      const oldConfig = {
        ccVersion: '1.0.0',
        ccInstallationDir: null,
        lastModified: '2024-01-01',
        changesApplied: true,
        settings: {
          ...DEFAULT_SETTINGS,
          userMessageDisplay: {
            prefix: {
              format: '> ',
              styling: [],
              foregroundColor: 'rgb(0,0,0)',
              backgroundColor: 'rgb(0,0,0)',
            },
            message: {
              format: '{}',
              styling: [],
              foregroundColor: 'rgb(0,0,0)',
              backgroundColor: 'rgb(0,0,0)',
            },
          },
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(oldConfig));

      const result = await config.readConfigFile();

      expect(result.settings.userMessageDisplay).toEqual({
        format: '> {}',
        styling: [],
        foregroundColor: 'default',
        backgroundColor: null,
        borderStyle: 'none',
        borderColor: 'rgb(255,255,255)',
        paddingX: 0,
        paddingY: 0,
      });
    });

    it('should preserve custom colors during migration', async () => {
      const oldConfig = {
        ccVersion: '1.0.0',
        ccInstallationDir: null,
        lastModified: '2024-01-01',
        changesApplied: true,
        settings: {
          ...DEFAULT_SETTINGS,
          userMessageDisplay: {
            prefix: {
              format: '>> ',
              styling: [],
              foregroundColor: 'rgb(100,100,100)',
              backgroundColor: 'rgb(50,50,50)',
            },
            message: {
              format: '{}',
              styling: [],
              foregroundColor: 'rgb(200,200,200)',
              backgroundColor: 'rgb(75,75,75)',
            },
          },
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(oldConfig));

      const result = await config.readConfigFile();

      expect(result.settings.userMessageDisplay).toEqual({
        format: '>> {}',
        styling: [],
        foregroundColor: 'rgb(200,200,200)',
        backgroundColor: 'rgb(75,75,75)',
        borderStyle: 'none',
        borderColor: 'rgb(255,255,255)',
        paddingX: 0,
        paddingY: 0,
      });
    });

    it('should not migrate if already in new format', async () => {
      const newConfig = {
        ccVersion: '1.0.0',
        ccInstallationDir: null,
        lastModified: '2024-01-01',
        changesApplied: true,
        settings: {
          ...DEFAULT_SETTINGS,
          userMessageDisplay: {
            format: '> {}',
            styling: [],
            foregroundColor: 'default',
            backgroundColor: null,
            borderStyle: 'none',
            borderColor: 'rgb(255,255,255)',
            paddingX: 0,
            paddingY: 0,
          },
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(newConfig));

      const result = await config.readConfigFile();

      expect(result.settings.userMessageDisplay).toEqual({
        format: '> {}',
        styling: [],
        foregroundColor: 'default',
        backgroundColor: null,
        borderStyle: 'none',
        borderColor: 'rgb(255,255,255)',
        paddingX: 0,
        paddingY: 0,
      });
    });
  });
});
