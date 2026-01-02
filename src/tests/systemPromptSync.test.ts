import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as promptSync from '../systemPromptSync';
import type { StringsPrompt, StringsFile } from '../systemPromptSync';

vi.mock('node:fs/promises');
vi.mock('../systemPromptDownload');

const createEnoent = () => {
  const error: NodeJS.ErrnoException = new Error(
    'ENOENT: no such file or directory'
  );
  error.code = 'ENOENT';
  return error;
};

describe('promptSync.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseMarkdownPrompt', () => {
    it('should parse markdown with frontmatter', () => {
      const markdown = `<!--
name: Test Prompt
description: A test prompt
ccVersion: 1.0.0
variables:
  - SETTINGS
  - CONFIG
-->

This is the content with \${SETTINGS.preferredName} and \${CONFIG.taskType}.`;

      const result = promptSync.parseMarkdownPrompt(markdown);

      expect(result).toEqual({
        name: 'Test Prompt',
        description: 'A test prompt',
        ccVersion: '1.0.0',
        variables: ['SETTINGS', 'CONFIG'],
        content:
          'This is the content with ${SETTINGS.preferredName} and ${CONFIG.taskType}.',
        // Line offset as computed from original markdown
        contentLineOffset: 8,
      });
    });

    it('should handle markdown without variables', () => {
      const markdown = `<!--
name: Simple Prompt
description: No variables
ccVersion: 1.0.0
-->

Simple content.`;

      const result = promptSync.parseMarkdownPrompt(markdown);

      expect(result).toEqual({
        name: 'Simple Prompt',
        description: 'No variables',
        ccVersion: '1.0.0',
        variables: [],
        content: 'Simple content.',
        // Line offset as computed from original markdown
        contentLineOffset: 5,
      });
    });

    it('should handle missing frontmatter fields', () => {
      const markdown = `<!--
-->

Content only.`;

      const result = promptSync.parseMarkdownPrompt(markdown);

      expect(result).toEqual({
        name: '',
        description: '',
        ccVersion: '',
        variables: [],
        content: 'Content only.',
        // Line offset as computed from original markdown
        contentLineOffset: 2,
      });
    });
  });

  describe('reconstructContentFromPieces', () => {
    it('should reconstruct content with placeholders for minified variables', () => {
      const pieces = [
        'You will greet the user as ${',
        '.preferredName}, running on ${',
        '.platform}!',
      ];
      const identifiers = [1, 2];
      const identifierMap = { '1': 'SETTINGS', '2': 'CONFIG' };

      const result = promptSync.reconstructContentFromPieces(
        pieces,
        identifiers,
        identifierMap
      );

      expect(result).toBe(
        'You will greet the user as ${SETTINGS.preferredName}, running on ${CONFIG.platform}!'
      );
    });

    it('should handle empty identifier map', () => {
      const pieces = ['Just text'];
      const identifiers: number[] = [];
      const identifierMap = {};

      const result = promptSync.reconstructContentFromPieces(
        pieces,
        identifiers,
        identifierMap
      );

      expect(result).toBe('Just text');
    });

    it('should handle missing identifier mappings', () => {
      const pieces = ['Start ', ' end'];
      const identifiers = [999];
      const identifierMap = {};

      const result = promptSync.reconstructContentFromPieces(
        pieces,
        identifiers,
        identifierMap
      );

      expect(result).toBe('Start UNKNOWN_999 end');
    });

    it('should handle numeric and string identifiers', () => {
      const pieces = ['Use ${', '.currentMode} and ${', '.theme} together'];
      const identifiers = [1, '2'];
      const identifierMap = { '1': 'STATE', '2': 'CONFIG' };

      const result = promptSync.reconstructContentFromPieces(
        pieces,
        identifiers,
        identifierMap
      );

      expect(result).toBe(
        'Use ${STATE.currentMode} and ${CONFIG.theme} together'
      );
    });
  });

  describe('generateMarkdownFromPrompt', () => {
    it('should generate markdown with variables', () => {
      const prompt: StringsPrompt = {
        id: 'test-id',
        name: 'Test Prompt',
        description: 'Test description',
        version: '1.0.0',
        pieces: ['You will greet the user as ${', '.preferredName}!'],
        identifiers: [1],
        identifierMap: { '1': 'SETTINGS' },
      };

      const result = promptSync.generateMarkdownFromPrompt(prompt);

      expect(result).toContain('name: Test Prompt');
      expect(result).toContain('description: Test description');
      expect(result).toContain('ccVersion: 1.0.0');
      expect(result).toContain('variables:');
      expect(result).toContain('- SETTINGS');
      expect(result).toContain(
        'You will greet the user as ${SETTINGS.preferredName}!'
      );
    });

    it('should generate markdown without variables when identifierMap is empty', () => {
      const prompt: StringsPrompt = {
        id: 'test-id',
        name: 'Simple Prompt',
        description: 'No vars',
        version: '1.0.0',
        pieces: ['Plain text'],
        identifiers: [],
        identifierMap: {},
      };

      const result = promptSync.generateMarkdownFromPrompt(prompt);

      expect(result).toContain('name: Simple Prompt');
      expect(result).not.toContain('variables:');
      expect(result).toContain('Plain text');
    });

    it('should use custom content when provided', () => {
      const prompt: StringsPrompt = {
        id: 'test-id',
        name: 'Test',
        description: 'Test',
        version: '1.0.0',
        pieces: ['Original'],
        identifiers: [],
        identifierMap: {},
      };

      const result = promptSync.generateMarkdownFromPrompt(
        prompt,
        'Custom content here'
      );

      expect(result).toContain('Custom content here');
      expect(result).not.toContain('Original');
    });

    it('should deduplicate variables in frontmatter', () => {
      const prompt: StringsPrompt = {
        id: 'test-id',
        name: 'Test',
        description: 'Test',
        version: '1.0.0',
        pieces: [
          'The user name is ${',
          '.userName} and again ${',
          '.userName}.',
        ],
        identifiers: [1, 1], // Same identifier used twice
        identifierMap: { '1': 'SETTINGS' },
      };

      const result = promptSync.generateMarkdownFromPrompt(prompt);

      // Count occurrences of "- SETTINGS"
      const matches = result.match(/^ {2}- SETTINGS$/gm);
      expect(matches?.length).toBe(1); // Should only appear once in variables list
    });
  });

  describe('buildRegexFromPieces', () => {
    it('should build regex that captures content between pieces', () => {
      const pieces = ['Hello ', ', welcome to ', '!'];
      const regex = promptSync.buildRegexFromPieces(pieces);

      const testString = 'Hello John, welcome to Earth!';
      const match = testString.match(regex);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('John');
      expect(match![2]).toBe('Earth');
    });

    it('should escape special regex characters in pieces', () => {
      const pieces = ['(Start) ', ' [End]'];
      const regex = promptSync.buildRegexFromPieces(pieces);

      const testString = '(Start) content [End]';
      const match = testString.match(regex);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('content');
    });

    it('should handle single piece (no placeholders)', () => {
      const pieces = ['Just text'];
      const regex = promptSync.buildRegexFromPieces(pieces);

      const testString = 'Just text';
      const match = testString.match(regex);

      expect(match).not.toBeNull();
      expect(match!.length).toBe(1); // Only full match, no captures
    });
  });

  describe('extractUserCustomizations', () => {
    it('should extract what user put in place of minified identifiers', () => {
      const pieces = [
        'You will greet as ${',
        '.preferredName}, on platform ${',
        '.platform}!',
      ];
      const userContent =
        'You will greet as ${SETTINGS.preferredName}, on platform ${CONFIG.platform}!';

      const result = promptSync.extractUserCustomizations(userContent, pieces);

      expect(result).toEqual(['SETTINGS', 'CONFIG']);
    });

    it('should handle multiline content with identifiers', () => {
      const pieces = ['Start\n${', '.value1}\nMiddle\n${', '.value2}\nEnd'];
      const userContent =
        'Start\n${CONFIG.value1}\nMiddle\n${STATE.value2}\nEnd';

      const result = promptSync.extractUserCustomizations(userContent, pieces);

      expect(result).toEqual(['CONFIG', 'STATE']);
    });

    it('should throw error if content does not match structure', () => {
      const pieces = ['Hello ', '!'];
      const userContent = 'Goodbye world!';

      expect(() => {
        promptSync.extractUserCustomizations(userContent, pieces);
      }).toThrow('User content does not match expected structure from pieces');
    });
  });

  describe('buildHumanToRealMapping', () => {
    it('should build mapping from human-readable identifiers to what user wrote', () => {
      const identifiers = [1, 2];
      const identifierMap = { '1': 'SETTINGS', '2': 'CONFIG' };
      const extractedCustomizations = ['SETTINGS', 'CONFIG'];

      const result = promptSync.buildHumanToRealMapping(
        identifiers,
        identifierMap,
        extractedCustomizations
      );

      expect(result).toEqual({
        SETTINGS: 'SETTINGS',
        CONFIG: 'CONFIG',
      });
    });

    it('should handle duplicate identifiers with same values', () => {
      const identifiers = [1, 2, 1];
      const identifierMap = { '1': 'SETTINGS', '2': 'CONFIG' };
      const extractedCustomizations = ['SETTINGS', 'CONFIG', 'SETTINGS'];

      const result = promptSync.buildHumanToRealMapping(
        identifiers,
        identifierMap,
        extractedCustomizations
      );

      expect(result).toEqual({
        SETTINGS: 'SETTINGS',
        CONFIG: 'CONFIG',
      });
    });

    it('should throw error for duplicate identifiers with different values', () => {
      const identifiers = [1, 1];
      const identifierMap = { '1': 'SETTINGS' };
      const extractedCustomizations = ['SETTINGS', 'CUSTOM'];

      expect(() => {
        promptSync.buildHumanToRealMapping(
          identifiers,
          identifierMap,
          extractedCustomizations
        );
      }).toThrow('Conflicting mappings for "SETTINGS": "SETTINGS" vs "CUSTOM"');
    });

    it('should skip identifiers without mappings', () => {
      const identifiers = [1, 999, 2];
      const identifierMap = { '1': 'SETTINGS', '2': 'CONFIG' };
      const extractedCustomizations = ['SETTINGS', 'UNKNOWN', 'CONFIG'];

      const result = promptSync.buildHumanToRealMapping(
        identifiers,
        identifierMap,
        extractedCustomizations
      );

      expect(result).toEqual({
        SETTINGS: 'SETTINGS',
        CONFIG: 'CONFIG',
      });
    });
  });

  describe('applyCustomizationsToPrompt', () => {
    it('should apply user customizations to new prompt version', () => {
      const newPrompt: StringsPrompt = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        version: '2.0.0',
        pieces: ['Greet user as ${', '.userName}, running on ${', '.osType}!'],
        identifiers: [1, 2],
        identifierMap: { '1': 'SETTINGS', '2': 'CONFIG' },
      };
      const humanToRealMapping = {
        SETTINGS: 'SETTINGS',
        CONFIG: 'CONFIG',
      };

      const result = promptSync.applyCustomizationsToPrompt(
        newPrompt,
        humanToRealMapping
      );

      expect(result).toBe(
        'Greet user as ${SETTINGS.userName}, running on ${CONFIG.osType}!'
      );
    });

    it('should use placeholder for new variables not in old version', () => {
      const newPrompt: StringsPrompt = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        version: '2.0.0',
        pieces: ['User ${', '.userName}, new field: ${', '.newFeature}!'],
        identifiers: [1, 3],
        identifierMap: { '1': 'SETTINGS', '3': 'NEW_IDENTIFIER' },
      };
      const humanToRealMapping = {
        SETTINGS: 'SETTINGS',
        // NEW_IDENTIFIER not in mapping (new in this version)
      };

      const result = promptSync.applyCustomizationsToPrompt(
        newPrompt,
        humanToRealMapping
      );

      expect(result).toBe(
        'User ${SETTINGS.userName}, new field: ${${NEW_IDENTIFIER}.newFeature}!'
      );
    });
  });

  describe('compareVersions', () => {
    it('should return -1 when v1 < v2', () => {
      expect(promptSync.compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(promptSync.compareVersions('1.2.3', '1.2.4')).toBe(-1);
      expect(promptSync.compareVersions('1.9.0', '1.10.0')).toBe(-1);
    });

    it('should return 0 when versions are equal', () => {
      expect(promptSync.compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(promptSync.compareVersions('2.5.7', '2.5.7')).toBe(0);
    });

    it('should return 1 when v1 > v2', () => {
      expect(promptSync.compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(promptSync.compareVersions('1.2.4', '1.2.3')).toBe(1);
      expect(promptSync.compareVersions('1.10.0', '1.9.0')).toBe(1);
    });

    it('should handle versions with different lengths', () => {
      expect(promptSync.compareVersions('1.0', '1.0.0')).toBe(0);
      expect(promptSync.compareVersions('1.0.1', '1.0')).toBe(1);
      expect(promptSync.compareVersions('1.0', '1.0.1')).toBe(-1);
    });
  });

  describe('getPromptFilePath', () => {
    it('should return correct file path for prompt', () => {
      const result = promptSync.getPromptFilePath('test-prompt');
      expect(result).toContain('test-prompt.md');
      expect(result).toContain('system-prompts');
    });
  });

  describe('promptFileExists', () => {
    it('should return true if file exists', async () => {
      vi.spyOn(fs, 'access').mockResolvedValue(undefined);

      const result = await promptSync.promptFileExists('test-prompt');

      expect(result).toBe(true);
    });

    it('should return false if file does not exist', async () => {
      vi.spyOn(fs, 'access').mockRejectedValue(createEnoent());

      const result = await promptSync.promptFileExists('test-prompt');

      expect(result).toBe(false);
    });
  });

  describe('readPromptFile', () => {
    it('should read and parse prompt file', async () => {
      const mockContent = `<!--
name: Test Prompt
description: Test
ccVersion: 1.0.0
-->

Content here`;

      vi.spyOn(fs, 'readFile').mockResolvedValue(mockContent);

      const result = await promptSync.readPromptFile('test-prompt');

      expect(result).toEqual({
        name: 'Test Prompt',
        description: 'Test',
        ccVersion: '1.0.0',
        variables: [],
        content: 'Content here',
        contentLineOffset: 5,
      });
    });
  });

  describe('writePromptFile', () => {
    it('should write prompt file', async () => {
      const writeFileSpy = vi
        .spyOn(fs, 'writeFile')
        .mockResolvedValue(undefined);

      await promptSync.writePromptFile('test-prompt', 'content');

      expect(writeFileSpy).toHaveBeenCalled();
      const [filePath, content] = writeFileSpy.mock.calls[0];
      expect(filePath).toContain('test-prompt.md');
      expect(content).toBe('content');
    });
  });

  describe('updateVariables', () => {
    it('should update variables in frontmatter', async () => {
      const mockContent = `<!--
name: Test
description: Test
ccVersion: 1.0.0
variables:
  - OLD_VAR
-->

Content`;

      vi.spyOn(fs, 'readFile').mockResolvedValue(mockContent);
      const writeFileSpy = vi
        .spyOn(fs, 'writeFile')
        .mockResolvedValue(undefined);

      const newIdentifierMap = { '1': 'SETTINGS', '2': 'CONFIG' };
      await promptSync.updateVariables('test-prompt', newIdentifierMap);

      expect(writeFileSpy).toHaveBeenCalled();
      const writtenContent = writeFileSpy.mock.calls[0][1] as string;
      expect(writtenContent).toContain('SETTINGS');
      expect(writtenContent).toContain('CONFIG');
      expect(writtenContent).not.toContain('OLD_VAR');
    });

    it('should remove variables field when identifierMap is empty', async () => {
      const mockContent = `<!--
name: Test
description: Test
ccVersion: 1.0.0
variables:
  - OLD_VAR
-->

Content`;

      vi.spyOn(fs, 'readFile').mockResolvedValue(mockContent);
      const writeFileSpy = vi
        .spyOn(fs, 'writeFile')
        .mockResolvedValue(undefined);

      await promptSync.updateVariables('test-prompt', {});

      expect(writeFileSpy).toHaveBeenCalled();
      const writtenContent = writeFileSpy.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('variables:');
      expect(writtenContent).not.toContain('OLD_VAR');
    });
  });

  describe('generateDiffHtml', () => {
    it('should generate HTML diff file with two side-by-side diffs', async () => {
      const writeFileSpy = vi
        .spyOn(fs, 'writeFile')
        .mockResolvedValue(undefined);

      const htmlPath = await promptSync.generateDiffHtml(
        'test-prompt',
        'Test Prompt',
        'Old baseline\nLine 2',
        'User customization\nLine 2',
        'New baseline\nLine 2',
        '1.0.0',
        '2.0.0',
        '/path/to/test-prompt.md'
      );

      expect(writeFileSpy).toHaveBeenCalled();
      expect(htmlPath).toContain('test-prompt.diff.html');

      const htmlContent = writeFileSpy.mock.calls[0][1] as string;
      expect(htmlContent).toContain('<!DOCTYPE html>');
      expect(htmlContent).toContain('test-prompt');
      expect(htmlContent).toContain('1.0.0');
      expect(htmlContent).toContain('2.0.0');
      expect(htmlContent).toContain('Your Customizations');
      expect(htmlContent).toContain('Upstream Changes');
    });

    it('should escape HTML in content', async () => {
      vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      await promptSync.generateDiffHtml(
        'test',
        'Test',
        '<script>alert("xss")</script>',
        '<script>alert("xss")</script>',
        'Safe & sound',
        '1.0.0',
        '2.0.0',
        '/path/to/test.md'
      );

      const htmlContent = (
        fs.writeFile as typeof fs.writeFile & {
          mock: { calls: [string, string][] };
        }
      ).mock.calls[0][1] as string;
      expect(htmlContent).not.toContain('<script>');
      expect(htmlContent).toContain('&lt;script&gt;');
      expect(htmlContent).toContain('&amp;');
    });
  });

  describe('syncPrompt', () => {
    const mockPrompt: StringsPrompt = {
      id: 'test-id',
      name: 'test-prompt',
      description: 'Test prompt',
      version: '2.0.0',
      pieces: ['Greet user as ${', '.preferredName}!'],
      identifiers: [1],
      identifierMap: { '1': 'SETTINGS' },
    };

    it('should create new file if it does not exist', async () => {
      vi.spyOn(fs, 'access').mockRejectedValue(createEnoent());
      const writeFileSpy = vi
        .spyOn(fs, 'writeFile')
        .mockResolvedValue(undefined);

      const result = await promptSync.syncPrompt(mockPrompt);

      expect(result.action).toBe('created');
      expect(result.newVersion).toBe('2.0.0');
      expect(writeFileSpy).toHaveBeenCalled();
    });

    it('should skip if versions match', async () => {
      const mockContent = `<!--
name: test-prompt
description: Test prompt
ccVersion: 2.0.0
-->

Greet user as \${SETTINGS.preferredName}!`;

      vi.spyOn(fs, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'readFile').mockResolvedValue(mockContent);
      vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      const result = await promptSync.syncPrompt(mockPrompt);

      expect(result.action).toBe('skipped');
      expect(result.oldVersion).toBe('2.0.0');
      expect(result.newVersion).toBe('2.0.0');
    });

    it('should warn about version mismatch when user version is older', async () => {
      const mockContent = `<!--
name: test-prompt
description: Test prompt
ccVersion: 1.0.0
-->

Greet user as \${SETTINGS.preferredName}!`;

      // Mock the old strings file for downloading old version
      const mockOldStringsFile = {
        version: '1.0.0',
        prompts: [
          {
            id: 'test-prompt',
            name: 'test-prompt',
            description: 'Test prompt',
            pieces: ['Greet user as ', '!'],
            identifiers: [1],
            identifierMap: { '1': 'SETTINGS.preferredName' },
            version: '1.0.0',
          },
        ],
      };

      const { downloadStringsFile } = await import(
        '../systemPromptDownload.js'
      );
      const hashIndexModule = await import('../systemPromptHashIndex.js');

      vi.mocked(downloadStringsFile).mockResolvedValue(
        mockOldStringsFile as StringsFile
      );
      vi.spyOn(hashIndexModule, 'getPromptHash').mockResolvedValue(
        'different-hash'
      ); // Simulate user modification

      vi.spyOn(fs, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'readFile').mockResolvedValue(mockContent);
      vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      const result = await promptSync.syncPrompt(mockPrompt);

      expect(result.action).toBe('conflict');
      expect(result.oldVersion).toBe('1.0.0');
      expect(result.newVersion).toBe('2.0.0');
      expect(result.diffHtmlPath).toBeDefined();
    });

    it('should always update variables list', async () => {
      const mockContent = `<!--
name: test-prompt
description: Test prompt
ccVersion: 2.0.0
variables:
  - OLD_VAR
-->

Greet user as \${SETTINGS.preferredName}!`;

      vi.spyOn(fs, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'readFile').mockResolvedValue(mockContent);
      const writeFileSpy = vi
        .spyOn(fs, 'writeFile')
        .mockResolvedValue(undefined);

      await promptSync.syncPrompt(mockPrompt);

      // Should have called writeFile for updating variables
      expect(writeFileSpy).toHaveBeenCalled();
    });
  });

  describe('syncSystemPrompts', () => {
    it('should sync all prompts from strings file', async () => {
      const mockStringsFile: StringsFile = {
        version: '2.0.0',
        prompts: [
          {
            id: 'prompt1',
            name: 'Prompt 1',
            description: 'First prompt',
            version: '2.0.0',
            pieces: ['Content 1'],
            identifiers: [],
            identifierMap: {},
          },
          {
            id: 'prompt2',
            name: 'Prompt 2',
            description: 'Second prompt',
            version: '2.0.0',
            pieces: ['Content 2'],
            identifiers: [],
            identifierMap: {},
          },
        ],
      };

      const { downloadStringsFile } = await import(
        '../systemPromptDownload.js'
      );
      const hashIndexModule = await import('../systemPromptHashIndex.js');

      vi.mocked(downloadStringsFile).mockResolvedValue(
        mockStringsFile as StringsFile
      );
      vi.spyOn(hashIndexModule, 'storeHashes').mockResolvedValue(0);

      vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      vi.spyOn(fs, 'access').mockRejectedValue(createEnoent());
      vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      const result = await promptSync.syncSystemPrompts('2.0.0');

      expect(result.ccVersion).toBe('2.0.0');
      expect(result.results).toHaveLength(2);
      expect(result.results[0].action).toBe('created');
      expect(result.results[1].action).toBe('created');
    });

    it('should throw error for failed prompt syncs', async () => {
      const mockStringsFile: StringsFile = {
        version: '2.0.0',
        prompts: [
          {
            id: 'prompt1',
            name: 'Prompt 1',
            description: 'First prompt',
            version: '2.0.0',
            pieces: ['Content'],
            identifiers: [],
            identifierMap: {},
          },
        ],
      };

      const { downloadStringsFile } = await import(
        '../systemPromptDownload.js'
      );
      vi.mocked(downloadStringsFile).mockResolvedValue(
        mockStringsFile as StringsFile
      );

      vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      // Make the file exist (so it tries to read it)
      vi.spyOn(fs, 'access').mockResolvedValue(undefined);
      // But make reading fail with permission error
      vi.spyOn(fs, 'readFile').mockRejectedValue(
        new Error('Permission denied')
      );

      await expect(promptSync.syncSystemPrompts('2.0.0')).rejects.toThrow(
        'Permission denied'
      );
    });

    it('should throw error if download fails', async () => {
      const { downloadStringsFile } = await import(
        '../systemPromptDownload.js'
      );
      vi.mocked(downloadStringsFile).mockRejectedValue(
        new Error('Download failed')
      );

      await expect(promptSync.syncSystemPrompts('2.0.0')).rejects.toThrow(
        'Download failed'
      );
    });
  });

  describe('displaySyncResults', () => {
    it('should display sync results without errors', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const summary = {
        ccVersion: '2.0.0',
        results: [
          {
            id: 'prompt1',
            name: 'Prompt 1',
            description: 'Test prompt 1',
            action: 'created' as const,
            newVersion: '2.0.0',
          },
          {
            id: 'prompt2',
            name: 'Prompt 2',
            description: 'Test prompt 2',
            action: 'skipped' as const,
            oldVersion: '2.0.0',
            newVersion: '2.0.0',
          },
        ],
      };

      promptSync.displaySyncResults(summary);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Skipped 1 up-to-date file');
      expect(output).toContain('Created 1 new prompt file');
    });

    it('should display conflicts', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const summary = {
        ccVersion: '2.0.0',
        results: [
          {
            id: 'prompt1',
            name: 'Prompt 1',
            description: 'Test prompt',
            action: 'conflict' as const,
            oldVersion: '1.0.0',
            newVersion: '2.0.0',
            diffHtmlPath: '/path/to/diff.html',
          },
        ],
      };

      promptSync.displaySyncResults(summary);

      const output = consoleSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Conflicts detected');
      expect(output).toContain('1.0.0');
      expect(output).toContain('2.0.0');
      expect(output).toContain('diff.html');
    });
  });

  describe('loadSystemPromptsWithRegex', () => {
    it('should correctly handle variable names with double dollar signs ($$)', async () => {
      const mockStringsFile: StringsFile = {
        version: '1.0.0',
        prompts: [
          {
            id: 'test-prompt',
            name: 'Test',
            description: 'Test',
            version: '1.0.0',
            pieces: ['Usage: ${', '()} ms'],
            identifiers: [1],
            identifierMap: { '1': 'MAX_TIMEOUT' },
          },
        ],
      };

      // Mock the download function to return our test data
      const { downloadStringsFile } = await import(
        '../systemPromptDownload.js'
      );
      vi.mocked(downloadStringsFile).mockResolvedValue(mockStringsFile);

      // Preload the strings file using the public API
      await promptSync.preloadStringsFile('1.0.0');

      // Create mock markdown file
      const mockMarkdown = `<!--
name: Test
description: Test
ccVersion: 1.0.0
variables:
  - MAX_TIMEOUT
-->

Usage: \${MAX_TIMEOUT()} ms`;

      vi.spyOn(fs, 'readFile').mockResolvedValue(mockMarkdown);

      const results = await promptSync.loadSystemPromptsWithRegex('1.0.0');
      expect(results).toHaveLength(1);

      // Simulate matching with a variable that contains $$
      // This would come from the actual minified code in cli.js
      const matchResult = ['full match', 'J$$'] as RegExpMatchArray;
      const interpolated = results[0].getInterpolatedContent(matchResult);

      // The bug: J$$ should NOT become J$
      expect(interpolated).toBe('Usage: ${J$$()} ms');
      expect(interpolated).not.toBe('Usage: ${J$()} ms');
    });

    it('should correctly handle <<BUILD_TIME>> placeholder', async () => {
      const mockStringsFile: StringsFile = {
        version: '1.0.0',
        prompts: [
          {
            id: 'test-prompt',
            name: 'Test',
            description: 'Test',
            version: '1.0.0',
            pieces: ['Version: <<CCVERSION>>, BUILD_TIME:"<<BUILD_TIME>>"'],
            identifiers: [],
            identifierMap: {},
          },
        ],
      };

      // Mock the download function to return our test data
      const { downloadStringsFile } = await import(
        '../systemPromptDownload.js'
      );
      vi.mocked(downloadStringsFile).mockResolvedValue(mockStringsFile);

      // Preload the strings file using the public API
      await promptSync.preloadStringsFile('1.0.0');

      // Create mock markdown file with placeholders
      const mockMarkdown = `<!--
name: Test
description: Test
ccVersion: 1.0.0
-->

Version: <<CCVERSION>>, BUILD_TIME:"<<BUILD_TIME>>"`;

      vi.spyOn(fs, 'readFile').mockResolvedValue(mockMarkdown);

      // Pass buildTime to loadSystemPromptsWithRegex (simulating extraction from cli.js)
      const buildTime = '2025-12-09T19:43:43Z';
      const results = await promptSync.loadSystemPromptsWithRegex(
        '1.0.0',
        false,
        buildTime
      );
      expect(results).toHaveLength(1);

      // The regex should match the actual content in cli.js
      const testCliContent =
        'Version: 1.0.0, BUILD_TIME:"2025-12-09T19:43:43Z"';
      const regex = new RegExp(results[0].regex);
      const match = testCliContent.match(regex);

      expect(match).not.toBeNull();

      // Simulate matching - the interpolated content should have both placeholders replaced
      const matchResult = [
        'Version: 1.0.0, BUILD_TIME:"2025-12-09T19:43:43Z"',
      ] as RegExpMatchArray;
      const interpolated = results[0].getInterpolatedContent(matchResult);

      // Should replace <<CCVERSION>> with 1.0.0 and <<BUILD_TIME>> with the provided buildTime
      expect(interpolated).toBe(
        'Version: 1.0.0, BUILD_TIME:"2025-12-09T19:43:43Z"'
      );
    });

    it('should generate regex that matches both actual newlines and literal \\n', async () => {
      const mockStringsFile: StringsFile = {
        version: '1.0.0',
        prompts: [
          {
            id: 'test-prompt',
            name: 'Test',
            description: 'Test',
            version: '1.0.0',
            pieces: ['Hello\nWorld'], // actual newline after JSON parse
            identifiers: [],
            identifierMap: {},
          },
        ],
      };

      const { downloadStringsFile } = await import(
        '../systemPromptDownload.js'
      );
      vi.mocked(downloadStringsFile).mockResolvedValue(mockStringsFile);

      await promptSync.preloadStringsFile('1.0.0');

      const mockMarkdown = `<!--
name: Test
description: Test
ccVersion: 1.0.0
-->

Hello
World`;

      vi.spyOn(fs, 'readFile').mockResolvedValue(mockMarkdown);

      const results = await promptSync.loadSystemPromptsWithRegex('1.0.0');
      expect(results).toHaveLength(1);

      const regex = new RegExp(results[0].regex, 'si');

      // Should match actual newline (template literal style)
      const templateLiteralContent = 'Hello\nWorld';
      expect(templateLiteralContent.match(regex)).not.toBeNull();

      // Should match literal \n (string literal style)
      const stringLiteralContent = 'Hello\\nWorld';
      expect(stringLiteralContent.match(regex)).not.toBeNull();
    });
  });
});
