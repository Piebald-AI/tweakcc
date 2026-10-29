import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import {
  getPromptDataVersion,
  loadStringsFile,
  preloadStringsFile,
} from '../systemPromptSync';
import type { StringsFile } from '../systemPromptSync';
import {
  downloadStringsFile,
  PromptsNotPublishedError,
} from '../systemPromptDownload';

vi.mock('node:fs/promises');
vi.mock('../systemPromptDownload', async importOriginal => ({
  ...(await importOriginal<typeof import('../systemPromptDownload')>()),
  downloadStringsFile: vi.fn(),
}));

const file = (version: string): StringsFile => ({ version, prompts: [] });

/** Serves the given versions; every other version is unpublished. */
const publish = (...versions: string[]) =>
  vi.mocked(downloadStringsFile).mockImplementation(async version => {
    if (versions.includes(version)) return file(version);
    throw new PromptsNotPublishedError(version);
  });

/** Cached prompt files on disk; any other cache read fails. */
const cache = (files: Record<string, string>) =>
  vi.mocked(fs.readFile).mockImplementation((async (filePath: string) => {
    const name = String(filePath).split('/').pop()!;
    if (name in files) return files[name];
    throw new Error(`ENOENT: ${name}`);
  }) as unknown as typeof fs.readFile);

describe('loadStringsFile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.readdir).mockResolvedValue([]);
  });

  it('uses the published file when there is one', async () => {
    publish('2.1.312', '2.1.311');
    const { file: loaded, dataVersion } = await loadStringsFile('2.1.312');
    expect(dataVersion).toBe('2.1.312');
    expect(loaded.version).toBe('2.1.312');
  });

  it('falls back to the newest earlier published patch version', async () => {
    publish('2.1.309', '2.1.308');
    const { dataVersion } = await loadStringsFile('2.1.312');
    expect(dataVersion).toBe('2.1.309');
  });

  it('falls back to the newest earlier cached file when offline', async () => {
    vi.mocked(downloadStringsFile).mockImplementation(async version => {
      if (version === '2.1.312') throw new PromptsNotPublishedError(version);
      throw new Error('Failed to download prompts: fetch failed');
    });
    cache({ 'prompts-2.1.300.json': JSON.stringify(file('2.1.300')) });
    vi.mocked(fs.readdir).mockResolvedValue([
      'prompts-2.1.290.json',
      'prompts-2.1.300.json',
      'prompts-2.1.313.json',
      'notes.txt',
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const { dataVersion } = await loadStringsFile('2.1.312');
    expect(dataVersion).toBe('2.1.300');
  });

  it('skips a cached file that cannot be read', async () => {
    vi.mocked(downloadStringsFile).mockImplementation(async version => {
      if (version === '2.1.312') throw new PromptsNotPublishedError(version);
      throw new Error('Failed to download prompts: fetch failed');
    });
    cache({
      'prompts-2.1.300.json': JSON.stringify(file('2.1.300')),
      'prompts-2.1.305.json': '{"version": "2.1.3', // truncated
    });
    vi.mocked(fs.readdir).mockResolvedValue([
      'prompts-2.1.300.json',
      'prompts-2.1.305.json', // corrupt, and offline
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const { dataVersion } = await loadStringsFile('2.1.312');
    expect(dataVersion).toBe('2.1.300');
    // Cached files are read from disk, not downloaded again.
    expect(downloadStringsFile).not.toHaveBeenCalledWith('2.1.305');
  });

  it('fails as before when no earlier file exists', async () => {
    publish();
    await expect(loadStringsFile('2.1.312')).rejects.toBeInstanceOf(
      PromptsNotPublishedError
    );
  });

  it('does not fall back when the download fails for another reason', async () => {
    vi.mocked(downloadStringsFile).mockRejectedValue(
      new Error('Rate limit exceeded.')
    );
    await expect(loadStringsFile('2.1.312')).rejects.toThrow('Rate limit');
    expect(downloadStringsFile).toHaveBeenCalledTimes(1);
  });

  it('records which version the preloaded data belongs to', async () => {
    publish('2.1.311');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(await preloadStringsFile('2.1.312')).toEqual({ success: true });
    expect(getPromptDataVersion()).toBe('2.1.311');
    expect(log.mock.calls.flat().join('\n')).toContain(
      'tweakcc has no prompt data for Claude Code 2.1.312 yet'
    );
    log.mockRestore();
  });
});
