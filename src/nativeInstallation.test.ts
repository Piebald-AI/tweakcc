import { describe, expect, it } from 'vitest';

import {
  buildModuleReplacements,
  computeBunSectionPlacement,
  isChunkModule,
  MODULE_BOUNDARY,
  replaceTailBunSection,
  splitModulePayload,
} from './nativeInstallation';

// Real Claude Code 2.1.218 native (ELF) numbers, read via readelf:
//   RW PT_LOAD: vaddr 0x524f1a0, fileoff 0x504f1a0, filesz/memsz 0xb42ae60
//   -> segment mem-end (rwEnd) = 0x1067a000 (also the topmost LOAD end here)
//   LIEF.nextVirtualAddress() = 0x20000000 (rounds up to a 256MB boundary)
//   new .bun content = 0xb231a61, pageSize 0x1000
const REAL_218 = {
  rwVirtualAddress: 0x524f1a0n,
  rwVirtualSize: 0xb42ae60n,
  rwFileOffset: 0x504f1a0n,
  rwFileSize: 0xb42ae60n,
  topmostLoadEnd: 0x1067a000n,
  nextVirtualAddress: 0x20000000n,
  newContentSize: 0xb231a61n,
  pageSize: 0x1000n,
};

function makeReplaceableElf(): Buffer {
  const file = Buffer.alloc(0x6000);
  file.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
  file.writeBigUInt64LE(0x40n, 32); // e_phoff
  file.writeBigUInt64LE(0x5000n, 40); // e_shoff
  file.writeUInt16LE(56, 54); // e_phentsize
  file.writeUInt16LE(1, 56); // e_phnum
  file.writeUInt16LE(64, 58); // e_shentsize
  file.writeUInt16LE(2, 60); // e_shnum

  // Sole PT_LOAD: RW, file [0x1000, 0x4000), vaddr [0x500000, 0x503000)
  file.writeUInt32LE(1, 0x40);
  file.writeUInt32LE(6, 0x44);
  file.writeBigUInt64LE(0x1000n, 0x48);
  file.writeBigUInt64LE(0x500000n, 0x50);
  file.writeBigUInt64LE(0x3000n, 0x60);
  file.writeBigUInt64LE(0x3000n, 0x68);

  // .bun section: final page of the RW LOAD, old logical size 0x900.
  const bunHeader = 0x5000 + 64;
  file.writeUInt32LE(1, bunHeader);
  file.writeBigUInt64LE(0x502000n, bunHeader + 16);
  file.writeBigUInt64LE(0x3000n, bunHeader + 24);
  file.writeBigUInt64LE(0x900n, bunHeader + 32);

  // File-only tail section that must move with the section table.
  file.writeUInt32LE(1, 0x5000);
  file.writeBigUInt64LE(0x4200n, 0x5000 + 24);
  file.writeBigUInt64LE(0x100n, 0x5000 + 32);
  file.fill(0xab, 0x4200, 0x4300);
  return file;
}

