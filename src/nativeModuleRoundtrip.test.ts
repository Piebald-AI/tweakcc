import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  extractClaudeJsModulesFromNativeInstallation as extract,
  repackNativeInstallationModules as repack,
} from './nativeInstallation';

const hasBun = spawnSync('bun', ['--version'], { timeout: 5000 }).status === 0;

// Bun is optional for development and CI. These tests compile only their own
// source into a fresh temp directory; they never discover or alter installed CC.
describe.skipIf(!hasBun)('compiled multi-module native round trip', () => {
  let directory: string;
  let input: string;

  beforeAll(() => {
    directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tweakcc-native-modules-')
    );
    input = path.join(
      directory,
      process.platform === 'win32' ? 'original.exe' : 'original'
    );
    fs.writeFileSync(
      path.join(directory, 'entry.js'),
      'console.log((await import("./part.js")).value);'
    );
    fs.writeFileSync(
      path.join(directory, 'part.js'),
      'export const value = "original-value";'
    );
    const build = spawnSync(
      'bun',
      [
        'build',
        '--compile',
        '--splitting',
        '--bytecode',
        '--format=esm',
        '--no-compile-autoload-dotenv',
        '--no-compile-autoload-bunfig',
        '--outfile',
        input,
        path.join(directory, 'entry.js'),
      ],
      { encoding: 'utf8', timeout: 30000 }
    );
    expect(build.status, build.stderr).toBe(0);
  }, 40000);

  afterAll(() => {
    // Only this test's exclusively created directory is eligible for cleanup.
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  });

  it('executes a changed chunk with new bindings, exports, await and Unicode', () => {
    const before = extract(input);
    expect(before).not.toBeNull();
    const target = before!.modules.find(
      module =>
        module.isJavaScript &&
        !module.isEntrypoint &&
        module.contents.includes(Buffer.from('original-value'))
    );
    expect(target).toBeDefined();
    const contents = Buffer.from(
      'const text = await Promise.resolve("🦆 café"); export const value = text; export const extra = 42;'
    );
    const output = path.join(
      directory,
      process.platform === 'win32' ? 'patched.exe' : 'patched'
    );
    repack(
      input,
      {
        sourceSha256: before!.sourceSha256,
        modules: [{ index: target!.index, name: target!.name, contents }],
      },
      output
    );
    const after = extract(output)!;
    expect(after.modules.length).toBe(before!.modules.length);
    for (const module of before!.modules) {
      const actual = after.modules[module.index];
      expect(actual.name).toBe(module.name);
      expect(actual.contents).toEqual(
        module.index === target!.index ? contents : module.contents
      );
    }
    expect(extract(input)!.sourceSha256).toBe(before!.sourceSha256);
    const originalRun = spawnSync(input, [], {
      encoding: 'utf8',
      timeout: 10000,
    });
    const patchedRun = spawnSync(output, [], {
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(originalRun.status, originalRun.stderr).toBe(0);
    expect(originalRun.stdout.trim()).toBe('original-value');
    expect(patchedRun.status, patchedRun.stderr).toBe(0);
    expect(patchedRun.stdout.trim()).toBe('🦆 café');
  }, 30000);

  it.skipIf(process.platform !== 'linux')(
    'uses the verified ELF snapshot if the input changes after the last check',
    () => {
      const mutableInput = path.join(directory, 'concurrently-updated');
      fs.copyFileSync(input, mutableInput);
      const before = extract(mutableInput)!;
      const bytes = fs.readFileSync(mutableInput);
      const output = path.join(directory, 'snapshot-output');
      const read = fs.readFileSync;
      let inputReads = 0;
      // Simulate an updater replacing bytes immediately after the last digest
      // read. A third raw read by the ELF writer would mix two executables.
      const spy = vi.spyOn(fs, 'readFileSync').mockImplementation(((
        ...args: Parameters<typeof fs.readFileSync>
      ) => {
        const result = Reflect.apply(read, fs, args);
        if (args[0] === mutableInput && ++inputReads === 2) {
          const changed = Buffer.from(bytes);
          changed[0x100] ^= 0xff;
          fs.writeFileSync(mutableInput, changed);
        }
        return result;
      }) as typeof fs.readFileSync);
      try {
        repack(
          mutableInput,
          { sourceSha256: before.sourceSha256, modules: [] },
          output
        );
        expect(inputReads).toBe(2);
      } finally {
        spy.mockRestore();
      }
      expect(fs.readFileSync(output)[0x100]).toBe(bytes[0x100]);
      expect(fs.readFileSync(mutableInput)[0x100]).not.toBe(bytes[0x100]);
    }
  );

  it('rejects a stale source digest without creating output', () => {
    const output = path.join(directory, 'must-not-exist');
    expect(() =>
      repack(input, { sourceSha256: '0'.repeat(64), modules: [] }, output)
    ).toThrow(/changed since/);
    expect(fs.existsSync(output)).toBe(false);
  });
});
