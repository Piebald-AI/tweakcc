/**
 * Utilities for extracting and repacking native installation binaries.
 */

import fs from 'node:fs';
import { execSync } from 'node:child_process';
import LIEF from 'node-lief';
import { isDebug, debug } from './utils';

// ============================================================================
// Nix binary wrapper detection
// ============================================================================

/**
 * Maximum file size for a Nix binary wrapper. These are tiny compiled C
 * programs (~5-20KB). Anything larger is definitely not a wrapper.
 */
const NIX_WRAPPER_MAX_SIZE = 200_000;

/**
 * Detects whether a binary is a Nix `makeBinaryWrapper` output and, if so,
 * extracts the path to the real wrapped executable.
 *
 * Nix's `makeBinaryWrapper` generates a small C program that:
 *   1. Manipulates the environment (setenv/unsetenv/putenv)
 *   2. Calls `execv("/nix/store/.../real-binary", argv)`
 *
 * The wrapper always embeds a DOCSTRING in `.rodata` (ELF) or `__cstring`
 * (Mach-O) containing the literal `makeCWrapper` invocation, whose first
 * argument is the real executable path. This is a contractual part of the
 * wrapper format (used by `makeBinaryWrapper.extractCmd`).
 *
 * Detection strategy:
 *   1. Size gate: wrappers are tiny (<200KB), real Bun binaries are multi-MB
 *   2. Symbol gate: wrappers import `execv`, real Bun apps do not
 *   3. Parse the DOCSTRING: `makeCWrapper '/nix/store/.../real-binary' ...`
 *   4. Fallback: find `/nix/store/` paths with `/bin/` in `.rodata`
 *
 * @returns The path to the real wrapped executable, or null if not a wrapper.
 */
export function resolveNixBinaryWrapper(binaryPath: string): string | null {
  try {
    // Gate 1: file size — wrappers are tiny
    const stat = fs.statSync(binaryPath);
    if (stat.size > NIX_WRAPPER_MAX_SIZE) {
      return null;
    }

    LIEF.logging.disable();
    const binary = LIEF.parse(binaryPath);

    // Gate 2: must import execv — the hallmark of a makeBinaryWrapper
    const symbols = binary.symbols();
    const hasExecv = symbols.some(sym => {
      const name = sym.name;
      return name === 'execv' || name === '_execv';
    });

    if (!hasExecv) {
      debug(
        'resolveNixBinaryWrapper: no execv import found, not a Nix wrapper'
      );
      return null;
    }

    debug(
      'resolveNixBinaryWrapper: execv import found, checking for Nix wrapper DOCSTRING'
    );

    // Extract string data from .rodata (ELF) or __TEXT,__cstring (Mach-O)
    let rawBytes: Buffer | null = null;

    if (binary.format === 'ELF') {
      const rodata = binary.sections().find(s => s.name === '.rodata');
      if (rodata) {
        rawBytes = rodata.content;
      }
    } else if (binary.format === 'MachO') {
      const machoBinary = binary as LIEF.MachO.Binary;
      const textSeg = machoBinary.getSegment('__TEXT');
      if (textSeg) {
        const cstring = textSeg.getSection('__cstring');
        if (cstring) {
          rawBytes = cstring.content;
        }
      }
    }

    if (!rawBytes || rawBytes.length === 0) {
      debug('resolveNixBinaryWrapper: could not read string section');
      return null;
    }

    const text = rawBytes.toString('utf-8');

    // Strategy 1: parse the DOCSTRING
    // makeBinaryWrapper always embeds: makeCWrapper '/nix/store/.../real' ...
    const docstringMatch = text.match(/makeCWrapper\s+'(\/nix\/store\/[^']+)'/);
    if (docstringMatch) {
      const resolvedPath = docstringMatch[1];
      debug(
        `resolveNixBinaryWrapper: found wrapped executable via DOCSTRING: ${resolvedPath}`
      );
      return resolvedPath;
    }

    // Also handle unquoted (shouldn't happen but defensive)
    const unquotedMatch = text.match(/makeCWrapper\s+(\/nix\/store\/\S+)/);
    if (unquotedMatch) {
      const resolvedPath = unquotedMatch[1];
      debug(
        `resolveNixBinaryWrapper: found wrapped executable via unquoted DOCSTRING: ${resolvedPath}`
      );
      return resolvedPath;
    }

    // Strategy 2: find /nix/store/ paths in the string table
    // The execv target is the one that points to an executable (contains /bin/)
    // as opposed to env var values (--prefix PATH) which point to directories.
    const nixPaths = text.match(/\/nix\/store\/[^\0\n\r]+/g);
    if (nixPaths) {
      for (const p of nixPaths) {
        if (p.includes('/bin/')) {
          debug(
            `resolveNixBinaryWrapper: found wrapped executable via /bin/ heuristic: ${p}`
          );
          return p;
        }
      }
    }

    debug('resolveNixBinaryWrapper: has execv but no Nix store paths found');
    return null;
  } catch (error) {
    debug('resolveNixBinaryWrapper: error during detection:', error);
    return null;
  }
}

/**
 * Constants for Bun trailer and serialized layout sizes.
 *
 * Bun data layout (normalized across formats) is:
 * [data...][OFFSETS struct][BUN_TRAILER]
 *
 * Where OFFSETS struct (SIZEOF_OFFSETS bytes) is:
 * - byteCount:   u64  (total size of [data][OFFSETS][BUN_TRAILER])
 * - modulesPtr:  { u32 offset, u32 length } into [data...] for modules table
 * - entryPointId: u32
 * - compileExecArgvPtr: { u32 offset, u32 length }
 * - flags: u32
 */
const BUN_TRAILER = Buffer.from('\n---- Bun! ----\n');

// Size constants for binary structures
const SIZEOF_OFFSETS = 32;
const SIZEOF_STRING_POINTER = 8;
// Module struct sizes vary by Bun version:
// - Old format (pre-ESM bytecode, before Bun ~1.3.7): 4 StringPointers + 4 u8s = 36 bytes
// - New format (ESM bytecode, Bun ~1.3.7+): 6 StringPointers + 4 u8s = 52 bytes
const SIZEOF_MODULE_OLD = 4 * SIZEOF_STRING_POINTER + 4;
const SIZEOF_MODULE_NEW = 6 * SIZEOF_STRING_POINTER + 4;

// Types
interface StringPointer {
  offset: number;
  length: number;
}

interface BunOffsets {
  byteCount: bigint | number;
  modulesPtr: StringPointer;
  entryPointId: number;
  compileExecArgvPtr: StringPointer;
  flags: number;
}

interface BunModule {
  name: StringPointer;
  contents: StringPointer;
  sourcemap: StringPointer;
  bytecode: StringPointer;
  moduleInfo: StringPointer;
  bytecodeOriginPath: StringPointer;
  encoding: number;
  loader: number;
  moduleFormat: number;
  side: number;
}

