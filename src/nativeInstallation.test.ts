import { describe, expect, it } from 'vitest';

import { computeBunSectionPlacement } from './nativeInstallation';

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
