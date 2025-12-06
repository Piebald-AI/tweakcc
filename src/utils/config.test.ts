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
import * as childProcess from 'node:child_process';
import type { Stats } from 'node:fs';
import path from 'node:path';
import * as misc from './misc.js';
import * as systemPromptHashIndex from './systemPromptHashIndex.js';
import { execSync } from 'node:child_process';
import * as nativeInstallation from './nativeInstallation.js';
import { WASMagic } from 'wasmagic';

vi.mock('wasmagic');
vi.mock('node:fs/promises');
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));
vi.mock('./nativeInstallation.js', () => ({
  extractClaudeJsFromNativeInstallation: vi.fn(),
  repackNativeInstallation: vi.fn(),
}));
vi.mock('node:fs');

const mockMagicInstance: { detect: ReturnType<typeof vi.fn> } = {
  detect: vi.fn(),
};

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

    // By default, pretend there is no `claude` executable on PATH.
    (
      childProcess.execSync as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(() => {
      throw new Error('claude not found');
    });

    mockMagicInstance.detect.mockReset();
    (WASMagic.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockMagicInstance
    );
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
        ccInstallation: null,
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

  describe('migrateConfigIfNeeded', () => {
    it('should migrate ccInstallationDir to ccInstallation and return true', async () => {
      const mockConfig = { ccInstallationDir: '/some/path', settings: {} };
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockConfig));
      const writeSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      const result = await config.migrateConfigIfNeeded();

      expect(result).toBe(true);
      expect(writeSpy).toHaveBeenCalled();

      // Verify the written config has ccInstallation and not ccInstallationDir
      const writtenConfig = JSON.parse(writeSpy.mock.calls[0][1] as string);
      expect(writtenConfig.ccInstallation).toBe(
        path.join('/some/path', 'cli.js')
      );
      expect(writtenConfig.ccInstallationDir).toBeUndefined();
    });

    it('should return false if no migration needed', async () => {
      const mockConfig = { ccInstallation: '/some/path/cli.js', settings: {} };
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockConfig));
      const writeSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      const result = await config.migrateConfigIfNeeded();

      expect(result).toBe(false);
      expect(writeSpy).not.toHaveBeenCalled();
    });

    it('should return false if config file does not exist', async () => {
      vi.spyOn(fs, 'readFile').mockRejectedValue(createEnoent());

      const result = await config.migrateConfigIfNeeded();

      expect(result).toBe(false);
    });

    it('should be idempotent - second call returns false after migration', async () => {
      const mockConfig = { ccInstallationDir: '/some/path', settings: {} };
      const migratedConfig = {
        ccInstallation: path.join('/some/path', 'cli.js'),
        settings: {},
        lastModified: expect.any(String),
      };

      let callCount = 0;
      vi.spyOn(fs, 'readFile').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify(mockConfig);
        }
        // After first migration, return the migrated config
        return JSON.stringify(migratedConfig);
      });
      vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      const result1 = await config.migrateConfigIfNeeded();
      const result2 = await config.migrateConfigIfNeeded();

      expect(result1).toBe(true);
      expect(result2).toBe(false);
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
        ccInstallation: null,
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

    it('should treat PATH claude executable as cli.js when WASMagic detects JS', async () => {
      const mockConfig = {
        ccInstallation: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const mockExePath = '/usr/local/bin/claude';
      const mockCliContent =
        'some code VERSION:"3.4.5" more code VERSION:"3.4.5" and VERSION:"3.4.5"';

      // Make PATH lookup succeed.
      (
        childProcess.execSync as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => `${mockExePath}\n`);

      // Make only the PATH executable exist, not CLIJS_SEARCH_PATHS entries
      vi.spyOn(fs, 'stat').mockImplementation(async p => {
        if (p === mockExePath) {
          return {} as Stats;
        }
        throw createEnoent();
      });
      lstatSpy.mockResolvedValue(createRegularStats());
      vi.spyOn(fs, 'realpath').mockResolvedValue(mockExePath);
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          const contentBuffer = Buffer.from('fake js content');
          contentBuffer.copy(buffer);
          return { bytesRead: contentBuffer.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      // WASMagic reports JavaScript.
      mockMagicInstance.detect.mockReturnValue('application/javascript');

      // Version extraction from the cli.js path.
      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === mockExePath && encoding === 'utf8') {
          return mockCliContent;
        }
        throw new Error('File not found');
      });

      const result = await config.findClaudeCodeInstallation(mockConfig);

      expect(result).toEqual({
        cliPath: mockExePath,
        version: '3.4.5',
      });
    });

    it('should treat PATH claude executable as native installation when WASMagic detects binary', async () => {
      const mockConfig = {
        ccInstallation: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const mockExePath = '/usr/local/bin/claude';
      const mockJsBuffer = Buffer.from(
        'some code VERSION:"4.5.6" more code VERSION:"4.5.6" and VERSION:"4.5.6"',
        'utf8'
      );

      // Make PATH lookup succeed.
      (
        childProcess.execSync as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => `${mockExePath}\n`);

      // Make only the PATH executable exist, not CLIJS_SEARCH_PATHS entries
      vi.spyOn(fs, 'stat').mockImplementation(async p => {
        if (p === mockExePath) {
          return {} as Stats;
        }
        throw createEnoent();
      });
      lstatSpy.mockResolvedValue(createRegularStats());
      vi.spyOn(fs, 'realpath').mockResolvedValue(mockExePath);
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          const contentBuffer = Buffer.from('fake binary content');
          contentBuffer.copy(buffer);
          return { bytesRead: contentBuffer.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      // WASMagic reports a non-text MIME type.
      mockMagicInstance.detect.mockReturnValue('application/octet-stream');

      // Mock extraction from native installation.
      vi.spyOn(
        nativeInstallation,
        'extractClaudeJsFromNativeInstallation'
      ).mockReturnValue(mockJsBuffer);

      const result = await config.findClaudeCodeInstallation(mockConfig);

      expect(result).toEqual({
        version: '4.5.6',
        nativeInstallationPath: mockExePath,
      });
    });

    it('should use ccInstallation over PATH when both are available', async () => {
      const mockCliPath = '/custom/explicit/cli.js';
      const mockPathExe = '/usr/local/bin/claude';
      const mockConfig = {
        ccInstallation: mockCliPath,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      // Make PATH lookup succeed (this should be ignored)
      (
        childProcess.execSync as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => `${mockPathExe}\n`);

      // Make both paths exist
      vi.spyOn(fs, 'stat').mockResolvedValue({} as Stats);
      vi.spyOn(fs, 'realpath').mockResolvedValue(mockPathExe);
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          const contentBuffer = Buffer.from('fake js content');
          contentBuffer.copy(buffer);
          return { bytesRead: contentBuffer.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      mockMagicInstance.detect.mockReturnValue('application/javascript');

      // Return different versions for explicit path vs PATH to verify which is used
      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === mockCliPath && encoding === 'utf8') {
          return 'VERSION:"1.1.1" VERSION:"1.1.1" VERSION:"1.1.1"'; // Explicit path version
        }
        if (p === mockPathExe && encoding === 'utf8') {
          return 'VERSION:"2.2.2" VERSION:"2.2.2" VERSION:"2.2.2"'; // PATH version (should not be used)
        }
        throw createEnoent();
      });

      const result = await config.findClaudeCodeInstallation(mockConfig);

      // Should use the explicit ccInstallation path, not the PATH executable
      expect(result).toEqual({
        cliPath: mockCliPath,
        version: '1.1.1', // Version from explicit path, not PATH
      });
    });

    it('should use ccInstallation path as cli.js when WASMagic detects JS', async () => {
      const mockCliPath = '/custom/path/cli.js';
      const mockConfig = {
        ccInstallation: mockCliPath,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const mockCliContent =
        'some code VERSION:"7.8.9" more code VERSION:"7.8.9" and VERSION:"7.8.9"';

      vi.spyOn(fs, 'stat').mockResolvedValue({} as Stats);
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          const contentBuffer = Buffer.from('fake js content');
          contentBuffer.copy(buffer);
          return { bytesRead: contentBuffer.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      mockMagicInstance.detect.mockReturnValue('application/javascript');

      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === mockCliPath && encoding === 'utf8') {
          return mockCliContent;
        }
        throw createEnoent();
      });

      const result = await config.findClaudeCodeInstallation(mockConfig);

      expect(result).toEqual({
        cliPath: mockCliPath,
        version: '7.8.9',
      });
    });

    it('should use ccInstallation path as native installation when WASMagic detects binary', async () => {
      const mockNativePath = '/custom/path/claude-native';
      const mockConfig = {
        ccInstallation: mockNativePath,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const mockJsBuffer = Buffer.from(
        'some code VERSION:"9.8.7" more code VERSION:"9.8.7" and VERSION:"9.8.7"',
        'utf8'
      );

      vi.spyOn(fs, 'stat').mockResolvedValue({} as Stats);
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          const contentBuffer = Buffer.from('fake binary content');
          contentBuffer.copy(buffer);
          return { bytesRead: contentBuffer.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      mockMagicInstance.detect.mockReturnValue('application/octet-stream');

      vi.spyOn(
        nativeInstallation,
        'extractClaudeJsFromNativeInstallation'
      ).mockReturnValue(mockJsBuffer);

      const result = await config.findClaudeCodeInstallation(mockConfig);

      expect(result).toEqual({
        version: '9.8.7',
        nativeInstallationPath: mockNativePath,
      });
    });

    it('should return null if the installation is not found', async () => {
      const mockConfig = {
        ccInstallation: null,
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
        ccInstallation: null,
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
        ccInstallation: null,
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
        ccInstallation: null,
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
        ccInstallation: null,
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
        ccInstallation: null,
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
        ccInstallation: null,
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
        ccInstallation: null,
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
        ccInstallation: null,
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

      // Mock fs.open for WASMagic detection
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          const contentBuffer = Buffer.from('fake binary content');
          contentBuffer.copy(buffer);
          return { bytesRead: contentBuffer.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      // WASMagic reports binary
      mockMagicInstance.detect.mockReturnValue('application/octet-stream');

      // Mock native extraction to return null (extraction failed)
      vi.spyOn(
        nativeInstallation,
        'extractClaudeJsFromNativeInstallation'
      ).mockReturnValue(null);

      vi.spyOn(fs, 'readFile').mockRejectedValue(createEnoent());

      const result = await config.findClaudeCodeInstallation(mockConfig);

      // Should return null since native extraction failed
      expect(result).toBe(null);
    });

    // HIGH PRIORITY: Test ccInstallation override
    it('should prioritize ccInstallation when specified in config', async () => {
      const customCliPath = '/custom/claude/installation/cli.js';
      const mockConfig = {
        ccInstallation: customCliPath,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const mockCliContent = 'VERSION:"3.0.0" VERSION:"3.0.0" VERSION:"3.0.0"';

      // Mock fs.stat to make custom path exist
      vi.spyOn(fs, 'stat').mockImplementation(async p => {
        if (p === customCliPath) {
          return {} as Stats;
        }
        throw createEnoent();
      });

      // Mock fs.open for WASMagic detection
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          const contentBuffer = Buffer.from('fake js content');
          contentBuffer.copy(buffer);
          return { bytesRead: contentBuffer.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      // WASMagic reports JavaScript
      mockMagicInstance.detect.mockReturnValue('application/javascript');

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

    it('should use ccInstallation before falling back to standard paths', async () => {
      const customCliPath = '/custom/claude/installation/cli.js';
      const mockConfig = {
        ccInstallation: customCliPath,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

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
        ccInstallation: null,
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
        ccInstallation: null,
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
              format: '$',
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
        format: '${}',
        styling: ['bold', 'italic'],
        foregroundColor: 'rgb(0,255,0)',
        backgroundColor: null,
        borderStyle: 'none',
        borderColor: 'rgb(255,255,255)',
        paddingX: 0,
        paddingY: 0,
        fitBoxToContent: false,
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
              format: '#',
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
        format: '#{}',
        styling: [],
        foregroundColor: 'default',
        backgroundColor: null,
        borderStyle: 'none',
        borderColor: 'rgb(255,255,255)',
        paddingX: 0,
        paddingY: 0,
        fitBoxToContent: false,
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
        fitBoxToContent: false,
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
            format: ' > {} ',
            styling: [],
            foregroundColor: 'default',
            backgroundColor: null,
            borderStyle: 'none',
            borderColor: 'rgb(255,255,255)',
            paddingX: 0,
            paddingY: 0,
            fitBoxToContent: false,
          },
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(newConfig));

      const result = await config.readConfigFile();

      expect(result.settings.userMessageDisplay).toEqual({
        format: ' > {} ',
        styling: [],
        foregroundColor: 'default',
        backgroundColor: null,
        borderStyle: 'none',
        borderColor: 'rgb(255,255,255)',
        paddingX: 0,
        paddingY: 0,
        fitBoxToContent: false,
      });
    });

    it('should add fitBoxToContent if missing from new format config', async () => {
      const configMissingFitBox = {
        ccVersion: '1.0.0',
        ccInstallationDir: null,
        lastModified: '2024-01-01',
        changesApplied: true,
        settings: {
          ...DEFAULT_SETTINGS,
          userMessageDisplay: {
            format: ' > {} ',
            styling: [],
            foregroundColor: 'default',
            backgroundColor: null,
            borderStyle: 'none',
            borderColor: 'rgb(255,255,255)',
            paddingX: 0,
            paddingY: 0,
            // fitBoxToContent is missing - should be added by migration
          },
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify(configMissingFitBox)
      );

      const result = await config.readConfigFile();

      expect(result.settings.userMessageDisplay).toEqual({
        format: ' > {} ',
        styling: [],
        foregroundColor: 'default',
        backgroundColor: null,
        borderStyle: 'none',
        borderColor: 'rgb(255,255,255)',
        paddingX: 0,
        paddingY: 0,
        fitBoxToContent: false,
      });
    });
  });
});