interface BunData {
  bunOffsets: BunOffsets;
  bunData: Buffer;
  /** Header size used in section format: 4 for old format (Bun < 1.3.4), 8 for new format. Only for Mach-O and PE. */
  sectionHeaderSize?: number;
  /** Detected module struct size: SIZEOF_MODULE_OLD (36) or SIZEOF_MODULE_NEW (52). */
  moduleStructSize: number;
}

/**
 * Read a StringPointer slice from given buffer.
 */
function getStringPointerContent(
  buffer: Buffer,
  stringPointer: StringPointer
): Buffer {
  return buffer.subarray(
    stringPointer.offset,
    stringPointer.offset + stringPointer.length
  );
}

/**
 * Bun CJS wrapper that wraps module contents in newer native binaries.
 * The wrapper is: `// @bun @bytecode @bun-cjs\n(function(...) {` ... `})`.
 * Patches expect raw JS without this wrapper.
 */
const BUN_CJS_PREFIX =
  '// @bun @bytecode @bun-cjs\n(function(exports, require, module, __filename, __dirname) {';
const BUN_CJS_SUFFIX = '})\n';

/**
 * Strip the Bun CJS wrapper from module contents if present.
 * Returns the unwrapped JS and a flag indicating if stripping occurred.
 */
function stripBunCjsWrapper(content: Buffer): {
  stripped: Buffer;
  hadWrapper: boolean;
} {
  const str = content.toString('utf-8');
  if (str.startsWith(BUN_CJS_PREFIX) && str.endsWith(BUN_CJS_SUFFIX)) {
    const inner = str.slice(
      BUN_CJS_PREFIX.length,
      str.length - BUN_CJS_SUFFIX.length
    );
    debug(
      `stripBunCjsWrapper: stripped CJS wrapper (${content.length} -> ${inner.length} bytes)`
    );
    return { stripped: Buffer.from(inner, 'utf-8'), hadWrapper: true };
  }
  return { stripped: content, hadWrapper: false };
}

/**
 * Re-wrap JS content with the Bun CJS wrapper.
 */
function addBunCjsWrapper(content: Buffer): Buffer {
  return Buffer.from(
    BUN_CJS_PREFIX + content.toString('utf-8') + BUN_CJS_SUFFIX,
    'utf-8'
  );
}

function parseStringPointer(buffer: Buffer, offset: number): StringPointer {
  return {
    offset: buffer.readUInt32LE(offset),
    length: buffer.readUInt32LE(offset + 4),
  };
}

/**
 * True if the module represents the native claude entrypoint.
 */
function isClaudeModule(moduleName: string): boolean {
  return (
    moduleName.endsWith('/claude') ||
    moduleName === 'claude' ||
    moduleName.endsWith('/claude.exe') ||
    moduleName === 'claude.exe' ||
    moduleName.endsWith('/src/entrypoints/cli.js') ||
    moduleName === 'src/entrypoints/cli.js'
  );
}

/**
 * Detects the module struct size from the modules list byte length.
 * Returns SIZEOF_MODULE_NEW (52) or SIZEOF_MODULE_OLD (36).
 */
function detectModuleStructSize(modulesListLength: number): number {
  const fitsNew = modulesListLength % SIZEOF_MODULE_NEW === 0;
  const fitsOld = modulesListLength % SIZEOF_MODULE_OLD === 0;

  if (fitsNew && !fitsOld) return SIZEOF_MODULE_NEW;
  if (fitsOld && !fitsNew) return SIZEOF_MODULE_OLD;
  if (fitsNew && fitsOld) {
    // Ambiguous — prefer new format (more likely with recent Bun versions)
    debug(
      `detectModuleStructSize: Ambiguous module list length ${modulesListLength}, assuming new format`
    );
    return SIZEOF_MODULE_NEW;
  }

  // Neither fits cleanly — try new format as default
  debug(
    `detectModuleStructSize: Module list length ${modulesListLength} doesn't cleanly divide by either struct size, assuming new format`
  );
  return SIZEOF_MODULE_NEW;
}

/**
 * Iterates over modules in the Bun data and calls visitor for each.
 * Handles all module parsing and iteration logic in one place.
 */
