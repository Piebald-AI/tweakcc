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

function buildMockPromptData(
  overrides: {
    promptId?: string;
    prompt?: Partial<{
      name: string;
      description: string;
      ccVersion: string;
      contentLineOffset: number;
      variables: string[];
      content: string;
    }>;
    content?: string;
    regex?: string;
    getInterpolatedContent?: (match: RegExpMatchArray) => string;
    pieces?: string[];
    identifiers?: number[];
    identifierMap?: Record<string, string>;
  } = {}
) {
  const content = overrides.content;
  const hasExplicitFields =
    overrides.regex !== undefined ||
    overrides.getInterpolatedContent !== undefined ||
    overrides.pieces !== undefined;

  const derivedRegex =
    overrides.regex ?? (!hasExplicitFields && content ? content : '');
  const derivedGetInterpolatedContent =
    overrides.getInterpolatedContent ??
    (!hasExplicitFields && content ? () => content : () => '');
  const derivedPieces =
    overrides.pieces ?? (!hasExplicitFields && content ? [content] : []);

  const promptContent = overrides.prompt?.content ?? content ?? '';

  return {
    promptId: overrides.promptId ?? 'test-prompt',
    prompt: {
      name: 'Test Prompt',
      description: 'Test',
      ccVersion: '1.0.0',
      contentLineOffset: 0,
      variables: [],
      ...overrides.prompt,
      content: promptContent,
    },
    regex: derivedRegex,
    getInterpolatedContent: derivedGetInterpolatedContent,
    pieces: derivedPieces,
    identifiers: overrides.identifiers ?? [],
    identifierMap: overrides.identifierMap ?? {},
  };
}

function setupMocks(
  promptData: ReturnType<typeof buildMockPromptData>,
  hashBehavior?: Error
) {
  vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
    promptData,
  ]);
  if (hashBehavior instanceof Error) {
    vi.mocked(systemPromptHashIndex.setAppliedHash).mockRejectedValue(
      hashBehavior
    );
  } else {
    vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();
  }
}

