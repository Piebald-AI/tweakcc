import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const promptExtractorPath = path.join(repoRoot, 'tools', 'promptExtractor.js');

describe('promptExtractor merge behavior', () => {
  it('ignores formatting-only changes inside interpolation expressions', () => {
    const require = createRequire(import.meta.url);
    const extractor = require(promptExtractorPath) as {
      __test: {
        mergeWithExisting: (
          newData: { prompts: Array<Record<string, unknown>> },
          oldData: { prompts: Array<Record<string, unknown>> },
          currentVersion: string
        ) => { prompts: Array<Record<string, unknown>> };
      };
    };
    const oldPrompt = {
      name: 'Fixture prompt',
      id: 'fixture-prompt',
      description: 'Fixture description',
      pieces: ['Use ${flag ? `alpha ${nested ? ", beta" : ""}` : "', '"} now'],
      identifiers: [0],
      identifierMap: { '0': 'FALLBACK_LABEL' },
      version: '2.1.235',
    };
    const newPrompt = {
      pieces: ['Use ${flag?`alpha ${nested?", beta":""}`:"', '"} now'],
      identifiers: [0],
      identifierMap: { '0': '' },
    };

    const merged = extractor.__test.mergeWithExisting(
      { prompts: [newPrompt] },
      { prompts: [oldPrompt] },
      '2.1.236'
    ).prompts[0];

    expect(merged).toMatchObject({
      name: oldPrompt.name,
      id: oldPrompt.id,
      description: oldPrompt.description,
      pieces: newPrompt.pieces,
      version: oldPrompt.version,
    });
  });

  it('ignores source quote-style changes without changing string values', () => {
    const require = createRequire(import.meta.url);
    const extractor = require(promptExtractorPath) as {
      __test: {
        mergeWithExisting: (
          newData: { prompts: Array<Record<string, unknown>> },
          oldData: { prompts: Array<Record<string, unknown>> },
          currentVersion: string
        ) => { prompts: Array<Record<string, unknown>> };
      };
    };
    const oldPrompt = {
      name: 'Fixture prompt',
      id: 'fixture-prompt',
      description: 'Fixture description',
      pieces: ["Use ${flag ? 'alpha' : '", "'} now"],
      identifiers: [0],
      identifierMap: { '0': 'FALLBACK_LABEL' },
      version: '2.1.235',
    };
    const newPrompt = {
      pieces: ['Use ${flag?"alpha":"', '"} now'],
      identifiers: [0],
      identifierMap: { '0': '' },
    };

    const merged = extractor.__test.mergeWithExisting(
      { prompts: [newPrompt] },
      { prompts: [oldPrompt] },
      '2.1.236'
    ).prompts[0];

    expect(merged.version).toBe(oldPrompt.version);
    expect(merged.pieces).toEqual(newPrompt.pieces);
  });

  it('does not reinterpret literal interpolation examples as source', () => {
    const require = createRequire(import.meta.url);
    const extractor = require(promptExtractorPath) as {
      __test: {
        mergeWithExisting: (
          newData: { prompts: Array<Record<string, unknown>> },
          oldData: { prompts: Array<Record<string, unknown>> },
          currentVersion: string
        ) => { prompts: Array<Record<string, unknown>> };
      };
    };
    const oldPrompt = {
      name: 'Fixture prompt',
      id: 'fixture-prompt',
      description: 'Fixture description',
      pieces: ['Show `${flag ? "alpha" : "gamma"}` to the user'],
      identifiers: [],
      identifierMap: {},
      version: '2.1.235',
    };
    const newPrompt = {
      pieces: ['Show `${flag?"alpha":"gamma"}` to the user'],
      identifiers: [],
      identifierMap: {},
    };

    const merged = extractor.__test.mergeWithExisting(
      { prompts: [newPrompt] },
      { prompts: [oldPrompt] },
      '2.1.236'
    ).prompts[0];

    expect(merged.version).toBe('2.1.236');
  });

  it('keeps whitespace changes in prompt prose semantic', () => {
    const require = createRequire(import.meta.url);
    const extractor = require(promptExtractorPath) as {
      __test: {
        mergeWithExisting: (
          newData: { prompts: Array<Record<string, unknown>> },
          oldData: { prompts: Array<Record<string, unknown>> },
          currentVersion: string
        ) => { prompts: Array<Record<string, unknown>> };
      };
    };
    const oldPrompt = {
      name: 'Fixture prompt',
      id: 'fixture-prompt',
      description: 'Fixture description',
      pieces: ['Use ${flag?"alpha":"gamma"} now'],
      identifiers: [],
      identifierMap: {},
      version: '2.1.235',
    };
    const newPrompt = {
      pieces: ['Use  ${flag?"alpha":"gamma"} now'],
      identifiers: [],
      identifierMap: {},
    };

    const merged = extractor.__test.mergeWithExisting(
      { prompts: [newPrompt] },
      { prompts: [oldPrompt] },
      '2.1.236'
    ).prompts[0];

    expect(merged.version).toBe('2.1.236');
  });
});