function mapModules<T>(
  bunData: Buffer,
  bunOffsets: BunOffsets,
  moduleStructSize: number,
  visitor: (
    module: BunModule,
    moduleName: string,
    index: number
  ) => T | undefined
): T | undefined {
  const modulesListBytes = getStringPointerContent(
    bunData,
    bunOffsets.modulesPtr
  );
  const modulesListCount = Math.floor(
    modulesListBytes.length / moduleStructSize
  );

  for (let i = 0; i < modulesListCount; i++) {
    const offset = i * moduleStructSize;
    const module = parseCompiledModuleGraphFile(
      modulesListBytes,
      offset,
      moduleStructSize
    );
    const moduleName = getStringPointerContent(bunData, module.name).toString(
      'utf-8'
    );

    const result = visitor(module, moduleName, i);
    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}

function parseOffsets(buffer: Buffer): BunOffsets {
  let pos = 0;
  const byteCount = buffer.readBigUInt64LE(pos);
  pos += 8;
  const modulesPtr = parseStringPointer(buffer, pos);
  pos += 8;
  const entryPointId = buffer.readUInt32LE(pos);
  pos += 4;
  const compileExecArgvPtr = parseStringPointer(buffer, pos);
  pos += 8;
  const flags = buffer.readUInt32LE(pos);

  return { byteCount, modulesPtr, entryPointId, compileExecArgvPtr, flags };
}

function parseCompiledModuleGraphFile(
  buffer: Buffer,
  offset: number,
  moduleStructSize: number
): BunModule {
  let pos = offset;
  const name = parseStringPointer(buffer, pos);
  pos += 8;
  const contents = parseStringPointer(buffer, pos);
  pos += 8;
  const sourcemap = parseStringPointer(buffer, pos);
  pos += 8;
  const bytecode = parseStringPointer(buffer, pos);
  pos += 8;

  let moduleInfo: StringPointer;
  let bytecodeOriginPath: StringPointer;
  if (moduleStructSize === SIZEOF_MODULE_NEW) {
    moduleInfo = parseStringPointer(buffer, pos);
    pos += 8;
    bytecodeOriginPath = parseStringPointer(buffer, pos);
    pos += 8;
  } else {
    moduleInfo = { offset: 0, length: 0 };
    bytecodeOriginPath = { offset: 0, length: 0 };
  }

  const encoding = buffer.readUInt8(pos);
  pos += 1;
  const loader = buffer.readUInt8(pos);
  pos += 1;
  const moduleFormat = buffer.readUInt8(pos);
  pos += 1;
  const side = buffer.readUInt8(pos);

  return {
    name,
    contents,
    sourcemap,
    bytecode,
    moduleInfo,
    bytecodeOriginPath,
    encoding,
    loader,
    moduleFormat,
    side,
  };
}

/**
 * Parses Bun data blob that contains: [data][offsets][trailer]
 * This is the common structure across all formats after extraction.
 */
function parseBunDataBlob(bunDataContent: Buffer): {
  bunOffsets: BunOffsets;
  bunData: Buffer;
  moduleStructSize: number;
} {
  if (bunDataContent.length < SIZEOF_OFFSETS + BUN_TRAILER.length) {
    throw new Error('BUN data is too small to contain trailer and offsets');
  }

  // Verify trailer
  const trailerStart = bunDataContent.length - BUN_TRAILER.length;
  const trailerBytes = bunDataContent.subarray(trailerStart);

  debug(`parseBunDataBlob: Expected trailer: ${BUN_TRAILER.toString('hex')}`);
  debug(`parseBunDataBlob: Got trailer: ${trailerBytes.toString('hex')}`);

  if (!trailerBytes.equals(BUN_TRAILER)) {
    debug(`Expected: ${BUN_TRAILER.toString('hex')}`);
    debug(`Got: ${trailerBytes.toString('hex')}`);
    throw new Error('BUN trailer bytes do not match trailer');
  }

  // Parse Offsets structure
  const offsetsStart =
    bunDataContent.length - SIZEOF_OFFSETS - BUN_TRAILER.length;
  const offsetsBytes = bunDataContent.subarray(
    offsetsStart,
    offsetsStart + SIZEOF_OFFSETS
  );
  const bunOffsets = parseOffsets(offsetsBytes);
  const moduleStructSize = detectModuleStructSize(bunOffsets.modulesPtr.length);

  return {
    bunOffsets,
    bunData: bunDataContent,
    moduleStructSize,
  };
}

/**
 * Section format helper (for Mach-O and PE):
 * Old format (Bun < 1.3.4): [u32 size][size bytes of Bun data blob...]
 * New format (Bun >= 1.3.4): [u64 size][size bytes of Bun data blob...]
 *
 * Size is the length of the Bun blob (which itself is [data][OFFSETS][TRAILER]).
 * We detect which format by checking if (headerSize + size) matches the section length.
 */
function extractBunDataFromSection(sectionData: Buffer): BunData {
  if (sectionData.length < 4) {
    throw new Error('Section data too small');
  }

  debug(`extractBunDataFromSection: sectionData.length=${sectionData.length}`);

  // Try u32 header (old format, Bun < 1.3.4)
  const bunDataSizeU32 = sectionData.readUInt32LE(0);
  const expectedLengthU32 = 4 + bunDataSizeU32;

  // Try u64 header (new format, Bun >= 1.3.4) - only if we have enough bytes
  const bunDataSizeU64 =
    sectionData.length >= 8 ? Number(sectionData.readBigUInt64LE(0)) : 0;
  const expectedLengthU64 = 8 + bunDataSizeU64;

  debug(
    `extractBunDataFromSection: u32 header would give size=${bunDataSizeU32}, expected total=${expectedLengthU32}`
  );
  debug(
    `extractBunDataFromSection: u64 header would give size=${bunDataSizeU64}, expected total=${expectedLengthU64}`
  );

  let headerSize: number;
  let bunDataSize: number;

  const isValidPayload = (hdrSize: number, dataSize: number): boolean => {
    if (dataSize <= 0 || hdrSize + dataSize > sectionData.length) return false;
    if (dataSize < BUN_TRAILER.length) return false;
    const trailerOffset = hdrSize + dataSize - BUN_TRAILER.length;
    return sectionData
      .subarray(trailerOffset, trailerOffset + BUN_TRAILER.length)
      .equals(BUN_TRAILER);
  };

  if (sectionData.length >= 8 && isValidPayload(8, bunDataSizeU64)) {
    headerSize = 8;
    bunDataSize = bunDataSizeU64;
    debug(
      `extractBunDataFromSection: detected u64 header format (Bun >= 1.3.4)`
    );
  } else if (isValidPayload(4, bunDataSizeU32)) {
    headerSize = 4;
    bunDataSize = bunDataSizeU32;
    debug(
      `extractBunDataFromSection: detected u32 header format (Bun < 1.3.4)`
    );
  } else {
    throw new Error(
      `Cannot determine section header format: sectionData.length=${sectionData.length}, ` +
        `u64 would expect ${expectedLengthU64}, u32 would expect ${expectedLengthU32}`
    );
  }

  debug(`extractBunDataFromSection: bunDataSize from header=${bunDataSize}`);

  const bunDataContent = sectionData.subarray(
    headerSize,
    headerSize + bunDataSize
  );

  debug(
    `extractBunDataFromSection: bunDataContent.length=${bunDataContent.length}`
  );

  const { bunOffsets, bunData, moduleStructSize } =
    parseBunDataBlob(bunDataContent);

  return {
    bunOffsets,
    bunData,
    sectionHeaderSize: headerSize,
    moduleStructSize,
  };
}

/**
 * New ELF format (Bun >= 1.3.x, post-PR#26923):
 * Bun data is stored in a .bun ELF section, using the same
 * [u64 payload_len][payload bytes] format as macOS and PE.
 *
 * At build time, Bun's writeBunSection() appends the module graph data to
 * the end of the ELF, creates a PT_LOAD segment for it, and updates the
 * .bun section header to point there. The original BUN_COMPILED location
 * (in the RW data segment) stores a vaddr pointing to the appended data.
 *
 * Returns null if the .bun section doesn't exist or doesn't have valid data.
 */
function extractBunDataFromELFSection(
  elfBinary: LIEF.ELF.Binary
): BunData | null {
  try {
    const bunSection = elfBinary.getSection('.bun');
    if (!bunSection) {
      debug('extractBunDataFromELFSection: .bun section not found');
      return null;
    }

    const sectionContent = bunSection.content;
    if (sectionContent.length < 8) {
      debug('extractBunDataFromELFSection: .bun section too small');
      return null;
    }

    debug(
      `extractBunDataFromELFSection: .bun section found, size=${sectionContent.length}`
    );

    // The .bun section uses the same [u64 size][payload] format as macOS/PE
    const result = extractBunDataFromSection(sectionContent);
    debug('extractBunDataFromELFSection: successfully extracted data');
    return result;
  } catch (error) {
    debug('extractBunDataFromELFSection: failed to extract:', error);
    return null;
  }
}

/**
 * Legacy ELF layout (Bun < 1.3.x, pre-PR#26923):
 * [original ELF ...][Bun data...][Bun offsets][Bun trailer][u64 totalByteCount]
 *
 * Matches bun_unpack.py logic: parse Offsets structure and use its byteCount
 * field instead of the trailing totalByteCount (which is unreliable for musl).
 */
function extractBunDataFromELFOverlay(elfBinary: LIEF.ELF.Binary): BunData {
  if (!elfBinary.hasOverlay) {
    throw new Error('ELF binary has no overlay data');
  }

  const overlayData = elfBinary.overlay;
  debug(
    `extractBunDataFromELFOverlay: Overlay size=${overlayData.length} bytes`
  );

  if (overlayData.length < BUN_TRAILER.length + 8 + SIZEOF_OFFSETS) {
    throw new Error('ELF overlay data is too small');
  }

  // Read totalByteCount from last 8 bytes
  const totalByteCount = overlayData.readBigUInt64LE(overlayData.length - 8);
  debug(
    `extractBunDataFromELFOverlay: Total byte count from tail=${totalByteCount}`
  );

  if (totalByteCount < 4096n || totalByteCount > 2n ** 32n - 1n) {
    throw new Error(`ELF total byte count is out of range: ${totalByteCount}`);
  }

  // Verify trailer at [len - 8 - trailer_len : len - 8]
  const trailerStart = overlayData.length - 8 - BUN_TRAILER.length;
  const trailerBytes = overlayData.subarray(
    trailerStart,
    overlayData.length - 8
  );

  debug(
    `extractBunDataFromELFOverlay: Expected trailer: ${BUN_TRAILER.toString('hex')}`
  );
  debug(
    `extractBunDataFromELFOverlay: Got trailer: ${trailerBytes.toString('hex')}`
  );

  if (!trailerBytes.equals(BUN_TRAILER)) {
    throw new Error('BUN trailer bytes do not match trailer');
  }

  // Parse Offsets at [len - 8 - trailer_len - sizeof_offsets : len - 8 - trailer_len]
  const offsetsStart =
    overlayData.length - 8 - BUN_TRAILER.length - SIZEOF_OFFSETS;
  const offsetsBytes = overlayData.subarray(
    offsetsStart,
    overlayData.length - 8 - BUN_TRAILER.length
  );
  const bunOffsets = parseOffsets(offsetsBytes);

  debug(
    `extractBunDataFromELFOverlay: Offsets.byteCount=${bunOffsets.byteCount}`
  );

  // Validate byteCount from Offsets structure
  const byteCount =
    typeof bunOffsets.byteCount === 'bigint'
      ? bunOffsets.byteCount
      : BigInt(bunOffsets.byteCount);

  if (byteCount >= totalByteCount) {
    throw new Error('ELF total byte count is out of range');
  }

  // Extract data region using byteCount from Offsets (not totalByteCount)
  const tailDataLen = 8 + BUN_TRAILER.length + SIZEOF_OFFSETS;
  const dataStart = overlayData.length - tailDataLen - Number(byteCount);
  const dataRegion = overlayData.subarray(
    dataStart,
    overlayData.length - tailDataLen
  );

  debug(
    `extractBunDataFromELFOverlay: Extracted ${dataRegion.length} bytes of data`
  );

  // Reconstruct full blob [data][offsets][trailer] to match other formats
  const bunDataBlob = Buffer.concat([dataRegion, offsetsBytes, trailerBytes]);
  const moduleStructSize = detectModuleStructSize(bunOffsets.modulesPtr.length);

  return {
    bunOffsets,
    bunData: bunDataBlob,
    moduleStructSize,
  };
}

/**
 * Mach-O layout:
 * __BUN/__bun section content is:
 * [u32 size][size bytes of Bun blob...]
 */
function extractBunDataFromMachO(machoBinary: LIEF.MachO.Binary): BunData {
  const bunSegment = machoBinary.getSegment('__BUN');
  if (!bunSegment) {
    throw new Error('__BUN segment not found');
  }

  const bunSection = bunSegment.getSection('__bun');
  if (!bunSection) {
    throw new Error('__bun section not found');
  }

  return extractBunDataFromSection(bunSection.content);
}

/**
 * PE layout:
 * .bun section content is:
 * [u32 size][size bytes of Bun blob...]
 */
function extractBunDataFromPE(peBinary: LIEF.PE.Binary): BunData {
  const bunSection = peBinary.sections().find(s => s.name === '.bun');

  if (!bunSection) {
    throw new Error('.bun section not found');
  }

  return extractBunDataFromSection(bunSection.content);
}

function getBunData(
  binary: LIEF.ELF.Binary | LIEF.PE.Binary | LIEF.MachO.Binary
): BunData {
  debug(`getBunData: Binary format detected as ${binary.format}`);

  switch (binary.format) {
    case 'MachO':
      return extractBunDataFromMachO(binary as LIEF.MachO.Binary);
    case 'PE':
      return extractBunDataFromPE(binary as LIEF.PE.Binary);
    case 'ELF': {
      // Try new .bun ELF section format first (Bun >= 1.3.x, post-PR#26923)
      const elfBinary = binary as LIEF.ELF.Binary;
      const sectionResult = extractBunDataFromELFSection(elfBinary);
      if (sectionResult) {
        debug('getBunData: Using new ELF .bun section format');
        return sectionResult;
      }
      // Fall back to legacy overlay format
      debug('getBunData: Falling back to legacy ELF overlay format');
      return extractBunDataFromELFOverlay(elfBinary);
    }
    default: {
      const _exhaustive: never = binary;
      throw new Error(
        `Unsupported binary format: ${(_exhaustive as LIEF.ELF.Binary | LIEF.PE.Binary | LIEF.MachO.Binary).format}`
      );
    }
  }
}

/**
 * Extracts claude.js from a native installation binary.
 * Returns the contents as a Buffer, or null if not found.
 *
 * Note: If the binary might be a Nix `makeBinaryWrapper` wrapper, callers
 * should resolve it first using `resolveNixBinaryWrapper()` and pass the
 * real binary path here. This is handled at detection time in
 * `installationDetection.ts`.
 */
export function extractClaudeJsFromNativeInstallation(
  nativeInstallationPath: string
): Buffer | null {
  try {
    LIEF.logging.disable();
    const binary = LIEF.parse(nativeInstallationPath);
    const { bunOffsets, bunData, moduleStructSize } = getBunData(binary);

    debug(
      `extractClaudeJsFromNativeInstallation: Got bunData, size=${bunData.length} bytes, moduleStructSize=${moduleStructSize}`
    );

    const result = mapModules(
      bunData,
      bunOffsets,
      moduleStructSize,
      (module, moduleName, index) => {
        debug(
          `extractClaudeJsFromNativeInstallation: Module ${index}: ${moduleName}`
        );

        // Module name is typically:
        // - Unix/macOS: /$bunfs/root/claude
        // - Windows:    B:/~BUN/root/claude.exe
        if (!isClaudeModule(moduleName)) return undefined;

        const rawContents = getStringPointerContent(bunData, module.contents);

        // Strip Bun CJS wrapper if present (Bun >= 1.3.x native binaries)
        const { stripped: moduleContents } = stripBunCjsWrapper(rawContents);

        debug(
          `extractClaudeJsFromNativeInstallation: Found claude module, contents length=${moduleContents.length}`
        );

        return moduleContents.length > 0 ? moduleContents : undefined;
      }
    );

    if (result) {
      return result;
    }

    debug(
      'extractClaudeJsFromNativeInstallation: claude module not found in any module'
    );

    return null;
  } catch (error) {
    debug(
      'extractClaudeJsFromNativeInstallation: Error during extraction:',
      error
    );

    return null;
  }
}

/**
 * Calculate the total bun data blob size without allocating the buffer.
 * This mirrors the layout logic in rebuildBunData phases 2-3.
 *
 * Layout: [strings with null terminators][modules list][compileExecArgv + null][OFFSETS][TRAILER]
 */
function calculateBunDataSize(
  stringsData: Buffer[],
  moduleCount: number,
  moduleStructSize: number,
  bunOffsets: BunOffsets
): number {
  let size = 0;

  // Strings with null terminators
  for (const s of stringsData) {
    size += s.length + 1;
  }

  // Module structures
  size += moduleCount * moduleStructSize;

  // compileExecArgv (we just need its length from the original offsets)
  size += bunOffsets.compileExecArgvPtr.length + 1;

  // Offsets struct + trailer
  size += SIZEOF_OFFSETS + BUN_TRAILER.length;

  return size;
}

function rebuildBunData(
  bunData: Buffer,
  bunOffsets: BunOffsets,
  modifiedClaudeJs: Buffer | null,
  moduleStructSize: number,
  sectionSizeBudget?: number
): Buffer {
  // Phase 1: Collect all string data
  const stringsData: Buffer[] = [];
  const modulesMetadata: Array<{
    name: Buffer;
    contents: Buffer;
    sourcemap: Buffer;
    bytecode: Buffer;
    moduleInfo: Buffer;
    bytecodeOriginPath: Buffer;
    encoding: number;
    loader: number;
    moduleFormat: number;
    side: number;
  }> = [];

  // Use mapModules to iterate and collect module data
  mapModules(bunData, bunOffsets, moduleStructSize, (module, moduleName) => {
    const nameBytes = getStringPointerContent(bunData, module.name);

    // Check if this is claude.js and we have modified contents
    let contentsBytes: Buffer;
    if (modifiedClaudeJs && isClaudeModule(moduleName)) {
      // Check if the original had a CJS wrapper — if so, re-wrap the modified JS
      const originalContents = getStringPointerContent(
        bunData,
        module.contents
      );
      const originalHadWrapper =
        stripBunCjsWrapper(originalContents).hadWrapper;
      contentsBytes = originalHadWrapper
        ? addBunCjsWrapper(modifiedClaudeJs)
        : modifiedClaudeJs;
    } else {
      contentsBytes = getStringPointerContent(bunData, module.contents);
    }

    const sourcemapBytes = getStringPointerContent(bunData, module.sourcemap);
    const bytecodeBytes = getStringPointerContent(bunData, module.bytecode);
    const moduleInfoBytes = getStringPointerContent(bunData, module.moduleInfo);
    const bytecodeOriginPathBytes = getStringPointerContent(
      bunData,
      module.bytecodeOriginPath
    );

    modulesMetadata.push({
      name: nameBytes,
      contents: contentsBytes,
      sourcemap: sourcemapBytes,
      bytecode: bytecodeBytes,
      moduleInfo: moduleInfoBytes,
      bytecodeOriginPath: bytecodeOriginPathBytes,
      encoding: module.encoding,
      loader: module.loader,
      moduleFormat: module.moduleFormat,
      side: module.side,
    });

    if (moduleStructSize === SIZEOF_MODULE_NEW) {
      stringsData.push(
        nameBytes,
        contentsBytes,
        sourcemapBytes,
        bytecodeBytes,
        moduleInfoBytes,
        bytecodeOriginPathBytes
      );
    } else {
      stringsData.push(nameBytes, contentsBytes, sourcemapBytes, bytecodeBytes);
    }
    return undefined;
  });

  const stringsPerModule = moduleStructSize === SIZEOF_MODULE_NEW ? 6 : 4;
  const EMPTY = Buffer.alloc(0);

  // Phase 1.5: If we have a size budget, do a trial layout to check fit.
  // If the full data exceeds the budget, truncate expendable fields
  // (sourcemaps, bytecodes, moduleInfo, bytecodeOriginPath) to make room.
  // These are non-essential: sourcemaps only affect error stack traces,
  // bytecodes are re-generated at runtime, and the others are metadata.
  if (sectionSizeBudget !== undefined) {
    const trialSize = calculateBunDataSize(
      stringsData,
      modulesMetadata.length,
      moduleStructSize,
      bunOffsets
    );
    if (trialSize > sectionSizeBudget) {
      debug(
        `rebuildBunData: trial size ${trialSize} exceeds budget ${sectionSizeBudget}, ` +
          `truncating sourcemaps/bytecodes/moduleInfo/bytecodeOriginPath to fit`
      );

      // Zero out expendable fields in both stringsData and modulesMetadata
      for (let i = 0; i < modulesMetadata.length; i++) {
        const baseIdx = i * stringsPerModule;
        // String layout per module:
        //   [0]=name, [1]=contents, [2]=sourcemap, [3]=bytecode
        //   For new format: [4]=moduleInfo, [5]=bytecodeOriginPath
        stringsData[baseIdx + 2] = EMPTY; // sourcemap
        stringsData[baseIdx + 3] = EMPTY; // bytecode
        modulesMetadata[i].sourcemap = EMPTY;
        modulesMetadata[i].bytecode = EMPTY;

        if (moduleStructSize === SIZEOF_MODULE_NEW) {
          stringsData[baseIdx + 4] = EMPTY; // moduleInfo
          stringsData[baseIdx + 5] = EMPTY; // bytecodeOriginPath
          modulesMetadata[i].moduleInfo = EMPTY;
          modulesMetadata[i].bytecodeOriginPath = EMPTY;
        }
      }

      const truncatedSize = calculateBunDataSize(
        stringsData,
        modulesMetadata.length,
        moduleStructSize,
        bunOffsets
      );
      debug(
        `rebuildBunData: size after truncation: ${truncatedSize} (budget: ${sectionSizeBudget})`
      );

      if (truncatedSize > sectionSizeBudget) {
        throw new Error(
          `Even after truncating sourcemaps/bytecodes, rebuilt data (${truncatedSize} bytes) ` +
            `still exceeds section budget (${sectionSizeBudget} bytes). ` +
            `The patched JS content is too large to fit.`
        );
      }
    }
  }

  // Phase 2: Calculate buffer layout
  let currentOffset = 0;
  const stringOffsets: StringPointer[] = [];

  // Allocate space for strings with null terminators
  for (const stringData of stringsData) {
    stringOffsets.push({ offset: currentOffset, length: stringData.length });
    currentOffset += stringData.length + 1; // +1 for null terminator
  }

  // Module structures
  const modulesListOffset = currentOffset;
  const modulesListSize = modulesMetadata.length * moduleStructSize;
  currentOffset += modulesListSize;

  // compileExecArgv
  const compileExecArgvBytes = getStringPointerContent(
    bunData,
    bunOffsets.compileExecArgvPtr
  );
  const compileExecArgvOffset = currentOffset;
  const compileExecArgvLength = compileExecArgvBytes.length;
  currentOffset += compileExecArgvLength + 1; // +1 for null terminator

  // Offsets structure
  const offsetsOffset = currentOffset;
  currentOffset += SIZEOF_OFFSETS;

  // Trailer
  const trailerOffset = currentOffset;
  currentOffset += BUN_TRAILER.length;

  // Phase 3: Build the new buffer
  const newBuffer = Buffer.allocUnsafe(currentOffset);
  newBuffer.fill(0);

  // Write all strings with null terminators
  let stringIdx = 0;
  for (const { offset, length } of stringOffsets) {
    if (length > 0) {
      stringsData[stringIdx].copy(newBuffer, offset, 0, length);
    }
    newBuffer[offset + length] = 0; // null terminator
    stringIdx++;
  }

  // Write compileExecArgv
  if (compileExecArgvLength > 0) {
    compileExecArgvBytes.copy(
      newBuffer,
      compileExecArgvOffset,
      0,
      compileExecArgvLength
    );
    newBuffer[compileExecArgvOffset + compileExecArgvLength] = 0;
  }

  // Build and write module structures
  for (let i = 0; i < modulesMetadata.length; i++) {
    const metadata = modulesMetadata[i];
    const baseStringIdx = i * stringsPerModule;

    const moduleStruct: BunModule = {
      name: stringOffsets[baseStringIdx],
      contents: stringOffsets[baseStringIdx + 1],
      sourcemap: stringOffsets[baseStringIdx + 2],
      bytecode: stringOffsets[baseStringIdx + 3],
      moduleInfo:
        moduleStructSize === SIZEOF_MODULE_NEW
          ? stringOffsets[baseStringIdx + 4]
          : { offset: 0, length: 0 },
      bytecodeOriginPath:
        moduleStructSize === SIZEOF_MODULE_NEW
          ? stringOffsets[baseStringIdx + 5]
          : { offset: 0, length: 0 },
      encoding: metadata.encoding,
      loader: metadata.loader,
      moduleFormat: metadata.moduleFormat,
      side: metadata.side,
    };

    // Serialize module structure inline
    const moduleOffset = modulesListOffset + i * moduleStructSize;
    let pos = moduleOffset;

    // Write StringPointers (common to both formats)
    newBuffer.writeUInt32LE(moduleStruct.name.offset, pos);
    newBuffer.writeUInt32LE(moduleStruct.name.length, pos + 4);
    pos += 8;
    newBuffer.writeUInt32LE(moduleStruct.contents.offset, pos);
    newBuffer.writeUInt32LE(moduleStruct.contents.length, pos + 4);
    pos += 8;
    newBuffer.writeUInt32LE(moduleStruct.sourcemap.offset, pos);
    newBuffer.writeUInt32LE(moduleStruct.sourcemap.length, pos + 4);
    pos += 8;
    newBuffer.writeUInt32LE(moduleStruct.bytecode.offset, pos);
    newBuffer.writeUInt32LE(moduleStruct.bytecode.length, pos + 4);
    pos += 8;

    // Write new-format-only StringPointers
    if (moduleStructSize === SIZEOF_MODULE_NEW) {
      newBuffer.writeUInt32LE(moduleStruct.moduleInfo.offset, pos);
      newBuffer.writeUInt32LE(moduleStruct.moduleInfo.length, pos + 4);
      pos += 8;
      newBuffer.writeUInt32LE(moduleStruct.bytecodeOriginPath.offset, pos);
      newBuffer.writeUInt32LE(moduleStruct.bytecodeOriginPath.length, pos + 4);
      pos += 8;
    }

    // Write enum fields
    newBuffer.writeUInt8(moduleStruct.encoding, pos);
    newBuffer.writeUInt8(moduleStruct.loader, pos + 1);
    newBuffer.writeUInt8(moduleStruct.moduleFormat, pos + 2);
    newBuffer.writeUInt8(moduleStruct.side, pos + 3);
  }

  // Build and write Offsets structure inline
  const newOffsets: BunOffsets = {
    byteCount: offsetsOffset,
    modulesPtr: {
      offset: modulesListOffset,
      length: modulesListSize,
    },
    entryPointId: bunOffsets.entryPointId,
    compileExecArgvPtr: {
      offset: compileExecArgvOffset,
      length: compileExecArgvLength,
    },
    flags: bunOffsets.flags,
  };

  let offsetsPos = offsetsOffset;
  const byteCount =
    typeof newOffsets.byteCount === 'bigint'
      ? newOffsets.byteCount
      : BigInt(newOffsets.byteCount);
  newBuffer.writeBigUInt64LE(byteCount, offsetsPos);
  offsetsPos += 8;
  newBuffer.writeUInt32LE(newOffsets.modulesPtr.offset, offsetsPos);
  newBuffer.writeUInt32LE(newOffsets.modulesPtr.length, offsetsPos + 4);
  offsetsPos += 8;
  newBuffer.writeUInt32LE(newOffsets.entryPointId, offsetsPos);
  offsetsPos += 4;
  newBuffer.writeUInt32LE(newOffsets.compileExecArgvPtr.offset, offsetsPos);
  newBuffer.writeUInt32LE(newOffsets.compileExecArgvPtr.length, offsetsPos + 4);
  offsetsPos += 8;
  newBuffer.writeUInt32LE(newOffsets.flags, offsetsPos);

  // Write trailer
  BUN_TRAILER.copy(newBuffer, trailerOffset);

  return newBuffer;
}

/**
 * Atomically writes a binary using LIEF and copies permissions from original.
 * Includes robust handling for busy/executing files.
 * @param binary - LIEF binary to write
 * @param outputPath - Target file path
 * @param originalPath - Original file to copy permissions from
 */
function atomicWriteBinary(
  binary: LIEF.ELF.Binary | LIEF.PE.Binary | LIEF.MachO.Binary,
  outputPath: string,
  originalPath: string,
  copyPermissions: boolean = true
): void {
  const tempPath = outputPath + '.tmp';
  binary.write(tempPath);

  if (copyPermissions) {
    const origStat = fs.statSync(originalPath);
    fs.chmodSync(tempPath, origStat.mode);
  }

  try {
    fs.renameSync(tempPath, outputPath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }

    // Check if it's a "file busy" / permission error when replacing the executable
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ETXTBSY' ||
        error.code === 'EBUSY' ||
        error.code === 'EPERM')
    ) {
      throw new Error(
        'Cannot update the Claude executable while it is running.\n' +
          'Please close all Claude instances and try again.'
      );
    }

    throw error;
  }
}

