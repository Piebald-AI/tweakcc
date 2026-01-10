import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import type { Stats } from 'node:fs';
import path from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WASMagic } from 'wasmagic';

import { ClaudeCodeInstallationInfo } from '../types';
import * as misc from '../utils';
import * as systemPromptHashIndex from '../systemPromptHashIndex';
import * as nativeInstallation from '../nativeInstallationLoader';
import { DEFAULT_SETTINGS } from '../defaultSettings';
import { CLIJS_SEARCH_PATHS } from '../installationPaths';
import { restoreClijsFromBackup } from '../installationBackup';
import { startupCheck } from '../startup';
import { findClaudeCodeInstallation } from '../installationDetection';
import {
  CONFIG_DIR,
  CONFIG_FILE,
  ensureConfigDir,
  readConfigFile,
  updateConfigFile,
  warnAboutMultipleConfigs,
} from '../config';

vi.mock('wasmagic');
vi.mock('node:fs/promises');
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));
vi.mock('../nativeInstallationLoader', () => ({
  extractClaudeJsFromNativeInstallation: vi.fn(),
  repackNativeInstallation: vi.fn(),
}));
vi.mock('node:fs');
vi.mock('which', () => ({
  default: vi.fn(),
}));

import whichMock from 'which';

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

import {
  createEnoent,
  createEnotdir,
  createEacces,
  createEperm,
  createSymlinkStats,
  createRegularStats,
} from './testHelpers';

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
    vi.mocked(whichMock).mockRejectedValue(new Error('not found'));

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

      warnAboutMultipleConfigs();

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

      warnAboutMultipleConfigs();

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('ensureConfigDir', () => {
    it('should create the config directory', async () => {
      const mkdirSpy = vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      await ensureConfigDir();
      expect(mkdirSpy).toHaveBeenCalledWith(CONFIG_DIR, {
        recursive: true,
      });
    });
  });

  describe('readConfigFile', () => {
    it('should return the default config if the file does not exist', async () => {
      vi.spyOn(fs, 'readFile').mockRejectedValue(createEnoent());
      const result = await readConfigFile();
      expect(result).toEqual({
        ccVersion: '',
        ccInstallationPath: null,
        lastModified: expect.any(String),
        changesApplied: true,
        settings: DEFAULT_SETTINGS,
      });
    });

    it('should return the parsed config if the file exists', async () => {
      const mockConfig = { ccVersion: '1.0.0' };
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockConfig));
      const result = await readConfigFile();
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
      await updateConfigFile(c => {
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

      await restoreClijsFromBackup(ccInstInfo);

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
        ccInstallationPath: null,
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

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      expect(result).toEqual({
        cliPath: mockCliPath,
        source: 'search-paths',
        version: '1.2.3',
      });
    });

    it('should treat PATH claude executable as cli.js when WASMagic detects JS', async () => {
      const mockConfig = {
        ccInstallationPath: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const mockExePath = '/usr/local/bin/claude';
      const mockCliContent =
        'some code VERSION:"3.4.5" more code VERSION:"3.4.5" and VERSION:"3.4.5"';

      // Make PATH lookup succeed.
      vi.mocked(whichMock).mockResolvedValue(mockExePath);

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

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      expect(result).toEqual({
        cliPath: mockExePath,
        source: 'path',
        version: '3.4.5',
      });
    });

    it('should treat PATH claude executable as native installation when WASMagic detects binary', async () => {
      const mockConfig = {
        ccInstallationPath: null,
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
      vi.mocked(whichMock).mockResolvedValue(mockExePath);

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
      ).mockResolvedValue(mockJsBuffer);

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      expect(result).toEqual({
        version: '4.5.6',
        source: 'path',
        nativeInstallationPath: mockExePath,
      });
    });

    it('should use ccInstallationPath over PATH when both are available', async () => {
      const mockCliPath = '/custom/explicit/cli.js';
      const mockPathExe = '/usr/local/bin/claude';
      const mockConfig = {
        ccInstallationPath: mockCliPath,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      // Make PATH lookup succeed (this should be ignored since ccInstallationPath is set)
      vi.mocked(whichMock).mockResolvedValue(mockPathExe);

      // Make both paths exist
      vi.spyOn(fs, 'stat').mockResolvedValue({} as Stats);
      // realpath should return the path it was given
      vi.spyOn(fs, 'realpath').mockImplementation(async p => p.toString());
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

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      // Should use the explicit ccInstallationPath, not the PATH executable
      expect(result).toEqual({
        cliPath: mockCliPath,
        source: 'config',
        version: '1.1.1', // Version from explicit path, not PATH
      });
    });

    it('should use ccInstallationPath as cli.js when WASMagic detects JS', async () => {
      const mockCliPath = '/custom/path/cli.js';
      const mockConfig = {
        ccInstallationPath: mockCliPath,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const mockCliContent =
        'some code VERSION:"7.8.9" more code VERSION:"7.8.9" and VERSION:"7.8.9"';

      vi.spyOn(fs, 'stat').mockResolvedValue({} as Stats);
      vi.spyOn(fs, 'realpath').mockImplementation(async p => p.toString());
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

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      expect(result).toEqual({
        cliPath: mockCliPath,
        source: 'config',
        version: '7.8.9',
      });
    });

    it('should use ccInstallationPath as native installation when WASMagic detects binary', async () => {
      const mockNativePath = '/custom/path/claude-native';
      const mockConfig = {
        ccInstallationPath: mockNativePath,
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
      vi.spyOn(fs, 'realpath').mockImplementation(async p => p.toString());
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
      ).mockResolvedValue(mockJsBuffer);

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      expect(result).toEqual({
        version: '9.8.7',
        source: 'config',
        nativeInstallationPath: mockNativePath,
      });
    });

    it('should use fallback detection for JavaScript when WASMagic fails (SIMD unsupported)', async () => {
      const mockConfig = {
        ccInstallationPath: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const mockExePath = '/usr/local/bin/claude';
      const mockCliContent =
        'some code VERSION:"5.5.5" more code VERSION:"5.5.5" and VERSION:"5.5.5"';

      // Simulate WASMagic initialization failure (SIMD unsupported)
      (
        WASMagic.create as unknown as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new Error('RuntimeError: Aborted(CompileError: Wasm SIMD unsupported)')
      );

      vi.mocked(whichMock).mockResolvedValue(mockExePath);

      vi.spyOn(fs, 'stat').mockImplementation(async p => {
        if (p === mockExePath) {
          return {} as Stats;
        }
        throw createEnoent();
      });
      lstatSpy.mockResolvedValue(createRegularStats());
      vi.spyOn(fs, 'realpath').mockResolvedValue(mockExePath);

      // Return JavaScript content (text, no binary magic bytes)
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          const contentBuffer = Buffer.from(mockCliContent);
          contentBuffer.copy(buffer);
          return { bytesRead: contentBuffer.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === mockExePath && encoding === 'utf8') {
          return mockCliContent;
        }
        throw createEnoent();
      });

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      expect(result).toEqual({
        cliPath: mockExePath,
        source: 'path',
        version: '5.5.5',
      });
    });

    it('should use fallback detection for ELF binary when WASMagic fails', async () => {
      const mockConfig = {
        ccInstallationPath: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const mockExePath = '/usr/local/bin/claude';
      const mockJsBuffer = Buffer.from(
        'some code VERSION:"6.6.6" more code VERSION:"6.6.6" and VERSION:"6.6.6"',
        'utf8'
      );

      // ELF magic bytes: 0x7F 'E' 'L' 'F'
      const elfBinary = Buffer.alloc(100);
      elfBinary[0] = 0x7f;
      elfBinary[1] = 0x45; // E
      elfBinary[2] = 0x4c; // L
      elfBinary[3] = 0x46; // F

      // Simulate WASMagic initialization failure
      (
        WASMagic.create as unknown as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new Error('RuntimeError: Aborted(CompileError: Wasm SIMD unsupported)')
      );

      vi.mocked(whichMock).mockResolvedValue(mockExePath);

      vi.spyOn(fs, 'stat').mockImplementation(async p => {
        if (p === mockExePath) {
          return {} as Stats;
        }
        throw createEnoent();
      });
      lstatSpy.mockResolvedValue(createRegularStats());
      vi.spyOn(fs, 'realpath').mockResolvedValue(mockExePath);

      // Return ELF binary content
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          elfBinary.copy(buffer);
          return { bytesRead: elfBinary.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      vi.spyOn(
        nativeInstallation,
        'extractClaudeJsFromNativeInstallation'
      ).mockResolvedValue(mockJsBuffer);

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      expect(result).toEqual({
        nativeInstallationPath: mockExePath,
        source: 'path',
        version: '6.6.6',
      });
    });

    it('should use fallback detection for Mach-O binary when WASMagic fails', async () => {
      const mockConfig = {
        ccInstallationPath: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const mockExePath = '/usr/local/bin/claude';
      const mockJsBuffer = Buffer.from(
        'some code VERSION:"7.7.7" more code VERSION:"7.7.7" and VERSION:"7.7.7"',
        'utf8'
      );

      // Mach-O 64-bit magic bytes (little-endian): CF FA ED FE
      const machoBuffer = Buffer.alloc(100);
      machoBuffer[0] = 0xcf;
      machoBuffer[1] = 0xfa;
      machoBuffer[2] = 0xed;
      machoBuffer[3] = 0xfe;

      // Simulate WASMagic initialization failure
      (
        WASMagic.create as unknown as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new Error('RuntimeError: Aborted(CompileError: Wasm SIMD unsupported)')
      );

      vi.mocked(whichMock).mockResolvedValue(mockExePath);

      vi.spyOn(fs, 'stat').mockImplementation(async p => {
        if (p === mockExePath) {
          return {} as Stats;
        }
        throw createEnoent();
      });
      lstatSpy.mockResolvedValue(createRegularStats());
      vi.spyOn(fs, 'realpath').mockResolvedValue(mockExePath);

      // Return Mach-O binary content
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          machoBuffer.copy(buffer);
          return { bytesRead: machoBuffer.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      vi.spyOn(
        nativeInstallation,
        'extractClaudeJsFromNativeInstallation'
      ).mockResolvedValue(mockJsBuffer);

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      expect(result).toEqual({
        nativeInstallationPath: mockExePath,
        source: 'path',
        version: '7.7.7',
      });
    });

    it('should return null if the installation is not found', async () => {
      const mockConfig = {
        ccInstallationPath: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      // Mock fs.stat to simulate that no cli.js files exist
      vi.spyOn(fs, 'stat').mockRejectedValue(createEnoent());
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'));

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      expect(result).toBe(null);
    });

    it('should gracefully skip paths with ENOTDIR errors', async () => {
      const mockConfig = {
        ccInstallationPath: null,
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

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      expect(result).toEqual({
        cliPath: mockSecondCliPath,
        source: 'search-paths',
        version: '1.2.3',
      });
    });

    it('should gracefully skip paths with EACCES permission errors', async () => {
      const mockConfig = {
        ccInstallationPath: null,
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

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      expect(result).toEqual({
        cliPath: mockSecondCliPath,
        source: 'search-paths',
        version: '1.2.3',
      });
    });

    it('should gracefully skip paths with EPERM permission errors', async () => {
      const mockConfig = {
        ccInstallationPath: null,
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

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      expect(result).toEqual({
        cliPath: mockSecondCliPath,
        source: 'search-paths',
        version: '1.2.3',
      });
    });

    it('should handle symlink resolution when which claude resolves to cli.js', async () => {
      const mockConfig = {
        ccInstallationPath: null,
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
      vi.mocked(whichMock).mockResolvedValue(mockSymlinkPath);

      lstatSpy.mockImplementation(async filePath => {
        if (filePath === mockSymlinkPath) {
          return createSymlinkStats();
        }
        throw createEnoent();
      });

      // Mock fs.realpath to resolve symlink
      vi.spyOn(fs, 'realpath').mockResolvedValue(mockResolvedPath);

      // Mock fs.open for WASMagic detection
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          const contentBuffer = Buffer.from('fake js content');
          contentBuffer.copy(buffer);
          return { bytesRead: contentBuffer.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      mockMagicInstance.detect.mockReturnValue('application/javascript');

      // Mock cli.js content
      const mockCliContent =
        'some code VERSION:"2.0.11" more code VERSION:"2.0.11" and VERSION:"2.0.11"';
      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === mockResolvedPath && encoding === 'utf8') {
          return mockCliContent;
        }
        throw createEnoent();
      });

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      expect(result).toEqual({
        cliPath: mockResolvedPath,
        source: 'path',
        version: '2.0.11',
      });
    });

    it('should detect cli.js path from symlink and treat as NPM installation', async () => {
      const mockConfig = {
        ccInstallationPath: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const resolvedCliPath =
        '/usr/local/share/nvm/versions/node/v23.11.1/lib/node_modules/@anthropic-ai/claude-code/cli.js';

      // All standard paths fail
      vi.spyOn(fs, 'stat').mockImplementation(async filePath => {
        const fileStr = filePath.toString();
        if (fileStr.includes('node_modules') && fileStr.endsWith('cli.js')) {
          if (fileStr === resolvedCliPath) {
            return {} as Stats;
          }
        }
        throw createEnoent();
      });

      // Mock which command
      vi.mocked(whichMock).mockResolvedValue(
        '/usr/local/share/nvm/versions/node/v23.11.1/bin/claude'
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
      vi.spyOn(fs, 'realpath').mockResolvedValue(resolvedCliPath);

      // Mock fs.open for WASMagic detection
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          const contentBuffer = Buffer.from('fake js content');
          contentBuffer.copy(buffer);
          return { bytesRead: contentBuffer.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      mockMagicInstance.detect.mockReturnValue('application/javascript');

      // Mock VERSION content in cli.js
      const mockCliContent =
        'VERSION:"2.0.11" VERSION:"2.0.11" VERSION:"2.0.11"';
      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === resolvedCliPath && encoding === 'utf8') {
          return mockCliContent;
        }
        throw createEnoent();
      });

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      // Should detect it as NPM install with cliPath set
      expect(result).not.toBe(null);
      expect(result!.cliPath).toBe(resolvedCliPath);
      expect(result!.version).toBe('2.0.11');
      expect(result!.nativeInstallationPath).toBeUndefined();
    });

    it('should handle symlink to binary inside claude-code package as native installation', async () => {
      const mockConfig = {
        ccInstallationPath: null,
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

      const mockJsBuffer = Buffer.from(
        'VERSION:"2.0.12" more text VERSION:"2.0.12" even more VERSION:"2.0.12"',
        'utf8'
      );

      vi.spyOn(fs, 'stat').mockImplementation(async filePath => {
        if (filePath === resolvedBinaryPath || filePath === symlinkPath) {
          return {} as Stats;
        }
        throw createEnoent();
      });

      vi.mocked(whichMock).mockResolvedValue(symlinkPath);
      lstatSpy.mockImplementation(async filePath => {
        if (filePath === symlinkPath) {
          return createSymlinkStats();
        }
        throw createEnoent();
      });
      vi.spyOn(fs, 'realpath').mockResolvedValue(resolvedBinaryPath);

      // Mock fs.open for WASMagic detection - return binary content
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
      ).mockResolvedValue(mockJsBuffer);

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      expect(result).not.toBe(null);
      expect(result!.nativeInstallationPath).toBe(resolvedBinaryPath);
      expect(result!.version).toBe('2.0.12');
    });

    it('should fall back to hardcoded paths when PATH claude cannot be detected (e.g., .cmd shim)', async () => {
      const mockConfig = {
        ccInstallationPath: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const mockCmdPath =
        'C:\\Users\\test\\AppData\\Local\\Volta\\tools\\image\\node\\22.19.0\\claude.CMD';
      const mockCliPath = path.join(CLIJS_SEARCH_PATHS[0], 'cli.js');
      const mockCliContent =
        'some code VERSION:"1.2.3" more code VERSION:"1.2.3" and VERSION:"1.2.3"';

      // Make PATH lookup succeed with a .cmd file
      vi.mocked(whichMock).mockResolvedValue(mockCmdPath);

      // Mock realpath to return the .cmd file itself (not a symlink)
      vi.spyOn(fs, 'realpath').mockImplementation(async p => p.toString());

      // Mock fs.open for WASMagic detection - return batch script content
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          // Batch script content - starts with @echo off or similar
          const contentBuffer = Buffer.from(
            '@echo off\r\nnode "%~dp0\\..\\cli.js" %*'
          );
          contentBuffer.copy(buffer);
          return { bytesRead: contentBuffer.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      // WASMagic reports text/plain for .cmd files (not JavaScript, not binary)
      mockMagicInstance.detect.mockReturnValue('text/plain');

      // Mock fs.stat - .cmd exists, and cli.js in search paths exists
      vi.spyOn(fs, 'stat').mockImplementation(async p => {
        if (p === mockCmdPath || p === mockCliPath) {
          return {} as Stats;
        }
        throw createEnoent();
      });

      vi.spyOn(fs, 'readFile').mockImplementation(async (p, encoding) => {
        if (p === mockCliPath && encoding === 'utf8') {
          return mockCliContent;
        }
        throw new Error('File not found');
      });

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      // Should fall back to hardcoded search paths, NOT throw an error
      expect(result).toEqual({
        cliPath: mockCliPath,
        source: 'search-paths',
        version: '1.2.3',
      });
    });

    it('should return null when PATH claude cannot be detected and no hardcoded paths exist', async () => {
      const mockConfig = {
        ccInstallationPath: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const mockCmdPath =
        'C:\\Users\\test\\AppData\\Local\\Volta\\tools\\image\\node\\22.19.0\\claude.CMD';

      // Make PATH lookup succeed with a .cmd file
      vi.mocked(whichMock).mockResolvedValue(mockCmdPath);

      // Mock realpath to return the .cmd file itself
      vi.spyOn(fs, 'realpath').mockImplementation(async p => p.toString());

      // Mock fs.open for WASMagic detection
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          const contentBuffer = Buffer.from(
            '@echo off\r\nnode "%~dp0\\..\\cli.js" %*'
          );
          contentBuffer.copy(buffer);
          return { bytesRead: contentBuffer.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      // WASMagic reports text/plain for .cmd files
      mockMagicInstance.detect.mockReturnValue('text/plain');

      // No files exist (neither .cmd resolves nor hardcoded paths)
      vi.spyOn(fs, 'stat').mockRejectedValue(createEnoent());
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'));

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      // Should return null (no installation found), NOT throw
      expect(result).toBe(null);
    });

    it('should use which package on Windows platforms', async () => {
      const mockConfig = {
        ccInstallationPath: null,
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
        const result = await findClaudeCodeInstallation(mockConfig, {
          interactive: true,
        });

        // which package should be called even on Windows
        expect(whichMock).toHaveBeenCalled();
        expect(result).toBe(null);
      } finally {
        platformSpy.mockRestore();
      }
    });

    it('should throw error when native installation extraction fails', async () => {
      const mockConfig = {
        ccInstallationPath: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      // All standard paths fail
      vi.spyOn(fs, 'stat').mockImplementation(async filePath => {
        if (filePath === '/usr/local/bin/claude') {
          return {} as Stats;
        }
        throw createEnoent();
      });

      // Mock which command
      vi.mocked(whichMock).mockResolvedValue('/usr/local/bin/claude');

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
      ).mockResolvedValue(null);

      vi.spyOn(fs, 'readFile').mockRejectedValue(createEnoent());

      // Should throw error since native extraction failed
      await expect(
        findClaudeCodeInstallation(mockConfig, { interactive: true })
      ).rejects.toThrow('Could not extract JS from native binary');
    });

    // HIGH PRIORITY: Test ccInstallationPath override
    it('should prioritize ccInstallationPath when specified in config', async () => {
      const customCliPath = '/custom/claude/installation/cli.js';
      const mockConfig = {
        ccInstallationPath: customCliPath,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const mockCliContent = 'VERSION:"3.1.1" VERSION:"3.0.0" VERSION:"3.0.0"';

      // Mock fs.stat to make custom path exist
      vi.spyOn(fs, 'stat').mockImplementation(async p => {
        if (p === customCliPath) {
          return {} as Stats;
        }
        throw createEnoent();
      });

      // Mock fs.realpath
      vi.spyOn(fs, 'realpath').mockImplementation(async p => p.toString());

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

      const result = await findClaudeCodeInstallation(mockConfig, {
        interactive: true,
      });

      expect(result).not.toBe(null);
      expect(result!.cliPath).toBe(customCliPath);
      expect(result!.version).toBe('3.0.0');
    });

    it('should throw error when ccInstallationPath is set but does not exist', async () => {
      const customCliPath = '/custom/claude/installation/cli.js';
      const mockConfig = {
        ccInstallationPath: customCliPath,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      // Mock fs.stat to fail custom path
      vi.spyOn(fs, 'stat').mockImplementation(async p => {
        if (p === customCliPath) {
          throw createEnoent(); // Custom path doesn't exist
        }
        throw createEnoent();
      });

      // Should throw error since ccInstallationPath doesn't exist
      await expect(
        findClaudeCodeInstallation(mockConfig, { interactive: true })
      ).rejects.toThrow(
        "ccInstallationPath is set to '/custom/claude/installation/cli.js' but file does not exist"
      );
    });

    // Note: Native installation success tests are difficult to mock properly due to ESM module import hoisting.
    // The actual native installation logic is tested implicitly through integration tests.
    // We test the failure cases below which provide good coverage of the error handling paths.

    it('should throw error if native extraction fails to find version', async () => {
      const mockConfig = {
        ccInstallationPath: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const nativeBinaryPath = '/usr/local/bin/claude';

      // All NPM search paths fail
      vi.spyOn(fs, 'stat').mockImplementation(async filePath => {
        if (filePath === nativeBinaryPath) {
          return {} as Stats;
        }
        throw createEnoent();
      });

      // Mock which command
      vi.mocked(whichMock).mockResolvedValue(nativeBinaryPath);
      lstatSpy.mockImplementation(async filePath => {
        if (filePath === nativeBinaryPath) {
          return createRegularStats();
        }
        throw createEnoent();
      });
      vi.spyOn(fs, 'realpath').mockResolvedValue(nativeBinaryPath);

      // Mock fs.open for WASMagic detection
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          const contentBuffer = Buffer.from('fake binary content');
          contentBuffer.copy(buffer);
          return { bytesRead: contentBuffer.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      mockMagicInstance.detect.mockReturnValue('application/octet-stream');

      // Mock extractClaudeJsFromNativeInstallation to return content without VERSION
      vi.mocked(
        nativeInstallation.extractClaudeJsFromNativeInstallation
      ).mockResolvedValue(Buffer.from('no version here'));

      // Should throw error since no VERSION found
      await expect(
        findClaudeCodeInstallation(mockConfig, { interactive: true })
      ).rejects.toThrow('No VERSION strings found');
    });

    it('should throw error if native extraction returns null', async () => {
      const mockConfig = {
        ccInstallationPath: null,
        changesApplied: false,
        ccVersion: '',
        lastModified: '',
        settings: DEFAULT_SETTINGS,
      };

      const nativeBinaryPath = '/usr/local/bin/claude';

      // All NPM search paths fail
      vi.spyOn(fs, 'stat').mockImplementation(async filePath => {
        if (filePath === nativeBinaryPath) {
          return {} as Stats;
        }
        throw createEnoent();
      });

      // Mock which command
      vi.mocked(whichMock).mockResolvedValue(nativeBinaryPath);
      lstatSpy.mockImplementation(async filePath => {
        if (filePath === nativeBinaryPath) {
          return createRegularStats();
        }
        throw createEnoent();
      });
      vi.spyOn(fs, 'realpath').mockResolvedValue(nativeBinaryPath);

      // Mock fs.open for WASMagic detection
      vi.spyOn(fs, 'open').mockResolvedValue({
        read: async ({ buffer }: { buffer: Buffer }) => {
          const contentBuffer = Buffer.from('fake binary content');
          contentBuffer.copy(buffer);
          return { bytesRead: contentBuffer.length, buffer };
        },
        close: async () => {},
      } as unknown as fs.FileHandle);

      mockMagicInstance.detect.mockReturnValue('application/octet-stream');

      // Mock extractClaudeJsFromNativeInstallation to return null (extraction failed)
      vi.mocked(
        nativeInstallation.extractClaudeJsFromNativeInstallation
      ).mockResolvedValue(null);

      // Should throw error since extraction failed
      await expect(
        findClaudeCodeInstallation(mockConfig, { interactive: true })
      ).rejects.toThrow('Could not extract JS from native binary');
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

      await startupCheck({ interactive: true });

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

      const result = await startupCheck({ interactive: true });

      expect(unlinkSpy).toHaveBeenCalled();
      expect(copyFileSpy).toHaveBeenCalled();
      expect(result).not.toBe(null);
      expect(result!.startupCheckInfo?.wasUpdated).toBe(true);
    });
  });
});
