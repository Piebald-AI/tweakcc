import { describe, expect, it } from 'vitest';

const FOOTER_SIZE = 32 + Buffer.byteLength('\n---- Bun! ----\n');

import {
  detectModuleStructSize,
  replaceBunModuleSources,
} from './nativeInstallation';

/** Builds a complete normalized graph with distinct payloads for every pointer. */
function makeGraph(width: 36 | 52, count = 3, modernFlags = false) {
  const tableLength = width * count;
  const payloads: Buffer[] = [];
  const records = Buffer.alloc(tableLength);
  const hashes = modernFlags ? Buffer.alloc(count * 4, 0x17) : Buffer.alloc(0);
  let cursor = tableLength + hashes.length;
  const names: string[] = [];
  for (let index = 0; index < count; index++) {
    const name =
      index === 0 ? '/$bunfs/root/cli' : `/$bunfs/root/chunk-${index}.js`;
    names.push(name);
    const strings = [
      name,
      `export const value = ${index};`,
      `map-${index}`,
      `bytecode-${index}`,
      `module-info-${index}`,
      `origin-${index}`,
    ].slice(0, width === 52 ? 6 : 4);
    strings.forEach((value, pointer) => {
      const bytes = Buffer.from(value);
      records.writeUInt32LE(cursor, index * width + pointer * 8);
      records.writeUInt32LE(bytes.length, index * width + pointer * 8 + 4);
      payloads.push(bytes, Buffer.alloc(1));
      cursor += bytes.length + 1;
    });
    records.set([1, 1, 2, 0], index * width + width - 4);
  }
  const offsets = Buffer.alloc(32);
  offsets.writeBigUInt64LE(BigInt(cursor), 0);
  offsets.writeUInt32LE(0, 8);
  offsets.writeUInt32LE(tableLength, 12);
  offsets.writeUInt32LE(0, 16);
  offsets.writeUInt32LE(modernFlags ? 5 | (1 << 4) | (1 << 5) : 5, 28);
  return {
    data: Buffer.concat([
      records,
      hashes,
      ...payloads,
      offsets,
      Buffer.from('\n---- Bun! ----\n'),
    ]),
    names,
    tableLength,
  };
}

/** Reads the source pointer directly so expected output does not use the writer. */
function sourceAt(data: Buffer, width: number, index: number): Buffer {
  const pointer = index * width + 8;
  const offset = data.readUInt32LE(pointer);
  return data.subarray(offset, offset + data.readUInt32LE(pointer + 4));
}

describe('Bun module record detection', () => {
  it.each([
    [36, 13],
    [52, 9],
    [36, 1],
    [52, 1],
  ] as const)(
    'recognizes %i-byte records with %i modules, including ambiguous lengths',
    (width, count) => {
      const graph = makeGraph(width, count);
      expect(
        detectModuleStructSize(graph.data, {
          offset: 0,
          length: graph.tableLength,
        })
      ).toBe(width);
    }
  );

  it('rejects invalid table lengths and out-of-bounds pointers', () => {
    const graph = makeGraph(52);
    expect(() =>
      detectModuleStructSize(graph.data, { offset: 0, length: 5 })
    ).toThrow();
    expect(() =>
      detectModuleStructSize(graph.data, {
        offset: graph.data.length,
        length: 52,
      })
    ).toThrow();
    graph.data.writeUInt32LE(0xffffffff, 8);
    expect(() =>
      detectModuleStructSize(graph.data, {
        offset: 0,
        length: graph.tableLength,
      })
    ).toThrow();
  });
});

