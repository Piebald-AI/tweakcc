import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const promptExtractorPath = path.join(repoRoot, 'tools', 'promptExtractor.js');

const normalNote =
  ' Until fetched, only the name is known — there is no parameter schema, so the tool cannot be invoked.';
const strictNote =
  ' Until fetched, only the name is known — there is no parameter schema, so calling the tool fails with InputValidationError. Fetch it with query select:<name> before calling it.';
const EXTRACTOR_TIMEOUT_MS = 5_000;

describe('promptExtractor assembled descriptions', () => {
  it('keeps every source fragment of a long concatenated description', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'prompt-extractor-'));

    try {
      const cliPath = path.join(tempDir, 'cli.js');
      const outputPath = path.join(tempDir, 'prompts.json');
      writeFileSync(
        cliPath,
        `const opening = "Fetches full schema definitions for deferred tools so they can be called.\\n\\nDeferred tools appear by name in <system-reminder> messages.";
const normal = "${normalNote}";
const strict = "${strictNote}";
const toolName = "Bash";
const details = \` This tool takes a query and matches it against the deferred tool list. You should select the exact tools needed for the task, and you must fetch their complete schemas before invoking them. Once fetched, each schema is callable like a tool defined at the top of the prompt. Always batch predictable tool selections into one request so the user does not wait for redundant round trips. The result includes every matched tool's description, name, and parameters. Use keyword search when the exact name is unknown, and use direct selection when it is known. The resident tool name is \${toolName}.\`;
function buildDescription() { return opening + (enabled() ? strict : normal) + details; }
const tool = { description() { return buildDescription(); } };
function unrelated() {
  const opening = "This same-named local belongs to another function and must not enter the tool description.";
  return opening;
}
void tool;
void unrelated;
`
      );

      execFileSync('node', [promptExtractorPath, cliPath, outputPath], {
        cwd: repoRoot,
        env: { ...process.env, PROMPT_EXTRACTOR_PERF: '0' },
        stdio: 'pipe',
        timeout: EXTRACTOR_TIMEOUT_MS,
      });

      const data = JSON.parse(readFileSync(outputPath, 'utf8'));
      const bodies = data.prompts.map((entry: { pieces: string[] }) =>
        entry.pieces.join('')
      );

      expect(bodies).toContain(
        'Fetches full schema definitions for deferred tools so they can be called.\n\nDeferred tools appear by name in <system-reminder> messages.'
      );
      expect(bodies).toContain(normalNote);
      expect(bodies).toContain(strictNote);
      expect(bodies).not.toContain('Bash');
      expect(bodies).not.toContain(
        'This same-named local belongs to another function and must not enter the tool description.'
      );
      expect(
        bodies.some((body: string) =>
          body.startsWith(' This tool takes a query')
        )
      ).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('does not include desktop settings long descriptions', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'prompt-extractor-'));

    try {
      const cliPath = path.join(tempDir, 'cli.js');
      const outputPath = path.join(tempDir, 'prompts.json');
      writeFileSync(
        cliPath,
        `const setting = {
  description: {
    long: settings.longDescription(\`When enabled, this desktop setting changes how the application behaves for administrators and users. It should explain deployment behavior, compatibility details, identity-provider requirements, network consequences, and several examples in enough detail to exceed the prompt extractor threshold. This is user-facing configuration documentation rather than model-facing instruction text. Administrators should read it in the settings interface, but it must never enter the prompt archive merely because it contains instructional prose and multiple complete sentences.\`),
  },
};
void setting;
`
      );

      execFileSync('node', [promptExtractorPath, cliPath, outputPath], {
        cwd: repoRoot,
        env: { ...process.env, PROMPT_EXTRACTOR_PERF: '0' },
        stdio: 'pipe',
        timeout: EXTRACTOR_TIMEOUT_MS,
      });

      const data = JSON.parse(readFileSync(outputPath, 'utf8'));
      expect(data.prompts).toHaveLength(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('does not recursively inspect nested call-expression callees for settings descriptions', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'prompt-extractor-'));

    try {
      const cliPath = path.join(tempDir, 'cli.js');
      const outputPath = path.join(tempDir, 'prompts.json');
      const nestedCall = Array.from({ length: 100 }).reduce(
        expression => `wrap(${expression})`,
        'value'
      );
      writeFileSync(
        cliPath,
        `const value = "ordinary value";\nconst result = ${nestedCall};\nvoid result;\n`
      );

      execFileSync('node', [promptExtractorPath, cliPath, outputPath], {
        cwd: repoRoot,
        env: { ...process.env, PROMPT_EXTRACTOR_PERF: '0' },
        stdio: 'pipe',
        timeout: EXTRACTOR_TIMEOUT_MS,
      });

      const data = JSON.parse(readFileSync(outputPath, 'utf8'));
      expect(data.prompts).toHaveLength(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('does not include short literals from an ordinary non-description concatenation', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'prompt-extractor-'));

    try {
      const cliPath = path.join(tempDir, 'cli.js');
      const outputPath = path.join(tempDir, 'prompts.json');
      writeFileSync(
        cliPath,
        `const first = "This short user-interface label should remain excluded. ";
const second = \`This longer user-interface help string is deliberately verbose. It explains several visual controls to a person, but it is not a model-facing tool description. The interface should render it in a panel, and the user can dismiss that panel after reading it. This fixture keeps adding ordinary prose so the assembled value crosses the extraction threshold without becoming a prompt. It describes buttons, menus, colors, spacing, and keyboard navigation. It should not be archived merely because two source literals are concatenated into one long user-facing value.\`;
const helpText = first + second;
void helpText;
`
      );

      execFileSync('node', [promptExtractorPath, cliPath, outputPath], {
        cwd: repoRoot,
        env: { ...process.env, PROMPT_EXTRACTOR_PERF: '0' },
        stdio: 'pipe',
        timeout: EXTRACTOR_TIMEOUT_MS,
      });

      const data = JSON.parse(readFileSync(outputPath, 'utf8'));
      const bodies = data.prompts.map((entry: { pieces: string[] }) =>
        entry.pieces.join('')
      );
      expect(bodies).not.toContain(
        'This short user-interface label should remain excluded. '
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