/**
 * Builds section data with size header followed by content.
 * Format: [size header][content]
 *
 * @param bunBuffer - The bun data buffer to wrap
 * @param headerSize - Header size: 4 for old format (Bun < 1.3.4), 8 for new format (default)
 */
function buildSectionData(bunBuffer: Buffer, headerSize: number = 8): Buffer {
  const sectionData = Buffer.allocUnsafe(headerSize + bunBuffer.length);
  if (headerSize === 8) {
    sectionData.writeBigUInt64LE(BigInt(bunBuffer.length), 0);
  } else {
    sectionData.writeUInt32LE(bunBuffer.length, 0);
  }
  bunBuffer.copy(sectionData, headerSize);
  return sectionData;
}

function repackMachO(
  machoBinary: LIEF.MachO.Binary,
  binPath: string,
  newBunBuffer: Buffer,
  outputPath: string,
  sectionHeaderSize: number
): void {
  try {
    // CRITICAL: Remove code signature first - it will be invalidated by modifications
    debug(`repackMachO: Has code signature: ${machoBinary.hasCodeSignature}`);
    if (machoBinary.hasCodeSignature) {
      debug('repackMachO: Removing code signature...');
      machoBinary.removeSignature();
    }

    // Find __BUN segment and __bun section
    const bunSegment = machoBinary.getSegment('__BUN');
    if (!bunSegment) {
      throw new Error('__BUN segment not found');
    }

    const bunSection = bunSegment.getSection('__bun');
    if (!bunSection) {
      throw new Error('__bun section not found');
    }

    // Use the same header size as the original binary
    const newSectionData = buildSectionData(newBunBuffer, sectionHeaderSize);

    debug(`repackMachO: Original section size: ${bunSection.size}`);
    debug(`repackMachO: Original segment fileSize: ${bunSegment.fileSize}`);
    debug(
      `repackMachO: Original segment virtualSize: ${bunSegment.virtualSize}`
    );
    debug(`repackMachO: New data size: ${newSectionData.length}`);
    debug(`repackMachO: Using header size: ${sectionHeaderSize}`);

    // Calculate how much we need to expand
    const sizeDiff = newSectionData.length - Number(bunSection.size);

    if (sizeDiff > 0) {
      // CRITICAL: Round up to page alignment
      // See #180.
      // macOS requires segments to be page-aligned, otherwise __LINKEDIT becomes misaligned
      // Page size depends on architecture:
      // - x86_64: 4KB (4096 bytes)
      // - ARM64 (Apple Silicon): 16KB (16384 bytes)
      const isARM64 =
        machoBinary.header.cpuType === LIEF.MachO.Header.CPU_TYPE.ARM64;
      const PAGE_SIZE = isARM64 ? 16384 : 4096;
      const alignedSizeDiff = Math.ceil(sizeDiff / PAGE_SIZE) * PAGE_SIZE;

      debug(`repackMachO: CPU type: ${isARM64 ? 'ARM64' : 'x86_64'}`);
      debug(`repackMachO: Page size: ${PAGE_SIZE} bytes`);
      debug(`repackMachO: Need to expand by ${sizeDiff} bytes`);
      debug(
        `repackMachO: Rounding up to page-aligned: ${alignedSizeDiff} bytes`
      );

      const success = machoBinary.extendSegment(bunSegment, alignedSizeDiff);
      debug(`repackMachO: extendSegment returned: ${success}`);

      if (!success) {
        throw new Error('Failed to extend __BUN segment');
      }

      debug(`repackMachO: Section size after extend: ${bunSection.size}`);
      debug(
        `repackMachO: Segment fileSize after extend: ${bunSegment.fileSize}`
      );
      debug(
        `repackMachO: Segment virtualSize after extend: ${bunSegment.virtualSize}`
      );
    }

    // Update section content
    bunSection.content = newSectionData;
    bunSection.size = BigInt(newSectionData.length);

    debug(`repackMachO: Final section size: ${bunSection.size}`);
    debug(`repackMachO: Writing modified binary to ${outputPath}...`);

    atomicWriteBinary(machoBinary, outputPath, binPath);

    // Re-sign the binary with an ad-hoc signature
    try {
      debug(`repackMachO: Re-signing binary with ad-hoc signature...`);
      execSync(`codesign -s - -f "${outputPath}"`, {
        stdio: isDebug() ? 'inherit' : 'ignore',
      });
      debug('repackMachO: Code signing completed successfully');
    } catch (codesignError) {
      console.warn(
        'Warning: Failed to re-sign binary. The binary may not run correctly on macOS:',
        codesignError
      );
    }

    debug('repackMachO: Write completed successfully');
  } catch (error) {
    console.error('repackMachO failed:', error);
    throw error;
  }
}