describe.each([36, 52] as const)(
  'targeted source replacement (%i-byte records)',
  width => {
    it.each([
      '',
      'export const value = 9;',
      'export const emoji = "🦆 café";\n'.repeat(50),
    ])(
      'replaces a non-entrypoint source, including empty, same-length and larger source',
      value => {
        const graph = makeGraph(width);
        const original = Buffer.from(graph.data);
        const output = replaceBunModuleSources(graph.data, [
          { index: 1, name: graph.names[1], contents: Buffer.from(value) },
        ]);
        expect(sourceAt(output, width, 1).toString()).toBe(value);
        expect(graph.data).toEqual(original);
        // Unchanged records and all original payloads retain byte positions,
        // preserving opaque bytecode alignment and its internal relative offsets.
        expect(output.subarray(0, width)).toEqual(original.subarray(0, width));
        expect(
          output.subarray(width * 2, original.length - FOOTER_SIZE)
        ).toEqual(original.subarray(width * 2, original.length - FOOTER_SIZE));
        expect(output.subarray(width, width + 8)).toEqual(
          original.subarray(width, width + 8)
        );
        expect(output.subarray(width + 16, width * 2 - 4)).toEqual(
          Buffer.alloc(width - 20)
        );
        expect(output.subarray(width * 2 - 4, width * 2)).toEqual(
          Buffer.from([0, 1, 2, 0])
        );
        const offsets = output.length - FOOTER_SIZE;
        expect(output.readBigUInt64LE(offsets)).toBe(BigInt(offsets));
        expect(output.subarray(offsets + 8)).toEqual(
          original.subarray(original.length - FOOTER_SIZE + 8)
        );
      }
    );

    it('invalidates only changed source hashes and clears contiguous-source flags', () => {
      const graph = makeGraph(width, 3, true);
      const output = replaceBunModuleSources(graph.data, [
        { index: 1, name: graph.names[1], contents: Buffer.from('export {};') },
      ]);
      expect(output.readUInt32LE(graph.tableLength)).toBe(0x17171717);
      expect(output.readUInt32LE(graph.tableLength + 4)).toBe(0);
      expect(output.readUInt32LE(graph.tableLength + 8)).toBe(0x17171717);
      expect(output.readUInt32LE(output.length - FOOTER_SIZE + 28)).toBe(
        5 | (1 << 5)
      );
    });

    it('preserves every byte and cache on empty or byte-identical edits', () => {
      const graph = makeGraph(width);
      expect(replaceBunModuleSources(graph.data, [])).toBe(graph.data);
      expect(
        replaceBunModuleSources(graph.data, [
          {
            index: 1,
            name: graph.names[1],
            contents: sourceAt(graph.data, width, 1),
          },
        ])
      ).toBe(graph.data);
    });

    it('replaces multiple modules without depending on replacement order', () => {
      const graph = makeGraph(width);
      const output = replaceBunModuleSources(graph.data, [
        { index: 2, name: graph.names[2], contents: Buffer.from('export {};') },
        {
          index: 0,
          name: graph.names[0],
          contents: Buffer.from('console.log("new entry");'),
        },
      ]);
      expect(sourceAt(output, width, 0).toString()).toBe(
        'console.log("new entry");'
      );
      expect(sourceAt(output, width, 2).toString()).toBe('export {};');
      expect(sourceAt(output, width, 1)).toEqual(
        sourceAt(graph.data, width, 1)
      );
    });

    it('rejects binary assets even when named like the Claude entrypoint', () => {
      const graph = makeGraph(width);
      graph.data[width - 3] = 5;
      expect(() =>
        replaceBunModuleSources(graph.data, [
          {
            index: 0,
            name: graph.names[0],
            contents: Buffer.from('export {};'),
          },
        ])
      ).toThrow(/non-JavaScript/);
    });

    it('rejects invalid identities, duplicate targets, binary modules and encodings', () => {
      const graph = makeGraph(width);
      const replacement = {
        index: 1,
        name: graph.names[1],
        contents: Buffer.from('export {};'),
      };
      expect(() =>
        replaceBunModuleSources(graph.data, [{ ...replacement, index: -1 }])
      ).toThrow();
      expect(() =>
        replaceBunModuleSources(graph.data, [{ ...replacement, index: 1.5 }])
      ).toThrow();
      expect(() =>
        replaceBunModuleSources(graph.data, [{ ...replacement, index: 8 }])
      ).toThrow();
      expect(() =>
        replaceBunModuleSources(graph.data, [
          { ...replacement, name: 'chunk-1.js' },
        ])
      ).toThrow(/name mismatch/);
      expect(() =>
        replaceBunModuleSources(graph.data, [replacement, replacement])
      ).toThrow(/Duplicate/);
      expect(() =>
        replaceBunModuleSources(graph.data, [
          { ...replacement, contents: Buffer.from([0xff]) },
        ])
      ).toThrow(/UTF-8/);
      expect(() =>
        replaceBunModuleSources(graph.data, [
          { ...replacement, contents: Buffer.from([0]) },
        ])
      ).toThrow(/NUL/);
      graph.data[width * 2 - 3] = 5;
      expect(() => replaceBunModuleSources(graph.data, [replacement])).toThrow(
        /non-JavaScript/
      );
      graph.data[width * 2 - 3] = 1;
      graph.data[width * 2 - 4] = 9;
      expect(() => replaceBunModuleSources(graph.data, [replacement])).toThrow(
        /encoding/
      );
    });
  }
);