describe('replaceTailBunSection', () => {
  it('replaces a tail .bun allocation and shifts file-only metadata by the aligned delta', () => {
    const result = replaceTailBunSection({
      file: makeReplaceableElf(),
      bunFileOffset: 0x3000n,
      bunVirtualAddress: 0x502000n,
      bunSize: 0x900n,
      rwFileOffset: 0x1000n,
      rwVirtualAddress: 0x500000n,
      rwFileSize: 0x3000n,
      rwVirtualSize: 0x3000n,
      pageSize: 0x1000n,
      newSectionData: Buffer.alloc(0x1800, 0xcd),
    });

    expect(result).not.toBeNull();
    const output = result!;
    expect(output.length).toBe(0x7000);
    expect(output.subarray(0x3000, 0x4800)).toEqual(Buffer.alloc(0x1800, 0xcd));
    expect(output.readBigUInt64LE(40)).toBe(0x6000n);
    expect(output.readBigUInt64LE(0x40 + 32)).toBe(0x4000n);
    expect(output.readBigUInt64LE(0x40 + 40)).toBe(0x4000n);
    expect(output.readBigUInt64LE(0x6000 + 24)).toBe(0x5200n);
    expect(output.readBigUInt64LE(0x6000 + 64 + 32)).toBe(0x1800n);
    expect(output.subarray(0x5200, 0x5300)).toEqual(Buffer.alloc(0x100, 0xab));
  });

  it('reuses the existing allocation without growing the binary when the rebuilt .bun fits in its page', () => {
    const result = replaceTailBunSection({
      file: makeReplaceableElf(),
      bunFileOffset: 0x3000n,
      bunVirtualAddress: 0x502000n,
      bunSize: 0x900n,
      rwFileOffset: 0x1000n,
      rwVirtualAddress: 0x500000n,
      rwFileSize: 0x3000n,
      rwVirtualSize: 0x3000n,
      pageSize: 0x1000n,
      newSectionData: Buffer.alloc(0x800, 0xef),
    });

    expect(result).not.toBeNull();
    expect(result!.length).toBe(0x6000);
    expect(result!.readBigUInt64LE(0x5000 + 64 + 32)).toBe(0x800n);
  });

  it('declines a `.bun` whose allocation does not reach the writable segment end', () => {
    const result = replaceTailBunSection({
      file: makeReplaceableElf(),
      bunFileOffset: 0x3000n,
      bunVirtualAddress: 0x502000n,
      bunSize: 0x900n,
      rwFileOffset: 0x1000n,
      rwVirtualAddress: 0x500000n,
      rwFileSize: 0x3000n,
      rwVirtualSize: 0x4000n,
      pageSize: 0x1000n,
      newSectionData: Buffer.alloc(0x1800),
    });

    expect(result).toBeNull();
  });

  it('declines layouts where another loadable segment reaches into the moved tail', () => {
    const file = makeReplaceableElf();
    file.writeUInt16LE(2, 56);
    file.writeUInt32LE(1, 0x40 + 56);
    file.writeBigUInt64LE(0x3f00n, 0x40 + 56 + 8);
    file.writeBigUInt64LE(0x600000n, 0x40 + 56 + 16);
    file.writeBigUInt64LE(0x200n, 0x40 + 56 + 32);
    const result = replaceTailBunSection({
      file,
      bunFileOffset: 0x3000n,
      bunVirtualAddress: 0x502000n,
      bunSize: 0x900n,
      rwFileOffset: 0x1000n,
      rwVirtualAddress: 0x500000n,
      rwFileSize: 0x3000n,
      rwVirtualSize: 0x3000n,
      pageSize: 0x1000n,
      newSectionData: Buffer.alloc(0x1800),
    });

    expect(result).toBeNull();
  });
});

describe('computeBunSectionPlacement', () => {
  it('places the new .bun right after the writable segment when it is topmost (no zero-padding gap)', () => {
    const p = computeBunSectionPlacement(REAL_218);

    expect(p.compact).toBe(true);
    // immediately after the segment mem-end, page-aligned
    expect(p.newVaddr).toBe(0x1067a000n);
    // gap-free: the file only grows by the (aligned) new section size
    expect(p.extensionSize).toBe(p.alignedNewSize);
  });

  it('preserves the segment vaddr/fileoffset skew (keeps the ELF mapping valid)', () => {
    const p = computeBunSectionPlacement(REAL_218);
    const oldSkew = REAL_218.rwVirtualAddress - REAL_218.rwFileOffset;
    expect(p.newVaddr - p.newFileOffset).toBe(oldSkew);
  });

  it('never overlaps an existing segment (newVaddr >= topmost LOAD end)', () => {
    const p = computeBunSectionPlacement(REAL_218);
    expect(p.newVaddr >= REAL_218.topmostLoadEnd).toBe(true);
  });

  it('reclaims the ~262MB gap the nextVirtualAddress placement would have left', () => {
    const compact = computeBunSectionPlacement(REAL_218);
    // what the old code produced: newVaddr = align(nextVirtualAddress, page)
    const oldNewVaddr = 0x20000000n;
    const oldOffsetInSegment = oldNewVaddr - REAL_218.rwVirtualAddress;
    const oldNewFileOffset = REAL_218.rwFileOffset + oldOffsetInSegment;
    const oldRwFileEnd = REAL_218.rwFileOffset + REAL_218.rwFileSize;
    const oldExtension =
      oldNewFileOffset + compact.alignedNewSize - oldRwFileEnd;
    // the compact placement must save at least ~250MB of file
    expect(oldExtension - compact.extensionSize).toBeGreaterThan(250_000_000n);
  });

  it('falls back to nextVirtualAddress when the writable segment is NOT topmost', () => {
    // A higher LOAD segment exists above RW: compact placement would overlap it,
    // so the general-position-safe nextVirtualAddress placement must be used.
    const notTopmost = { ...REAL_218, topmostLoadEnd: 0x18000000n };
    const p = computeBunSectionPlacement(notTopmost);

    expect(p.compact).toBe(false);
    expect(p.newVaddr).toBe(0x20000000n); // align(nextVirtualAddress, page)
    expect(p.newVaddr >= notTopmost.topmostLoadEnd).toBe(true);
  });

  it('uses memsz (not filesz) for the segment end so a BSS tail is not overlapped', () => {
    // Hypothetical segment with a BSS gap: memsz > filesz. rwFileSize stays at
    // REAL_218's filesz; only memsz (and the matching topmost end) grow.
    const bssEnd = 0x524f1a0n + 0xb42ae60n + 0x10000n; // page-aligned
    const withBss = {
      ...REAL_218,
      rwVirtualSize: 0xb42ae60n + 0x10000n, // memsz extends past filesz
      topmostLoadEnd: bssEnd,
    };
    const p = computeBunSectionPlacement(withBss);
    // Must stay compact and land exactly at the memory end. If the segment end
    // were computed from filesz, rwMemEnd would fall below topmostLoadEnd, flip
    // compact to false, and silently revert to the nextVirtualAddress bloat.
    expect(p.compact).toBe(true);
    expect(p.newVaddr).toBe(bssEnd);
    // skew still preserved
    expect(p.newVaddr - p.newFileOffset).toBe(
      withBss.rwVirtualAddress - withBss.rwFileOffset
    );
  });

  it('page-aligns (rounds up) the compact placement when the segment mem-end is unaligned', () => {
    // mem-end no longer page-aligned: the placement must round UP to a page.
    const memEnd = 0x524f1a0n + 0xb42ae60n + 0x800n; // 0x1067a800, unaligned
    const unaligned = {
      ...REAL_218,
      rwVirtualSize: 0xb42ae60n + 0x800n,
      topmostLoadEnd: memEnd,
    };
    const p = computeBunSectionPlacement(unaligned);
    expect(p.compact).toBe(true);
    expect(p.newVaddr % REAL_218.pageSize).toBe(0n); // page-aligned
    expect(p.newVaddr).toBe(0x1067b000n); // rounded up from 0x1067a800
    expect(p.newVaddr > memEnd).toBe(true);
  });

  it('page-aligns the fallback placement when nextVirtualAddress is unaligned', () => {
    const notTopmost = {
      ...REAL_218,
      topmostLoadEnd: 0x18000000n, // RW not topmost -> fallback path
      nextVirtualAddress: 0x20000800n, // unaligned
    };
    const p = computeBunSectionPlacement(notTopmost);
    expect(p.compact).toBe(false);
    expect(p.newVaddr % REAL_218.pageSize).toBe(0n);
    expect(p.newVaddr).toBe(0x20001000n); // align(0x20000800, page)
  });
});