function repackPE(
  peBinary: LIEF.PE.Binary,
  binPath: string,
  newBunBuffer: Buffer,
  outputPath: string,
  sectionHeaderSize: number
): void {
  try {
    const bunSection = peBinary.sections().find(s => s.name === '.bun');
    if (!bunSection) {
      throw new Error('.bun section not found');
    }

    // Use the same header size as the original binary
    const newSectionData = buildSectionData(newBunBuffer, sectionHeaderSize);

    debug(
      `repackPE: Original section size: ${bunSection.size}, virtual size: ${bunSection.virtualSize}`
    );
    debug(`repackPE: New data size: ${newSectionData.length}`);
    debug(`repackPE: Using header size: ${sectionHeaderSize}`);

    // Update section content
    bunSection.content = newSectionData;

    // Explicitly set both the virtual size AND the raw size
    // PE sections have both:
    // - size (raw size on disk, must be aligned to FileAlignment)
    // - virtualSize (size in memory when loaded)
    bunSection.virtualSize = BigInt(newSectionData.length);
    bunSection.size = BigInt(newSectionData.length);

    debug(`repackPE: Writing modified binary to ${outputPath}...`);
    atomicWriteBinary(peBinary, outputPath, binPath, false);
    debug('repackPE: Write completed successfully');
  } catch (error) {
    console.error('repackPE failed:', error);
    throw error;
  }
}

