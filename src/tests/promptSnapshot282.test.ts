import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import snapshot from '../../data/prompts/prompts-2.1.282.json';
import { downloadStringsFile } from '../systemPromptDownload';
import {
  applyIdentifierMapping,
  buildSearchRegexFromPieces,
  generateMarkdownFromPrompt,
  hasIdentifierDrift,
  loadSystemPromptsWithRegex,
  preloadStringsFile,
  reconstructContentFromPieces,
  type StringsPrompt,
} from '../systemPromptSync';

vi.mock('node:fs/promises');
vi.mock('../systemPromptDownload');

const VERSION = '2.1.282';
const BUILD_TIME = '2026-09-24T03:59:36Z';
// JSON inference creates a union with optional undefined map keys; the actual
// snapshot stores only string-valued entries, matching the runtime file type.
const prompts = snapshot.prompts as unknown as StringsPrompt[];
const doctor = prompts.find(
  prompt => prompt.id === 'skill-doctor-slash-command'
)!;
const reminder = prompts.find(
  prompt =>
    prompt.id === 'system-reminder-directory-sync-restored-files-mismatch'
)!;

/** Load a real snapshot through the production Markdown/matcher pipeline. */
async function loadPrompt(
  prompt: StringsPrompt,
  edit: (body: string) => string = body => body
) {
  vi.mocked(downloadStringsFile).mockResolvedValue({
    version: VERSION,
    prompts: [prompt],
  });
  vi.mocked(fs.readFile).mockResolvedValue(
    edit(generateMarkdownFromPrompt(prompt))
  );
  expect((await preloadStringsFile(VERSION)).success).toBe(true);
  return (await loadSystemPromptsWithRegex(VERSION, BUILD_TIME))[0];
}

/** Reconstruct a shipped-source fixture without duplicating the large prompt. */
function sourceFor(prompt: StringsPrompt, identifiers: string[]): string {
  return applyIdentifierMapping(
    reconstructContentFromPieces(
      prompt.pieces,
      prompt.identifiers,
      prompt.identifierMap
    ),
    prompt.identifiers,
    prompt.identifierMap,
    identifiers,
    VERSION,
    BUILD_TIME,
    prompt.pieces
  );
}