describe('isChunkModule', () => {
  it('recognizes the code-split chunks emitted by Bun', () => {
    expect(isChunkModule('/$bunfs/root/chunk-zrs5zyqa.js')).toBe(true);
    expect(isChunkModule('B:/~BUN/root/chunk-b08jpphw.js')).toBe(true);
    expect(isChunkModule('chunk-abc123.js')).toBe(true);
  });

  it('does not claim the entrypoint or ordinary modules', () => {
    expect(isChunkModule('/$bunfs/root/cli')).toBe(false);
    expect(isChunkModule('/$bunfs/root/claude')).toBe(false);
    expect(isChunkModule('/$bunfs/root/chart.umd.min.js')).toBe(false);
    expect(isChunkModule('/$bunfs/root/image-processor.node')).toBe(false);
    // A directory named like a chunk must not drag its children in.
    expect(isChunkModule('/$bunfs/root/chunk-abc.js/nested.js')).toBe(false);
  });
});

describe('splitModulePayload', () => {
  const join = (parts: Array<[string, string]>) =>
    parts.map(([n, b]) => `${MODULE_BOUNDARY}${n}\n${b}`).join('');

  it('returns null for a single-module payload so legacy binaries are untouched', () => {
    expect(splitModulePayload('var a=1;')).toBeNull();
    expect(splitModulePayload('')).toBeNull();
  });

  it('round-trips names and bodies exactly', () => {
    const parts: Array<[string, string]> = [
      ['/$bunfs/root/cli', 'var a=1;'],
      ['/$bunfs/root/chunk-a.js', 'var b=2;\nvar c=3;'],
      ['/$bunfs/root/chunk-b.js', ''],
    ];
    expect(splitModulePayload(join(parts))).toEqual(parts);
  });

  it('preserves bodies that contain blank lines and comment-like text', () => {
    const parts: Array<[string, string]> = [
      ['/$bunfs/root/cli', '\n\n// not a boundary\n'],
      ['/$bunfs/root/chunk-a.js', '//#__tweakcc_module__ without colon'],
    ];
    expect(splitModulePayload(join(parts))).toEqual(parts);
  });

  it('survives a patch that changes a body length', () => {
    const parts: Array<[string, string]> = [
      ['/$bunfs/root/chunk-a.js', 'var x=200000;'],
      ['/$bunfs/root/chunk-b.js', 'var y=1;'],
    ];
    const patched = join(parts).replace(
      'var x=200000;',
      'var x=(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||200000);'
    );
    expect(splitModulePayload(patched)).toEqual([
      [
        '/$bunfs/root/chunk-a.js',
        'var x=(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||200000);',
      ],
      ['/$bunfs/root/chunk-b.js', 'var y=1;'],
    ]);
  });

  it('throws rather than mis-split a malformed boundary', () => {
    expect(() =>
      splitModulePayload(`${MODULE_BOUNDARY}no-newline-after-name`)
    ).toThrow(/Malformed tweakcc module boundary/);
  });
});

