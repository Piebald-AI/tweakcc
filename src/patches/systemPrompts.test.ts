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

    it('should auto-escape backticks in template literal context', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: 'Choose the `subagent_type` based on needs',
          contentLineOffset: 0,
        },
        regex: 'Choose the `subagent_type` based on needs',
        getInterpolatedContent: () =>
          'Choose the `subagent_type` based on needs',
        pieces: ['Choose the `subagent_type` based on needs'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      const cliContent = 'desc:`Choose the `subagent_type` based on needs`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe(
        'desc:`Choose the \\`subagent_type\\` based on needs`'
      );
    });

    it('should skip prompt with applied:false when escapeDepthZeroBackticks returns incomplete', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: 'text ${unclosed backtick',
          contentLineOffset: 0,
        },
        regex: 'text \\$\\{unclosed backtick',
        getInterpolatedContent: () => 'text ${unclosed backtick',
        pieces: ['text ${unclosed backtick'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();
      const spy = vi
        .spyOn(promptSync, 'escapeDepthZeroBackticks')
        .mockReturnValue({
          content: 'partially escaped',
          incomplete: true,
        });

      const cliContent = 'desc:`text ${unclosed backtick`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe(cliContent);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].applied).toBe(false);
      expect(result.results[0].details).toContain('incomplete');
      spy.mockRestore();
    });

    it('should auto-escape multiple backticks in template literal context', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: 'Use `foo` and `bar` for config',
          contentLineOffset: 0,
        },
        regex: 'Use `foo` and `bar` for config',
        getInterpolatedContent: () => 'Use `foo` and `bar` for config',
        pieces: ['Use `foo` and `bar` for config'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      const cliContent = 'desc:`Use `foo` and `bar` for config`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe(
        'desc:`Use \\`foo\\` and \\`bar\\` for config`'
      );
    });

    it('should not double-escape already-escaped backticks', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: 'Use \\`foo\\` for config',
          contentLineOffset: 0,
        },
        regex: 'Use \\\\`foo\\\\` for config',
        getInterpolatedContent: () => 'Use \\`foo\\` for config',
        pieces: ['Use \\`foo\\` for config'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      const cliContent = 'desc:`Use \\`foo\\` for config`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('desc:`Use \\`foo\\` for config`');
    });

    it('should auto-escape backticks adjacent to template expressions', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: 'Value: `${x}`',
          contentLineOffset: 0,
        },
        regex: 'Value: `\\$\\{x\\}`',
        getInterpolatedContent: () => 'Value: `${x}`',
        pieces: ['Value: `${x}`'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      const cliContent = 'desc:`Value: `${x}``';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('desc:`Value: \\`${x}\\``');
    });

    it('should auto-escape only unescaped backticks when mixed with escaped ones', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: 'Use \\`foo\\` and `bar` for config',
          contentLineOffset: 0,
        },
        regex: 'Use \\\\`foo\\\\` and `bar` for config',
        getInterpolatedContent: () => 'Use \\`foo\\` and `bar` for config',
        pieces: ['Use \\`foo\\` and `bar` for config'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      const cliContent = 'desc:`Use \\`foo\\` and `bar` for config`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe(
        'desc:`Use \\`foo\\` and \\`bar\\` for config`'
      );
    });

    it('should auto-escape backticks at start and end of content', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: '`code`',
          contentLineOffset: 0,
        },
        regex: '`code`',
        getInterpolatedContent: () => '`code`',
        pieces: ['`code`'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      const cliContent = 'desc:``code``';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('desc:`\\`code\\``');
    });

    it('should auto-escape consecutive backticks individually', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: 'Use ```code``` blocks',
          contentLineOffset: 0,
        },
        regex: 'Use ```code``` blocks',
        getInterpolatedContent: () => 'Use ```code``` blocks',
        pieces: ['Use ```code``` blocks'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      const cliContent = 'desc:`Use ```code``` blocks`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe(
        'desc:`Use \\`\\`\\`code\\`\\`\\` blocks`'
      );
    });

    it('should preserve backticks inside interpolation expressions', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: 'Run `cmd` then ${cond?`a`:`b`}',
          contentLineOffset: 0,
        },
        regex: 'Run `cmd` then \\$\\{cond\\?`a`:`b`\\}',
        getInterpolatedContent: () => 'Run `cmd` then ${cond?`a`:`b`}',
        pieces: ['Run `cmd` then ${cond?`a`:`b`}'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      const cliContent = 'desc:`Run `cmd` then ${cond?`a`:`b`}`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe(
        'desc:`Run \\`cmd\\` then ${cond?`a`:`b`}`'
      );
    });

    it('should escape depth-0 backticks but preserve interpolation backticks', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: 'Use `x` and ${c?`a`:`b`}',
          contentLineOffset: 0,
        },
        regex: 'Use `x` and \\$\\{c\\?`a`:`b`\\}',
        getInterpolatedContent: () => 'Use `x` and ${c?`a`:`b`}',
        pieces: ['Use `x` and ${c?`a`:`b`}'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      const cliContent = 'desc:`Use `x` and ${c?`a`:`b`}`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('desc:`Use \\`x\\` and ${c?`a`:`b`}`');
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

    it('should set applied:true when auto-escape changes content even if char delta is 0', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: 'Use `x` here',
          contentLineOffset: 0,
        },
        regex: 'Use `x` here',
        getInterpolatedContent: () => 'Use `x` here',
        pieces: ['Use `x` here'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      const cliContent = 'desc:`Use `x` here`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('desc:`Use \\`x\\` here`');
      expect(result.results[0].applied).toBe(true);
    });

    it('should surface hash persistence failure in result details', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: 'New longer content here',
          contentLineOffset: 0,
        },
        regex: 'Original text',
        getInterpolatedContent: () => 'New longer content here',
        pieces: ['Original text'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockRejectedValue(
        new Error('Storage failure')
      );

      const cliContent = 'desc:"Original text"';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toContain('New longer content here');
      expect(result.results[0].details).toContain('hash');
    });

    it('should skip prompts not in patchFilter', async () => {
      const mockPromptData = {
        promptId: 'test-prompt',
        prompt: {
          name: 'Test Prompt',
          description: 'Test',
          ccVersion: '1.0.0',
          variables: [],
          content: 'Hello World',
          contentLineOffset: 0,
        },
        regex: 'Hello World',
        getInterpolatedContent: () => 'Hello World',
        pieces: ['Hello World'],
        identifiers: [],
        identifierMap: {},
      };

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        mockPromptData,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      const cliContent = 'desc:"Hello World"';

      const result = await applySystemPrompts(cliContent, '1.0.0', false, [
        'other-id',
      ]);

      expect(result.newContent).toBe(cliContent);
      expect(result.results[0].skipped).toBe(true);
      expect(result.results[0].applied).toBe(false);
    });
  });
});
