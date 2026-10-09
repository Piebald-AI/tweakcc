import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  extractNativeInstallationModules,
  findUniqueBufferPointer,
  parseNativeBunGraphPayload,
  serializeNativeBunGraphPayload,
  type NativeBunGraph,
  type NativeBunModuleRecordSize,
} from '../nativeInstallation';

const makeGraph = (
  moduleRecordSize: NativeBunModuleRecordSize = 52
): NativeBunGraph => ({
  entryPointIndex: 1,
  flags: 7,
  compileExecArgv: Buffer.alloc(0),
  moduleRecordSize,
  modules: [
    {
      index: 0,
      name: '/$bunfs/root/chunk-a.js',
      contents: Buffer.from('export const value=1;'),
      sourcemap: Buffer.from('map-a'),
      bytecode: Buffer.from('bytecode-a'),
      moduleInfo: Buffer.from('info-a'),
      bytecodeOriginPath: Buffer.from('/src/a.ts'),
      encoding: 1,
      loader: 1,
      moduleFormat: 1,
      side: 0,
      isEntryPoint: false,
    },
    {
      index: 1,
      name: '/$bunfs/root/cli',
      contents: Buffer.from('import "./chunk-a.js";'),
      sourcemap: Buffer.alloc(0),
      bytecode: Buffer.from('bytecode-cli'),
      moduleInfo: Buffer.from('info-cli'),
      bytecodeOriginPath: Buffer.from('/src/cli.ts'),
      encoding: 1,
      loader: 1,
      moduleFormat: 1,
      side: 0,
      isEntryPoint: true,
    },
  ],
});

const nativeFixture = process.env.CLAUDE_CODE_NATIVE_FIXTURE;

