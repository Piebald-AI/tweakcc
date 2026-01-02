import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applySystemPrompts } from './systemPrompts';
import * as promptSync from '../systemPromptSync';
import * as systemPromptHashIndex from '../systemPromptHashIndex';

vi.mock('../systemPromptSync', async () => {
  const actual = await vi.importActual('../systemPromptSync');
  return {
    ...actual,
    loadSystemPromptsWithRegex: vi.fn(),
  };
});

vi.mock('../systemPromptHashIndex', async () => {
  const actual = await vi.importActual('../systemPromptHashIndex');
  return {
    ...actual,
    setAppliedHash: vi.fn(),
  };
});

describe('systemPrompts.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('applySystemPrompts', () => {
    it('should correctly handle variables with double dollar signs ($$) in replacement', async () => {
      // Mock a simple prompt with a variable that will be replaced with J$$
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: ['MAX_TIMEOUT'],
          content: 'Timeout: ${MAX_TIMEOUT()} ms',
          contentLineOffset: 0,
        },
        regex: 'Timeout: ([\\w$]+)\\(\\) ms',
        getInterpolatedContent: (match: RegExpMatchArray) => {
          // This simulates what applyIdentifierMapping does
          // It should replace MAX_TIMEOUT with the captured variable (J$$)
          const capturedVar = match[1];
          return `Timeout: \${${capturedVar}()} ms`;
        },
        pieces: ['Timeout: ${', '()} ms'],
        identifiers: [1],
        identifierMap: { '1': 'MAX_TIMEOUT' },
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);

      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      // Simulate cli.js content with J$$ variable
      const cliContent = 'Timeout: J$$() ms';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      // The bug: J$$ should NOT become J$ in the replacement
      expect(result.newContent).toBe('Timeout: ${J$$()} ms');
      expect(result.newContent).not.toBe('Timeout: ${J$()} ms');
    });

    it('should handle multiple occurrences of $$ correctly', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: ['VAR1', 'VAR2'],
          content: 'Values: ${VAR1} and ${VAR2}',
          contentLineOffset: 0,
        },
        regex: 'Values: ([\\w$]+) and ([\\w$]+)',
        getInterpolatedContent: (match: RegExpMatchArray) => {
          const var1 = match[1];
          const var2 = match[2];
          return `Values: \${${var1}} and \${${var2}}`;
        },
        pieces: ['Values: ${', '} and ${', '}'],
        identifiers: [1, 2],
        identifierMap: { '1': 'VAR1', '2': 'VAR2' },
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);

      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      // Simulate cli.js with multiple $$ variables
      const cliContent = 'Values: A$$ and B$$';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('Values: ${A$$} and ${B$$}');
      expect(result.newContent).not.toContain('${A$}');
      expect(result.newContent).not.toContain('${B$}');
    });

    it('should convert newlines to \\n for double-quoted string literals', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: 'Hello\nWorld', // actual newline from markdown
          contentLineOffset: 0,
        },
        regex: 'Hello(?:\n|\\\\n)World', // matches both formats
        getInterpolatedContent: () => 'Hello\nWorld', // actual newline
        pieces: ['Hello\nWorld'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      // cli.js with double-quoted string literal containing literal \n
      const cliContent = 'description:"Hello\\nWorld"';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      // Should convert actual newline to \n for string literal
      expect(result.newContent).toBe('description:"Hello\\nWorld"');
    });

    it('should keep actual newlines for backtick template literals', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: 'Hello\nWorld', // actual newline from markdown
          contentLineOffset: 0,
        },
        regex: 'Hello(?:\n|\\\\n)World', // matches both formats
        getInterpolatedContent: () => 'Hello\nWorld', // actual newline
        pieces: ['Hello\nWorld'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      // cli.js with backtick template literal containing actual newline
      const cliContent = 'description:`Hello\nWorld`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      // Should keep actual newline for template literal
      expect(result.newContent).toBe('description:`Hello\nWorld`');
    });

    it('should escape double quotes in double-quoted string literals', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: 'Say "Hello"', // contains quotes
          contentLineOffset: 0,
        },
        regex: 'Say "Hello"',
        getInterpolatedContent: () => 'Say "Hello"',
        pieces: ['Say "Hello"'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      // cli.js with double-quoted string
      const cliContent = 'msg:"Say "Hello""';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      // Should escape quotes
      expect(result.newContent).toBe('msg:"Say \\"Hello\\""');
    });

    it('should escape single quotes in single-quoted string literals', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: "It's working", // contains single quote
          contentLineOffset: 0,
        },
        regex: "It's working",
        getInterpolatedContent: () => "It's working",
        pieces: ["It's working"],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      // cli.js with single-quoted string
      const cliContent = "msg:'It's working'";

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      // Should escape single quotes
      expect(result.newContent).toBe("msg:'It\\'s working'");
    });
  });
});
