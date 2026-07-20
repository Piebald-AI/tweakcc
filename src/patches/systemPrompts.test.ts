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

    it('should escape backslashes before quotes to preserve literal backslash-quotes (#660)', async () => {
      const mockPromptData = buildMockPromptData({
        content: 'Say \\"Hello\\"',
        regex: 'Say \\\\"Hello\\\\"',
        getInterpolatedContent: () => 'Say \\"Hello\\"',
        pieces: ['Say \\"Hello\\"'],
      });

      setupMocks(mockPromptData);

      const cliContent = 'msg:"Say \\"Hello\\""';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('msg:"Say \\\\\\"Hello\\\\\\""');
    });

    it('should escape carriage returns in double-quoted string literals (CRLF-edited prompts)', async () => {
      const mockPromptData = buildMockPromptData({
        content: 'ORIGINAL',
        regex: 'ORIGINAL',
        getInterpolatedContent: () => 'line one\r\nfind\\ blocked',
        pieces: ['ORIGINAL'],
      });

      setupMocks(mockPromptData);

      const cliContent = 'var x="ORIGINAL";';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('var x="line one\\r\\nfind\\\\ blocked";');
    });

    it('should escape carriage returns in single-quoted string literals (CRLF-edited prompts)', async () => {
      const mockPromptData = buildMockPromptData({
        content: 'ORIGINAL',
        regex: 'ORIGINAL',
        getInterpolatedContent: () => 'line one\r\nfind\\ blocked',
        pieces: ['ORIGINAL'],
      });

      setupMocks(mockPromptData);

      const cliContent = "var x='ORIGINAL';";

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe("var x='line one\\r\\nfind\\\\ blocked';");
    });

    it('should escape a lone carriage return (old-Mac line endings) in double-quoted string literals', async () => {
      const mockPromptData = buildMockPromptData({
        content: 'ORIGINAL',
        regex: 'ORIGINAL',
        getInterpolatedContent: () => 'line one\rline two',
        pieces: ['ORIGINAL'],
      });

      setupMocks(mockPromptData);

      const cliContent = 'var x="ORIGINAL";';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('var x="line one\\rline two";');
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

    it('should preserve already-escaped backticks in template literals (round-trips to vanilla)', async () => {
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

    it('should preserve escaped interpolation markers in template literal context', async () => {
      const mockPromptData = buildMockPromptData({
        content: 'Use \\${name} literally',
        regex: 'Use \\\\\\$\\{name\\} literally',
        getInterpolatedContent: () => 'Use \\${name} literally',
        pieces: ['Use \\${name} literally'],
      });

      setupMocks(mockPromptData);

      const cliContent = 'desc:`Use \\${name} literally`';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('desc:`Use \\${name} literally`');
      expect(
        new Function(
          'const name = "expanded"; return { ' + result.newContent + ' };'
        )()
      ).toEqual({
        desc: 'Use ${name} literally',
      });
    });

    it('should preserve already-escaped backticks and auto-escape bare backticks in template literals', async () => {
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

    it('should escape backslashes before single quotes to preserve literal backslash-quotes (#660)', async () => {
      const mockPromptData = buildMockPromptData({
        content: "It\\'s working",
        regex: "It\\\\'s working",
        getInterpolatedContent: () => "It\\'s working",
        pieces: ["It\\'s working"],
      });

      setupMocks(mockPromptData);

      const cliContent = "msg:'It\\'s working'";

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe("msg:'It\\\\\\'s working'");
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

    it('should skip a prompt whose regex fails to compile instead of throwing', async () => {
      const mockPromptData = buildMockPromptData({
        promptId: 'uncompilable-prompt',
        prompt: { name: 'Uncompilable Prompt', content: 'unused' },
        regex: '(', // invalid pattern: new RegExp('(', 'si') throws (unterminated group)
        getInterpolatedContent: () => 'unused',
        pieces: ['unused'],
      });

      setupMocks(mockPromptData);

      const cliContent = 'desc:"some content"';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe(cliContent);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].applied).toBe(false);
      expect(result.results[0].details).toContain('too complex');
    });

    it('should continue applying remaining prompts after one regex fails to compile', async () => {
      const badPrompt = buildMockPromptData({
        promptId: 'bad-prompt',
        prompt: { name: 'Bad Prompt', content: 'unused' },
        regex: '(',
        getInterpolatedContent: () => 'unused',
        pieces: ['unused'],
      });
      const goodPrompt = buildMockPromptData({
        promptId: 'good-prompt',
        prompt: { name: 'Good Prompt', content: 'New content' },
        regex: 'Original text',
        getInterpolatedContent: () => 'New content',
        pieces: ['Original text'],
      });

      vi.mocked(promptSync.loadSystemPromptsWithRegex).mockResolvedValue([
        badPrompt,
        goodPrompt,
      ]);
      vi.mocked(systemPromptHashIndex.setAppliedHash).mockResolvedValue();

      const cliContent = 'desc:"Original text"';

      const result = await applySystemPrompts(cliContent, '1.0.0', false);

      expect(result.newContent).toBe('desc:"New content"');
      expect(result.results).toHaveLength(2);
      expect(result.results[0].id).toBe('bad-prompt');
      expect(result.results[0].applied).toBe(false);
      expect(result.results[0].details).toContain('too complex');
      expect(result.results[1].id).toBe('good-prompt');
      expect(result.results[1].applied).toBe(true);
    });
  });

  describe('backtick round-trip byte-identity (#869)', () => {
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const applyBacktick = async (source: string) => {
      setupMocks(
        buildMockPromptData({
          content: source,
          regex: escapeRegex(source),
          getInterpolatedContent: () => source,
          pieces: [source],
        })
      );
      const cliContent = 'x:`' + source + '`';
      const result = await applySystemPrompts(cliContent, '1.0.0', false);
      expect(result.results[0].details ?? '').not.toContain('incomplete');
      return { newContent: result.newContent, cliContent };
    };

    it('preserves an escaped backtick inside a ${...} interpolation (the fatal case)', async () => {
      const { newContent, cliContent } = await applyBacktick(
        '${l?`\\`${y}\\``:y}'
      );
      expect(newContent).toBe(cliContent);
    });

    it('preserves an escaped backtick at depth 0 (the cosmetic case)', async () => {
      const { newContent, cliContent } = await applyBacktick('\\`${MC}\\`');
      expect(newContent).toBe(cliContent);
    });

    it('preserves nested template literals inside an interpolation', async () => {
      const { newContent, cliContent } = await applyBacktick(
        '${a?`${b?`deep`:`also`}`:`flat`}'
      );
      expect(newContent).toBe(cliContent);
    });

    it('preserves an escaped interpolation marker', async () => {
      const { newContent, cliContent } = await applyBacktick(
        'Use \\${name} literally'
      );
      expect(newContent).toBe(cliContent);
    });

    it('preserves an escaped non-ASCII sequence without doubling its backslash', async () => {
      const { newContent, cliContent } = await applyBacktick(
        'em dash \\u2014 here'
      );
      expect(newContent).toBe(cliContent);
    });

    it('still auto-escapes a genuinely raw backtick in prose', async () => {
      const { newContent } = await applyBacktick('Use `foo`');
      expect(newContent).toBe('x:`Use \\`foo\\``');
    });

    it('still doubles backslashes for single-quoted (#660) prompts', async () => {
      setupMocks(
        buildMockPromptData({
          content: "It\\'s working",
          regex: "It\\\\'s working",
          getInterpolatedContent: () => "It\\'s working",
          pieces: ["It\\'s working"],
        })
      );
      const result = await applySystemPrompts(
        "msg:'It\\'s working'",
        '1.0.0',
        false
      );
      expect(result.newContent).toBe("msg:'It\\\\\\'s working'");
    });

    it('emits a template literal that evaluates back to the intended prompt text', async () => {
      const { newContent: n1 } = await applyBacktick('${l?`\\`${y}\\``:y}');
      expect(
        new Function('const l = true, y = "IDX"; return { ' + n1 + ' };')()
      ).toEqual({ x: '`IDX`' });

      const { newContent: n2 } = await applyBacktick('\\`${MC}\\`');
      expect(new Function('const MC = "F"; return { ' + n2 + ' };')()).toEqual({
        x: '`F`',
      });

      const { newContent: n3 } = await applyBacktick('Use \\${name} literally');
      expect(
        new Function('const name = "X"; return { ' + n3 + ' };')()
      ).toEqual({ x: 'Use ${name} literally' });
    });

    it('escapeDepthZeroBackticks is byte-identity on template-literal prompts in the recent snapshots', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const dir = 'data/prompts';
      const files = fs
        .readdirSync(dir)
        .filter(f => /^prompts-\d+\.\d+\.\d+\.json$/.test(f))
        .sort((a, b) => {
          const pa = a
            .match(/(\d+)\.(\d+)\.(\d+)/)!
            .slice(1)
            .map(Number);
          const pb = b
            .match(/(\d+)\.(\d+)\.(\d+)/)!
            .slice(1)
            .map(Number);
          return pb[0] - pa[0] || pb[1] - pa[1] || pb[2] - pa[2];
        })
        .slice(0, 15);
      const failures: string[] = [];
      let checked = 0;
      for (const file of files) {
        const parsed = JSON.parse(
          fs.readFileSync(path.join(dir, file), 'utf8')
        );
        for (const p of parsed.prompts ?? []) {
          const recon = promptSync.reconstructContentFromPieces(
            p.pieces,
            p.identifiers,
            p.identifierMap
          );
          if (!recon.includes('\\`')) continue;
          checked++;
          const { content, incomplete } =
            promptSync.escapeDepthZeroBackticks(recon);
          if (content !== recon || incomplete) {
            failures.push(`${parsed.version}:${p.id}`);
          }
        }
      }
      expect(checked).toBeGreaterThan(0);
      expect(failures).toEqual([]);
    });
  });
});