/**
 * Repack an ELF binary that uses the new .bun section format (post-PR#26923).
 *
 * The .bun section uses the same [u64 payload_len][payload] format as macOS/PE.
 * At build time, Bun's writeBunSection() creates a PT_LOAD segment to map the
 * .bun section data, and stores the segment's vaddr in the BUN_COMPILED symbol
 * (located at its original position in the RW data segment). At runtime, the
 * Bun runtime reads BUN_COMPILED.size as a vaddr pointer to the mapped data.
 *
 * Uses direct file I/O instead of LIEF's binary.write() to avoid std::bad_alloc
 * errors on large ELF binaries (~228MB). LIEF is used only to parse the binary
 * structure and locate the .bun section's file offset. The new section data is
 * written directly at that offset, which is safe because:
 * - The rebuilt bun data blob is the same size (patches preserve content length
 *   via the CJS wrapper round-trip)
 * - No ELF structural changes are needed (section/segment headers stay the same)
 * - The BUN_COMPILED vaddr pointer doesn't change
 */
function repackELFSection(
  elfBinary: LIEF.ELF.Binary,
  binPath: string,
  newBunBuffer: Buffer,
  outputPath: string,
  sectionHeaderSize: number
): void {
  try {
    const bunSection = elfBinary.getSection('.bun');
    if (!bunSection) {
      throw new Error('.bun section not found');
    }

    const newSectionData = buildSectionData(newBunBuffer, sectionHeaderSize);
    const originalSectionSize = Number(bunSection.size);
    const sectionFileOffset = Number(bunSection.offset);

    debug(`repackELFSection: Original section size: ${originalSectionSize}`);
    debug(`repackELFSection: New section data size: ${newSectionData.length}`);
    debug(
      `repackELFSection: Section file offset: 0x${sectionFileOffset.toString(16)}`
    );

    if (newSectionData.length > originalSectionSize) {
      throw new Error(
        `New .bun section data (${newSectionData.length} bytes) exceeds original section ` +
          `(${originalSectionSize} bytes). Cannot grow ELF sections with direct write. ` +
          `Ensure patches do not change the overall content size.`
      );
    }

    // Build a buffer that is exactly the original section size.
    // If the new data is smaller, zero-pad the remainder. The Bun runtime
    // reads the payload length from the u64 header, so trailing zeros are
    // ignored.
    let sectionBuffer: Buffer;
    if (newSectionData.length === originalSectionSize) {
      sectionBuffer = newSectionData;
    } else {
      debug(
        `repackELFSection: Padding new data from ${newSectionData.length} to ${originalSectionSize} bytes`
      );
      sectionBuffer = Buffer.alloc(originalSectionSize, 0);
      newSectionData.copy(sectionBuffer, 0);
    }

    // Write the section data directly to the file at the section's file offset.
    // This bypasses LIEF's ELF builder which fails with std::bad_alloc on large
    // binaries. We use atomic copy-then-write to avoid corrupting the binary.
    const tempPath = outputPath + '.tmp';
    let tempCreated = false;

    try {
      debug(
        `repackELFSection: Copying ${binPath} to ${tempPath} for atomic write...`
      );
      fs.copyFileSync(binPath, tempPath);
      tempCreated = true;

      const fd = fs.openSync(tempPath, 'r+');
      try {
        const bytesWritten = fs.writeSync(
          fd,
          sectionBuffer,
          0,
          sectionBuffer.length,
          sectionFileOffset
        );
        debug(
          `repackELFSection: Wrote ${bytesWritten} bytes at offset 0x${sectionFileOffset.toString(16)}`
        );

        if (bytesWritten !== sectionBuffer.length) {
          throw new Error(
            `Short write: expected ${sectionBuffer.length} bytes, wrote ${bytesWritten}`
          );
        }
      } finally {
        fs.closeSync(fd);
      }

      const origStat = fs.statSync(binPath);
      fs.chmodSync(tempPath, origStat.mode);

      fs.renameSync(tempPath, outputPath);
      tempCreated = false;

      debug('repackELFSection: Write completed successfully');
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ETXTBSY' ||
          error.code === 'EBUSY' ||
          error.code === 'EPERM')
      ) {
        throw new Error(
          'Cannot update the Claude executable while it is running.\n' +
            'Please close all Claude instances and try again.'
        );
      }
      throw error;
    } finally {
      if (tempCreated) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  } catch (error) {
    console.error('repackELFSection failed:', error);
    throw error;
  }
}

