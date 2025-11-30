import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applySystemPrompts } from './systemPrompts.js';
import * as promptSync from '../promptSync.js';
import * as systemPromptHashIndex from '../systemPromptHashIndex.js';

vi.mock('../promptSync.js', async () => {
  const actual = await vi.importActual('../promptSync.js');
  return {
    ...actual,
    loadSystemPromptsWithRegex: vi.fn(),
  };
});

vi.mock('../systemPromptHashIndex.js', async () => {
  const actual = await vi.importActual('../systemPromptHashIndex.js');
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
  });
});