describe('2.1.282 prompt build compatibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    './src/plugins/functionHooks/hooks-worker/hooks-worker.js',
    '/$bunfs/root/src/plugins/functionHooks/hooks-worker/hooks-worker.js',
    'B:/~BUN/root/src/plugins/functionHooks/hooks-worker/hooks-worker.js',
  ])(
    'matches doctor and preserves the target worker URL: %s',
    async workerUrl => {
      const data = await loadPrompt(
        doctor,
        markdown => markdown + '\nCustomized doctor guidance.\n'
      );
      const source = sourceFor(doctor, ['hostCheck']).replace(
        'HOOKS_WORKER_URL:"./src/plugins/functionHooks/hooks-worker/hooks-worker.js"',
        `HOOKS_WORKER_URL:"${workerUrl}"`
      );
      const match = new RegExp(data.regex, 'si').exec(source);
      expect(match).not.toBeNull();
      expect(match!.slice(1)).toEqual(['hostCheck']);
      const replacement = data.getInterpolatedContent(match!);
      expect(replacement).toContain(`HOOKS_WORKER_URL:"${workerUrl}"`);
      expect(replacement).toContain('Customized doctor guidance.');
      expect(replacement).not.toContain(
        'IS_DESKTOP_DRIVEN_EXTERNAL_HOST_SESSION_FN'
      );
      // A customized prompt must remain executable JS, not merely match. The
      // doctor uses the build object's VERSION; evaluating both session branches
      // also catches broken interpolation/quote handling in the replacement.
      for (const hosted of [false, true]) {
        const evaluate = new Function(
          'hostCheck',
          `return \`${replacement}\`;`
        );
        expect(evaluate(() => hosted)).toContain('Customized doctor guidance.');
      }
    }
  );

  it('keeps identifier captures aligned on both sides of a worker property', () => {
    const regex = new RegExp(
      buildSearchRegexFromPieces(
        [
          'Before ${',
          '} ${({HOOKS_WORKER_URL:"./worker.js",VERSION:"<<CCVERSION>>"}).VERSION} after ${',
          '}',
        ],
        VERSION
      )
    );
    const source =
      'Before ${a$} ${({HOOKS_WORKER_URL:"/$bunfs/root/worker.js",VERSION:"2.1.282"}).VERSION} after ${b$}';
    expect(regex.exec(source)?.slice(1)).toEqual(['a$', 'b$']);
    // No wildcard may consume another property or an unterminated JS string.
    expect(regex.test(source.replace(',VERSION:', ',EXTRA:1,VERSION:'))).toBe(
      false
    );
    expect(
      regex.test(source.replace('root/worker.js', 'root/\nworker.js'))
    ).toBe(false);
  });

  it('keeps multiple worker properties literal when their correspondence is ambiguous', () => {
    const source =
      'First ${({HOOKS_WORKER_URL:"./a.js"})} second ${({HOOKS_WORKER_URL:"./b.js"})}';
    const regex = new RegExp(buildSearchRegexFromPieces([source], VERSION));
    expect(regex.test(source)).toBe(true);
    expect(regex.test(source.replace('./a.js', '/$bunfs/a.js'))).toBe(false);
  });

  it('does not rewrite an identical worker property quoted in custom prose', async () => {
    const property =
      'HOOKS_WORKER_URL:"./src/plugins/functionHooks/hooks-worker/hooks-worker.js"';
    const data = await loadPrompt(
      doctor,
      markdown => markdown + `\nKeep this example literal: ${property}\n`
    );
    const source = sourceFor(doctor, ['hostCheck']).replace(
      property,
      'HOOKS_WORKER_URL:"/$bunfs/root/worker.js"'
    );
    const match = new RegExp(data.regex, 'si').exec(source)!;
    const replacement = data.getInterpolatedContent(match);
    expect(replacement).toContain('HOOKS_WORKER_URL:"/$bunfs/root/worker.js"');
    expect(replacement).toContain(`Keep this example literal: ${property}`);
  });

  it('preserves an explicitly customized worker URL rather than overwriting it', async () => {
    const data = await loadPrompt(doctor, markdown =>
      markdown.replace(
        'HOOKS_WORKER_URL:"./src/plugins/functionHooks/hooks-worker/hooks-worker.js"',
        'HOOKS_WORKER_URL:"./custom-worker.js"'
      )
    );
    const source = sourceFor(doctor, ['hostCheck']).replace(
      './src/plugins/functionHooks/hooks-worker/hooks-worker.js',
      '/$bunfs/root/worker.js'
    );
    const match = new RegExp(data.regex, 'si').exec(source)!;
    expect(data.getInterpolatedContent(match)).toContain(
      'HOOKS_WORKER_URL:"./custom-worker.js"'
    );
  });

  it.each(['Bo', 'WOs', '$display'])(
    'captures and rebinds the directory-sync formatter %s',
    async formatter => {
      const data = await loadPrompt(
        reminder,
        markdown => markdown + '\nCustomized recovery guidance.\n'
      );
      const source = sourceFor(reminder, [
        'formatPaths',
        'syncResult',
        'syncResult',
        formatter,
      ]);
      const match = new RegExp(data.regex, 'si').exec(source);
      expect(match?.slice(1)).toEqual([
        'formatPaths',
        'syncResult',
        'syncResult',
        formatter,
      ]);
      const replacement = data.getInterpolatedContent(match!);
      expect(replacement).toContain(`show:${formatter}`);
      expect(replacement).not.toContain('FORMAT_RESTORED_PATH_FN');
      const evaluate = new Function(
        'formatPaths',
        'syncResult',
        formatter,
        `return \`${replacement}\`;`
      );
      const rendered = evaluate(
        (paths: string[], options: { show: (path: string) => string }) =>
          paths.map(options.show).join(', '),
        { restored: { files: ['example.ts'], filesTruncated: false } },
        (path: string) => `[${path}]`
      );
      expect(rendered).toContain('[example.ts]');
      expect(rendered).toContain('Customized recovery guidance.');
    }
  );

  it('detects identifier drift in Markdown generated from the old reminder snapshot', () => {
    // The snapshot keeps its CC version. Existing sync's identifier-drift gate
    // must still recognize old Markdown even without a version-number change.
    const oldContent = reconstructContentFromPieces(
      reminder.pieces,
      reminder.identifiers,
      reminder.identifierMap
    ).replace('FORMAT_RESTORED_PATH_FN', 'WOs');
    expect(hasIdentifierDrift(oldContent, reminder.identifierMap)).toBe(true);
  });
});
