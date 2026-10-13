import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installSessionStartHook, removeSessionStartHook } from './autoReapply';

describe('SessionStart hook', () => {
  let dir: string;
  const settingsFile = () => path.join(dir, 'settings.json');
  const read = async () =>
    JSON.parse(await fs.readFile(settingsFile(), 'utf8'));
  const other = {
    matcher: '',
    hooks: [{ type: 'command', command: 'echo hi' }],
  };

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tweakcc-hook-'));
    process.env.CLAUDE_CONFIG_DIR = dir;
    await fs.writeFile(
      settingsFile(),
      JSON.stringify({ model: 'opus', hooks: { SessionStart: [other] } })
    );
  });
  afterEach(async () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('installs once next to existing hooks and removes only its own', async () => {
    await installSessionStartHook();
    await installSessionStartHook();
    const installed = await read();
    expect(installed.model).toBe('opus');
    expect(installed.hooks.SessionStart).toHaveLength(2);
    expect(installed.hooks.SessionStart[0]).toEqual(other);
    expect(installed.hooks.SessionStart[1].matcher).toBe('startup|resume');
    expect(installed.hooks.SessionStart[1].hooks[0].command).toMatch(
      / --session-start-check$/
    );

    await removeSessionStartHook();
    expect(await read()).toEqual({
      model: 'opus',
      hooks: { SessionStart: [other] },
    });
  });

  it('keeps the permissions of settings.json, owner-only for a new file', async () => {
    await fs.chmod(settingsFile(), 0o640);
    await installSessionStartHook();
    expect((await fs.stat(settingsFile())).mode & 0o777).toBe(0o640);

    await fs.rm(settingsFile());
    await installSessionStartHook();
    expect((await fs.stat(settingsFile())).mode & 0o777).toBe(0o600);
  });

  it('replaces settings.json atomically and leaves no temporary file', async () => {
    const before = (await fs.stat(settingsFile())).ino;
    await installSessionStartHook();
    expect((await fs.stat(settingsFile())).ino).not.toBe(before);
    expect(await fs.readdir(dir)).toEqual(['settings.json']);
  });
});