describe('systemPrompts.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('applySystemPrompts', () => {
    it('should correctly handle variables with double dollar signs ($$) in replacement', async () => {
      const mockPromptData = buildMockPromptData({
        prompt: {
          variables: ['MAX_TIMEOUT'],
          content: 'Timeout: ${MAX_TIMEOUT()} ms',
        },
        regex: 'Timeout: ([\\w$]+)\\(\\) ms',
        getInterpolatedContent: (match: RegExpMatchArray) => {
          const capturedVar = match[1];
          return `Timeout: \${${capturedVar}()} ms`;
        },
        pieces: ['Timeout: ${', '()} ms'],
        identifiers: [1],
        identifierMap: { '1': 'MAX_TIMEOUT' },
      });

      setupMocks(mockPromptData);

      const cliContent = 'Timeout: J$$() ms';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('Timeout: ${J$$()} ms');
      expect(result.newContent).not.toBe('Timeout: ${J$()} ms');
    });

    it('should handle multiple occurrences of $$ correctly', async () => {
      const mockPromptData = buildMockPromptData({
        prompt: {
          variables: ['VAR1', 'VAR2'],
          content: 'Values: ${VAR1} and ${VAR2}',
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
      });

      setupMocks(mockPromptData);

      const cliContent = 'Values: A$$ and B$$';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('Values: ${A$$} and ${B$$}');
      expect(result.newContent).not.toContain('${A$}');
      expect(result.newContent).not.toContain('${B$}');
    });

    it('should convert newlines to \\n for double-quoted string literals', async () => {
      const mockPromptData = buildMockPromptData({
        prompt: { content: 'Hello\nWorld' },
        regex: 'Hello(?:\n|\\\\n)World',
        getInterpolatedContent: () => 'Hello\nWorld',
        pieces: ['Hello\nWorld'],
      });

      setupMocks(mockPromptData);

      const cliContent = 'description:"Hello\\nWorld"';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('description:"Hello\\nWorld"');
    });

    it('should keep actual newlines for backtick template literals', async () => {
      const mockPromptData = buildMockPromptData({
        prompt: { content: 'Hello\nWorld' },
        regex: 'Hello(?:\n|\\\\n)World',
        getInterpolatedContent: () => 'Hello\nWorld',
        pieces: ['Hello\nWorld'],
      });

      setupMocks(mockPromptData);

      const cliContent = 'description:`Hello\nWorld`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('description:`Hello\nWorld`');
    });

    it('should escape double quotes in double-quoted string literals', async () => {
      const mockPromptData = buildMockPromptData({
        content: 'Say "Hello"',
      });

      setupMocks(mockPromptData);

      const cliContent = 'msg:"Say "Hello""';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('msg:"Say \\"Hello\\""');
    });

    it('should auto-escape backticks in template literal context', async () => {
      const mockPromptData = buildMockPromptData({
        content: 'Choose the `subagent_type` based on needs',
      });

      setupMocks(mockPromptData);

      const cliContent = 'desc:`Choose the `subagent_type` based on needs`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe(
        'desc:`Choose the \\`subagent_type\\` based on needs`'
      );
    });

    it('should skip prompt with applied:false when escapeDepthZeroBackticks returns incomplete', async () => {
      const mockPromptData = buildMockPromptData({
        prompt: { content: 'text ${unclosed backtick' },
        regex: 'text \\$\\{unclosed backtick',
        getInterpolatedContent: () => 'text ${unclosed backtick',
        pieces: ['text ${unclosed backtick'],
      });

      setupMocks(mockPromptData);
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
      const mockPromptData = buildMockPromptData({
        content: 'Use `foo` and `bar` for config',
      });

      setupMocks(mockPromptData);

      const cliContent = 'desc:`Use `foo` and `bar` for config`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe(
        'desc:`Use \\`foo\\` and \\`bar\\` for config`'
      );
    });

    it('should not double-escape already-escaped backticks', async () => {
      const mockPromptData = buildMockPromptData({
        content: 'Use \\`foo\\` for config',
        regex: 'Use \\\\`foo\\\\` for config',
        getInterpolatedContent: () => 'Use \\`foo\\` for config',
        pieces: ['Use \\`foo\\` for config'],
      });

      setupMocks(mockPromptData);

      const cliContent = 'desc:`Use \\`foo\\` for config`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('desc:`Use \\`foo\\` for config`');
    });

    it('should auto-escape backticks adjacent to template expressions', async () => {
      const mockPromptData = buildMockPromptData({
        content: 'Value: `${x}`',
        regex: 'Value: `\\$\\{x\\}`',
        getInterpolatedContent: () => 'Value: `${x}`',
        pieces: ['Value: `${x}`'],
      });

      setupMocks(mockPromptData);

      const cliContent = 'desc:`Value: `${x}``';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('desc:`Value: \\`${x}\\``');
    });

    it('should auto-escape only unescaped backticks when mixed with escaped ones', async () => {
      const mockPromptData = buildMockPromptData({
        content: 'Use \\`foo\\` and `bar` for config',
        regex: 'Use \\\\`foo\\\\` and `bar` for config',
        getInterpolatedContent: () => 'Use \\`foo\\` and `bar` for config',
        pieces: ['Use \\`foo\\` and `bar` for config'],
      });

      setupMocks(mockPromptData);

      const cliContent = 'desc:`Use \\`foo\\` and `bar` for config`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe(
        'desc:`Use \\`foo\\` and \\`bar\\` for config`'
      );
    });

    it('should auto-escape backticks at start and end of content', async () => {
      const mockPromptData = buildMockPromptData({
        content: '`code`',
      });

      setupMocks(mockPromptData);

      const cliContent = 'desc:``code``';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('desc:`\\`code\\``');
    });

    it('should auto-escape consecutive backticks individually', async () => {
      const mockPromptData = buildMockPromptData({
        content: 'Use ```code``` blocks',
      });

      setupMocks(mockPromptData);

      const cliContent = 'desc:`Use ```code``` blocks`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe(
        'desc:`Use \\`\\`\\`code\\`\\`\\` blocks`'
      );
    });

    it('should preserve backticks inside interpolation expressions', async () => {
      const mockPromptData = buildMockPromptData({
        content: 'Run `cmd` then ${cond?`a`:`b`}',
        regex: 'Run `cmd` then \\$\\{cond\\?`a`:`b`\\}',
        getInterpolatedContent: () => 'Run `cmd` then ${cond?`a`:`b`}',
        pieces: ['Run `cmd` then ${cond?`a`:`b`}'],
      });

      setupMocks(mockPromptData);

      const cliContent = 'desc:`Run `cmd` then ${cond?`a`:`b`}`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe(
        'desc:`Run \\`cmd\\` then ${cond?`a`:`b`}`'
      );
    });

    it('should escape depth-0 backticks but preserve interpolation backticks', async () => {
      const mockPromptData = buildMockPromptData({
        content: 'Use `x` and ${c?`a`:`b`}',
        regex: 'Use `x` and \\$\\{c\\?`a`:`b`\\}',
        getInterpolatedContent: () => 'Use `x` and ${c?`a`:`b`}',
        pieces: ['Use `x` and ${c?`a`:`b`}'],
      });

      setupMocks(mockPromptData);

      const cliContent = 'desc:`Use `x` and ${c?`a`:`b`}`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('desc:`Use \\`x\\` and ${c?`a`:`b`}`');
    });

    it('should escape single quotes in single-quoted string literals', async () => {
      const mockPromptData = buildMockPromptData({
        content: "It's working",
      });

      setupMocks(mockPromptData);

      const cliContent = "msg:'It's working'";

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe("msg:'It\\'s working'");
    });

    it('should set applied:true when auto-escape changes content even if char delta is 0', async () => {
      const mockPromptData = buildMockPromptData({
        content: 'Use `x` here',
      });

      setupMocks(mockPromptData);

      const cliContent = 'desc:`Use `x` here`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('desc:`Use \\`x\\` here`');
      expect(result.results[0].applied).toBe(true);
    });

    it('should surface hash persistence failure in result details', async () => {
      const mockPromptData = buildMockPromptData({
        prompt: { content: 'New longer content here' },
        regex: 'Original text',
        getInterpolatedContent: () => 'New longer content here',
        pieces: ['Original text'],
      });

      setupMocks(mockPromptData, new Error('Storage failure'));

      const cliContent = 'desc:"Original text"';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toContain('New longer content here');
      expect(result.results[0].failed).toBe(true);
      expect(result.results[0].details).toContain('hash storage failed');
    });

    it('should skip prompts not in patchFilter', async () => {
      const mockPromptData = buildMockPromptData({
        content: 'Hello World',
      });

      setupMocks(mockPromptData);

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
