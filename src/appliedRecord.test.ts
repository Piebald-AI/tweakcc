import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Point the record at a private directory, so clearAppliedRecord() can never
// delete a developer's real applied.json, whatever TWEAKCC_CONFIG_DIR says.
vi.mock('./config', async importOriginal => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'tweakcc-record-'));
  return {
    ...(await importOriginal<typeof import('./config')>()),
    APPLIED_RECORD_FILE: join(dir, 'applied.json'),
    ensureConfigDir: async () => {},
  };
});

import {
  clearAppliedRecord,
  isRecordedBinary,
  readAppliedRecord,
  recordAppliedBinary,
} from './appliedRecord';
import { APPLIED_RECORD_FILE } from './config';

describe('applied record', () => {
  it('reads a damaged record as empty', async () => {
    const file = APPLIED_RECORD_FILE;
    for (const text of ['null', '[]', '{"binaries":null}', '{"bina']) {
      await fs.writeFile(file, text);
      expect(await readAppliedRecord()).toEqual({ binaries: {} });
    }
  });

  let dir: string;
  let binary: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tweakcc-applied-'));
    binary = path.join(dir, '2.1.296');
    await fs.writeFile(binary, 'patched');
    await clearAppliedRecord();
  });
  afterEach(async () => {
    await clearAppliedRecord();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('recognizes the recorded bytes and nothing else', async () => {
    await recordAppliedBinary(binary, '2.1.296');
    const record = (await readAppliedRecord())!;
    expect(record.binaries[await fs.realpath(binary)].version).toBe('2.1.296');
    expect(await isRecordedBinary(record, binary)).toBe(true);

    await fs.writeFile(binary, 'tampere');
    expect(await isRecordedBinary(record, binary)).toBe(false);
  });

  it('drops entries for binaries that no longer exist', async () => {
    const old = path.join(dir, '2.1.295');
    await fs.writeFile(old, 'old');
    await recordAppliedBinary(old, '2.1.295');
    await fs.rm(old);
    await recordAppliedBinary(binary, '2.1.296');
    expect(Object.keys((await readAppliedRecord())!.binaries)).toEqual([
      await fs.realpath(binary),
    ]);
  });
});