describe('promptExtractor agent metadata', () => {
  it('resolves new tool-name variables used in agent tool arrays', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'prompt-extractor-'));

    try {
      const cliPath = path.join(tempDir, 'cli.js');
      const outputPath = path.join(tempDir, 'prompts.json');
      const promptText = `You are the metadata fixture agent for Claude Code. You should read the request carefully and answer with only the conclusion that matters to the user.

You must preserve source details when they affect behavior. You should avoid changing files, avoid inventing missing context, and explain uncertainty when a source excerpt is incomplete.

When you compare two implementations, you should focus on behavior, permissions, and user-visible output. Always keep the answer grounded in the actual code path instead of a guess from naming alone.

If the user asks where something is defined, you should name the relevant symbol and the file that owns it. If the user asks whether a tool is available, you should report the resolved tool name from the agent metadata.`;

      writeFileSync(
        cliPath,
        `const promptText = \`${promptText}\`;
const ls = "Agent", qz = "ArtifactRenderer", rd = "Read";
const builtInAgent = {
  agentType: "Explore",
  whenToUse: "Fixture search agent used by the prompt extractor regression test.",
  disallowedTools: [ls, qz, rd],
  source: "built-in",
  baseDir: "built-in",
  model: "haiku",
  getSystemPrompt: () => promptText,
};
void builtInAgent;
`
      );

      execFileSync('node', [promptExtractorPath, cliPath, outputPath], {
        cwd: repoRoot,
        env: { ...process.env, PROMPT_EXTRACTOR_PERF: '0' },
        stdio: 'pipe',
      });

      const data = JSON.parse(readFileSync(outputPath, 'utf8'));
      const prompt = data.prompts.find(
        (entry: { agentMetadata?: { agentType?: string } }) =>
          entry.agentMetadata?.agentType === 'Explore'
      );

      expect(prompt?.agentMetadata?.disallowedTools).toEqual([
        'Agent',
        'ArtifactRenderer',
        'Read',
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('attaches dynamic and empty agent metadata only to explicit prompt identities', () => {
    const require = createRequire(import.meta.url);
    const extractor = require(promptExtractorPath) as {
      __test: {
        attachAgentMetadata: (
          source: string,
          prompts: Array<Record<string, unknown>>
        ) => number;
      };
    };
    const prompts = [
      {
        name: 'Agent Prompt: Plan mode (enhanced)',
        id: 'agent-prompt-plan-mode-enhanced',
        pieces: ['PLAN_AGENT_PROMPT'],
      },
      {
        name: 'System Prompt: Plan vs memory guidance',
        id: 'system-prompt-plan-vs-memory-guidance',
        pieces: ['PLAN_MEMORY_GUIDANCE'],
      },
      {
        name: 'Agent Prompt: Claude guide agent',
        id: 'agent-prompt-claude-guide-agent',
        pieces: ['CLAUDE_GUIDE_AGENT_PROMPT'],
      },
      {
        name: 'System Prompt: Context compaction summary',
        id: 'system-prompt-context-compaction-summary',
        pieces: ['SDK_CONTEXT_COMPACTION_PROMPT'],
      },
      {
        name: 'Agent Prompt: Worker fork',
        id: 'agent-prompt-worker-fork',
        pieces: ['WORKER_FORK_DIRECTIVE'],
      },
    ];
    const source = `
const planAgent = {
  agentType: "Plan",
  whenToUse: "Plan fixture agent.",
  source: "built-in",
  baseDir: "built-in",
  model: "inherit",
  getSystemPrompt: () => planPrompt,
};
const guideAgent = {
  agentType: "claude-code-guide",
  whenToUse: "Guide fixture agent.",
  source: "built-in",
  baseDir: "built-in",
  model: "haiku",
  getSystemPrompt() { return buildGuidePrompt(); },
};
const forkAgent = {
  agentType: "fork",
  whenToUse: "Fork fixture agent.",
  source: "built-in",
  baseDir: "built-in",
  model: "inherit",
  getSystemPrompt: () => "",
};
`;

    extractor.__test.attachAgentMetadata(source, prompts);
    const byId = (id: string) =>
      prompts.find(entry => entry.id === id) as {
        agentMetadata?: { agentType?: string };
      };

    expect(
      byId('agent-prompt-plan-mode-enhanced').agentMetadata?.agentType
    ).toBe('Plan');
    expect(
      byId('agent-prompt-claude-guide-agent').agentMetadata?.agentType
    ).toBe('claude-code-guide');
    expect(byId('agent-prompt-worker-fork').agentMetadata?.agentType).toBe(
      'fork'
    );
    expect(
      byId('system-prompt-plan-vs-memory-guidance').agentMetadata
    ).toBeUndefined();
    expect(
      byId('system-prompt-context-compaction-summary').agentMetadata
    ).toBeUndefined();
  });
});