/**
 * Legacy ELF repack: data is appended as an overlay (pre-PR#26923).
 */
function repackELFOverlay(
  elfBinary: LIEF.ELF.Binary,
  binPath: string,
  newBunBuffer: Buffer,
  outputPath: string
): void {
  try {
    // Build new overlay: [bunData][totalByteCount (8 bytes)]
    // Note: newBunBuffer already includes offsets and trailer
    const newOverlay = Buffer.allocUnsafe(newBunBuffer.length + 8);
    newBunBuffer.copy(newOverlay, 0);
    newOverlay.writeBigUInt64LE(
      BigInt(newBunBuffer.length),
      newBunBuffer.length
    );

    debug(
      `repackELFOverlay: Setting overlay data (${newOverlay.length} bytes)`
    );

    elfBinary.overlay = newOverlay;
    debug(`repackELFOverlay: Writing modified binary to ${outputPath}...`);

    atomicWriteBinary(elfBinary, outputPath, binPath);
    debug('repackELFOverlay: Write completed successfully');
  } catch (error) {
    console.error('repackELFOverlay failed:', error);
    throw error;
  }
}

/**
 * Repacks a modified claude.js back into the native installation binary.
 *
 * Note: If the binary might be a Nix `makeBinaryWrapper` wrapper, callers
 * should resolve it first using `resolveNixBinaryWrapper()` and pass the
 * real binary path here. This is handled at detection time in
 * `installationDetection.ts`, so `nativeInstallationPath` should already
 * point to the real binary.
 *
 * @param binPath - Path to the original native installation binary
 * @param modifiedClaudeJs - Modified claude.js contents as a Buffer
 * @param outputPath - Where to write the repacked binary
 */