describe('buildModuleReplacements', () => {
  // The names a code-split binary would hand to the payload.
  const BINARY = [
    '/$bunfs/root/cli',
    '/$bunfs/root/chunk-a.js',
    '/$bunfs/root/chunk-b.js',
  ];
  const payload = (parts: Array<[string, string]>) =>
    parts.map(([n, b]) => `${MODULE_BOUNDARY}${n}\n${b}`).join('');
  const split = (parts: Array<[string, string]>) =>
    splitModulePayload(payload(parts))!;

  it("accepts a payload naming exactly the binary's modules", () => {
    const parts: Array<[string, string]> = [
      ['/$bunfs/root/cli', 'var a=1;'],
      ['/$bunfs/root/chunk-a.js', 'var b=2;'],
      ['/$bunfs/root/chunk-b.js', 'var c=3;'],
    ];
    const out = buildModuleReplacements(split(parts), BINARY);
    expect([...out.keys()].sort()).toEqual([...BINARY].sort());
    expect(out.get('/$bunfs/root/chunk-a.js')?.toString('utf8')).toBe(
      'var b=2;'
    );
  });

  it('accepts modules in a different order than the binary lists them', () => {
    const parts: Array<[string, string]> = [
      ['/$bunfs/root/chunk-b.js', 'var c=3;'],
      ['/$bunfs/root/cli', 'var a=1;'],
      ['/$bunfs/root/chunk-a.js', 'var b=2;'],
    ];
    expect(() => buildModuleReplacements(split(parts), BINARY)).not.toThrow();
  });

  // A patch that clobbers a boundary line drops that module from the payload.
  // Writing on would silently keep the module's ORIGINAL contents.
  it("rejects a payload missing one of the binary's modules", () => {
    const parts: Array<[string, string]> = [
      ['/$bunfs/root/cli', 'var a=1;'],
      ['/$bunfs/root/chunk-a.js', 'var b=2;'],
    ];
    expect(() => buildModuleReplacements(split(parts), BINARY)).toThrow(
      /missing 1 module\(s\).*chunk-b\.js/s
    );
  });

  // Map construction keeps the LAST value, so a repeated name would silently
  // discard the edits made to the earlier copy.
  it('rejects a payload naming the same module twice', () => {
    const parts: Array<[string, string]> = [
      ['/$bunfs/root/cli', 'var a=1;'],
      ['/$bunfs/root/chunk-a.js', 'var b=2;'],
      ['/$bunfs/root/chunk-b.js', 'var c=3;'],
      ['/$bunfs/root/chunk-a.js', 'var b=999;'],
    ];
    expect(() => buildModuleReplacements(split(parts), BINARY)).toThrow(
      /more than once.*chunk-a\.js/s
    );
  });

  // rebuildBunData looks replacements up by name, so a name the binary does
  // not have is never consulted and its edits vanish without a trace.
  it('rejects a payload naming a module the binary does not have', () => {
    const parts: Array<[string, string]> = [
      ['/$bunfs/root/cli', 'var a=1;'],
      ['/$bunfs/root/chunk-a.js', 'var b=2;'],
      ['/$bunfs/root/chunk-b.js', 'var c=3;'],
      ['/$bunfs/root/chunk-typo.js', 'var d=4;'],
    ];
    expect(() => buildModuleReplacements(split(parts), BINARY)).toThrow(
      /absent from the binary.*chunk-typo\.js/s
    );
  });

  it('reports a mangled boundary name as both unknown and missing', () => {
    // Corrupting one name is simultaneously an unknown entry and an absent one;
    // whichever fires, it must not be accepted.
    const parts: Array<[string, string]> = [
      ['/$bunfs/root/cli', 'var a=1;'],
      ['/$bunfs/root/chunk-a.js', 'var b=2;'],
      ['/$bunfs/root/chunk-B.js', 'var c=3;'], // was chunk-b.js
    ];
    expect(() => buildModuleReplacements(split(parts), BINARY)).toThrow();
  });

  it('caps the reported names so a wholesale mismatch stays readable', () => {
    const many = Array.from(
      { length: 30 },
      (_, i) => `/$bunfs/root/chunk-${i}.js`
    );
    expect(() => buildModuleReplacements([], many)).toThrow(/\(30 total\)/);
  });
});