describe('native Bun module graphs', () => {
  it.runIf(nativeFixture !== undefined && fs.existsSync(nativeFixture))(
    'extracts the authoritative module graph from the configured Claude Code fixture',
    () => {
      const graph = extractNativeInstallationModules(nativeFixture!);

      expect(graph).not.toBeNull();
      expect(graph!.modules.length).toBeGreaterThan(1);
      expect(graph!.entryPointIndex).toBeGreaterThanOrEqual(0);
      expect(graph!.modules[graph!.entryPointIndex].name).toBe(
        '/$bunfs/root/cli'
      );
      expect(graph!.moduleRecordSize).toBe(52);
      expect(graph!.flags & 1023).toBe(1023);
    }
  );
  it.each([36, 52] as const)(
    'round-trips a %i-byte module graph and preserves the entrypoint by index',
    moduleRecordSize => {
      const graph = makeGraph(moduleRecordSize);
      const payload = serializeNativeBunGraphPayload(graph, new Map());
      const parsed = parseNativeBunGraphPayload(payload);

      expect(parsed.entryPointIndex).toBe(1);
      expect(parsed.moduleRecordSize).toBe(moduleRecordSize);
      expect(parsed.modules.map(module => module.name)).toEqual(
        graph.modules.map(module => module.name)
      );
      expect(parsed.modules.map(module => module.contents)).toEqual(
        graph.modules.map(module => module.contents)
      );
      if (moduleRecordSize === 36) {
        expect(
          parsed.modules.every(module => module.moduleInfo.length === 0)
        ).toBe(true);
        expect(
          parsed.modules.every(module => module.bytecodeOriginPath.length === 0)
        ).toBe(true);
      }
    }
  );

  it.each([36, 52] as const)(
    'disambiguates valid %i-byte records when the table length fits both layouts',
    moduleRecordSize => {
      const graph = makeGraph(moduleRecordSize);
      const count = moduleRecordSize === 52 ? 9 : 13;
      graph.modules = Array.from({ length: count }, (_, index) => ({
        ...graph.modules[index === 1 ? 1 : 0],
        index,
        name:
          index === 1 ? '/$bunfs/root/cli' : `/$bunfs/root/chunk-${index}.js`,
        isEntryPoint: index === 1,
      }));
      const payload = serializeNativeBunGraphPayload(graph, new Map());
      const parsed = parseNativeBunGraphPayload(payload);
      expect(parsed.moduleRecordSize).toBe(moduleRecordSize);
      expect(parsed.modules.map(module => module.name)).toEqual(
        graph.modules.map(module => module.name)
      );
    }
  );

  it('clears stale compiled fields only for replaced modules', () => {
    const originalPayload = serializeNativeBunGraphPayload(
      makeGraph(),
      new Map()
    );
    const graph = parseNativeBunGraphPayload(originalPayload);
    const unchangedBefore = graph.modules[1];
    const payload = serializeNativeBunGraphPayload(
      graph,
      new Map([
        ['/$bunfs/root/chunk-a.js', Buffer.from('export const value=2;')],
      ])
    );
    const parsed = parseNativeBunGraphPayload(payload);
    const changed = parsed.modules[0];
    const unchanged = parsed.modules[1];

    expect(changed.contents.toString()).toBe('export const value=2;');
    expect(changed.bytecode).toHaveLength(0);
    expect(changed.moduleInfo).toHaveLength(0);
    expect(changed.bytecodeOriginPath).toHaveLength(0);
    expect(changed.sourcemap).toHaveLength(0);
    expect(unchanged.bytecode.toString()).toBe('bytecode-cli');
    expect(unchanged.moduleInfo.toString()).toBe('info-cli');
    expect(unchanged.bytecodeOffset).toBe(unchangedBefore.bytecodeOffset);
    expect(payload).toHaveLength(originalPayload.length);
    const originalOffsetsStart = originalPayload.length - 16 - 32;
    const replacementOffsetsStart = payload.length - 16 - 32;
    expect(payload.readUInt32LE(replacementOffsetsStart + 8)).toBe(
      originalPayload.readUInt32LE(originalOffsetsStart + 8)
    );
  });

  it('fits a grown module into regions freed by other replaced modules', () => {
    // Real chunks carry bytecode several times larger than their source. The
    // cli replacement fits none of cli's own regions, but it does fit the
    // bytecode region freed by replacing chunk-a.
    const base = makeGraph();
    base.modules[0].bytecode = Buffer.alloc(256, 7);
    const originalPayload = serializeNativeBunGraphPayload(base, new Map());
    const graph = parseNativeBunGraphPayload(originalPayload);
    const grown = Buffer.from('import "./chunk-a.js";globalThis.x=1;');
    expect(grown.length).toBeGreaterThan(
      Math.max(
        graph.modules[1].contents.length,
        graph.modules[1].bytecode.length,
        graph.modules[1].moduleInfo.length
      )
    );
    const payload = serializeNativeBunGraphPayload(
      graph,
      new Map([
        ['/$bunfs/root/chunk-a.js', Buffer.from('export const value=2;')],
        ['/$bunfs/root/cli', grown],
      ])
    );
    const parsed = parseNativeBunGraphPayload(payload);
    expect(parsed.modules[0].contents.toString()).toBe('export const value=2;');
    expect(parsed.modules[1].contents.toString()).toBe(grown.toString());
    expect(payload).toHaveLength(originalPayload.length);
  });

  it('appends a replacement too large for any freed region and clears the contiguous-sources flag', () => {
    const originalPayload = serializeNativeBunGraphPayload(
      makeGraph(),
      new Map()
    );
    const graph = parseNativeBunGraphPayload(originalPayload);
    const huge = Buffer.from(`export const value="${'x'.repeat(4096)}";`);
    const payload = serializeNativeBunGraphPayload(
      graph,
      new Map([['/$bunfs/root/chunk-a.js', huge]])
    );
    const parsed = parseNativeBunGraphPayload(payload);
    expect(parsed.modules[0].contents.equals(huge)).toBe(true);
    expect(parsed.modules[0].bytecode).toHaveLength(0);
    // The untouched module keeps its bytecode at the original offset.
    expect(parsed.modules[1].bytecode.toString()).toBe('bytecode-cli');
    expect(parsed.modules[1].bytecodeOffset).toBe(
      graph.modules[1].bytecodeOffset
    );
    expect(payload.length).toBe(originalPayload.length + huge.length + 1);
    const offsetsStart = payload.length - 16 - 32;
    expect(Number(payload.readBigUInt64LE(offsetsStart))).toBe(offsetsStart);
    expect(parsed.flags & (1 << 4)).toBe(0);
    expect(parsed.flags & ~(1 << 4)).toBe(graph.flags & ~(1 << 4));
  });

  it('aligns every retained bytecode pointer for Bun standalone loading', () => {
    const payload = serializeNativeBunGraphPayload(makeGraph(), new Map());
    const parsed = parseNativeBunGraphPayload(payload);

    for (const module of parsed.modules.filter(
      module => module.bytecode.length
    )) {
      expect(module.bytecodeOffset).toBeDefined();
      expect(module.bytecodeOffset! % 128).toBe(120);
    }
  });

  it('rejects replacements for unknown modules', () => {
    expect(() =>
      serializeNativeBunGraphPayload(
        makeGraph(),
        new Map([['/$bunfs/root/missing.js', Buffer.from('nope')]])
      )
    ).toThrow(/unknown module/i);
  });

  it('preserves binary module contents without UTF-8 conversion', () => {
    const graph = makeGraph();
    graph.modules[0].contents = Buffer.from([0, 255, 1, 254, 2]);

    const parsed = parseNativeBunGraphPayload(
      serializeNativeBunGraphPayload(graph, new Map())
    );

    expect(parsed.modules[0].contents).toEqual(graph.modules[0].contents);
  });

  it('rejects duplicate module names before serialization', () => {
    const graph = makeGraph();
    graph.modules[1].name = graph.modules[0].name;

    expect(() => serializeNativeBunGraphPayload(graph, new Map())).toThrow(
      /unique/i
    );
  });

  it('rejects truncated or pointer-invalid payloads', () => {
    expect(() => parseNativeBunGraphPayload(Buffer.alloc(64))).toThrow();

    const payload = serializeNativeBunGraphPayload(makeGraph(), new Map());
    const offsetsStart = payload.length - 16 - 32;
    const modulesOffset = payload.readUInt32LE(offsetsStart + 8);
    payload.writeUInt32LE(payload.length, modulesOffset);
    // Rejected either by the record-layout validator or the pointer check.
    expect(() => parseNativeBunGraphPayload(payload)).toThrow(
      /pointer|record layout/i
    );
  });

  it('rejects an invalid entrypoint index', () => {
    const payload = serializeNativeBunGraphPayload(makeGraph(), new Map());
    const offsetsStart = payload.length - 16 - 32;
    payload.writeUInt32LE(99, offsetsStart + 16);

    expect(() => parseNativeBunGraphPayload(payload)).toThrow(/entrypoint/i);
  });

  it('rejects a divisible module table when neither record layout validates', () => {
    const graph = makeGraph();
    graph.modules = Array.from({ length: 9 }, (_, index) => ({
      ...graph.modules[index === 5 ? 1 : 0],
      index,
      name: `/$bunfs/root/chunk-${index}.js`,
      isEntryPoint: index === 5,
    }));
    graph.entryPointIndex = 5;
    const payload = serializeNativeBunGraphPayload(graph, new Map());
    const offsetsStart = payload.length - 16 - 32;
    const tableStart = payload.readUInt32LE(offsetsStart + 8);
    payload.fill(0, tableStart, tableStart + 468);

    expect(() => parseNativeBunGraphPayload(payload)).toThrow(/ambiguous/i);
  });

  it('finds one unaligned BUN_COMPILED pointer by exact value', () => {
    const pointer = 0x5541000n;
    const content = Buffer.alloc(64);
    content.writeBigUInt64LE(pointer, 13);

    expect(
      findUniqueBufferPointer(
        [{ content, virtualAddress: 0x5300000n }],
        pointer
      )
    ).toBe(0x530000dn);
  });

  it('rejects missing or duplicate BUN_COMPILED pointers', () => {
    const pointer = 0x5541000n;
    const empty = Buffer.alloc(32);
    expect(() =>
      findUniqueBufferPointer([{ content: empty, virtualAddress: 0n }], pointer)
    ).toThrow(/could not find/i);

    const duplicate = Buffer.alloc(32);
    duplicate.writeBigUInt64LE(pointer, 3);
    duplicate.writeBigUInt64LE(pointer, 19);
    expect(() =>
      findUniqueBufferPointer(
        [{ content: duplicate, virtualAddress: 0n }],
        pointer
      )
    ).toThrow(/multiple/i);
  });

  it('rejects malformed module table lengths', () => {
    const payload = serializeNativeBunGraphPayload(makeGraph(), new Map());
    const offsetsStart = payload.length - 16 - 32;
    payload.writeUInt32LE(53, offsetsStart + 12);

    expect(() => parseNativeBunGraphPayload(payload)).toThrow(/record/i);
  });
});