export function repackNativeInstallation(
  binPath: string,
  modifiedClaudeJs: Buffer,
  outputPath: string
): void {
  LIEF.logging.disable();
  const binary = LIEF.parse(binPath);

  // Extract Bun data and rebuild with modified claude.js
  const { bunOffsets, bunData, sectionHeaderSize, moduleStructSize } =
    getBunData(binary);

  // For the ELF .bun section format, we use direct file I/O and cannot grow the
  // section. Compute a size budget so rebuildBunData() can truncate expendable
  // fields (sourcemaps, bytecodes) when the patched JS is larger than the original.
  let sectionSizeBudget: number | undefined;
  if (binary.format === 'ELF' && sectionHeaderSize) {
    const elfBinary = binary as LIEF.ELF.Binary;
    const bunSection = elfBinary.getSection('.bun');
    if (bunSection) {
      // The section holds [u64/u32 header][bun data blob].
      // The bun data blob must fit in (sectionSize - headerSize).
      sectionSizeBudget = Number(bunSection.size) - sectionHeaderSize;
      debug(
        `repackNativeInstallation: ELF .bun section budget = ${sectionSizeBudget} bytes ` +
          `(section=${Number(bunSection.size)}, header=${sectionHeaderSize})`
      );
    }
  }

  const newBuffer = rebuildBunData(
    bunData,
    bunOffsets,
    modifiedClaudeJs,
    moduleStructSize,
    sectionSizeBudget
  );

  switch (binary.format) {
    case 'MachO':
      if (!sectionHeaderSize) {
        throw new Error('sectionHeaderSize is required for Mach-O binaries');
      }
      repackMachO(
        binary as LIEF.MachO.Binary,
        binPath,
        newBuffer,
        outputPath,
        sectionHeaderSize
      );
      break;
    case 'PE':
      if (!sectionHeaderSize) {
        throw new Error('sectionHeaderSize is required for PE binaries');
      }
      repackPE(
        binary as LIEF.PE.Binary,
        binPath,
        newBuffer,
        outputPath,
        sectionHeaderSize
      );
      break;
    case 'ELF':
      if (sectionHeaderSize) {
        // New .bun section format (post-PR#26923)
        repackELFSection(
          binary as LIEF.ELF.Binary,
          binPath,
          newBuffer,
          outputPath,
          sectionHeaderSize
        );
      } else {
        // Legacy overlay format
        repackELFOverlay(
          binary as LIEF.ELF.Binary,
          binPath,
          newBuffer,
          outputPath
        );
      }
      break;
    default: {
      const _exhaustive: never = binary;
      throw new Error(
        `Unsupported binary format: ${(_exhaustive as LIEF.ELF.Binary | LIEF.PE.Binary | LIEF.MachO.Binary).format}`
      );
    }
  }
}
