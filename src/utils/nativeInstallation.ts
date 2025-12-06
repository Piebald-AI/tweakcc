/**
 * Utilities for extracting and repacking native installation binaries.
 */

import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import type LIEF from 'node-lief';
import { isDebug } from './misc.js';

// Create a require function that works in ESM context
const require = createRequire(import.meta.url);

let liefModule: typeof LIEF | null = null;

/**
 * Lazy-load the LIEF module to avoid import errors on systems without C++ libraries.
 * This is especially important for NixOS and other systems where native modules may fail.
 */
function getLIEF(): typeof LIEF {
  if (liefModule === null) {
    liefModule = require('node-lief');
  }
  return liefModule as typeof LIEF;
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
 */
const BUN_TRAILER = Buffer.from('\n---- Bun! ----\n');

// Size constants for binary structures
const SIZEOF_OFFSETS = 32;
const SIZEOF_STRING_POINTER = 8;
const SIZEOF_MODULE = 4 * SIZEOF_STRING_POINTER + 4;

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
}

interface BunModule {
  name: StringPointer;
  contents: StringPointer;
  sourcemap: StringPointer;
  bytecode: StringPointer;
  encoding: number;
  loader: number;
  moduleFormat: number;
  side: number;
}

interface BunData {
  bunOffsets: BunOffsets;
  bunData: Buffer;
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
    moduleName === 'claude.exe'
  );
}

/**
 * Iterates over modules in the Bun data and calls visitor for each.
 * Handles all module parsing and iteration logic in one place.
 */
function mapModules<T>(
  bunData: Buffer,
  bunOffsets: BunOffsets,
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
  const modulesListCount = Math.floor(modulesListBytes.length / SIZEOF_MODULE);

  for (let i = 0; i < modulesListCount; i++) {
    const offset = i * SIZEOF_MODULE;
    const module = parseCompiledModuleGraphFile(modulesListBytes, offset);
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

  return { byteCount, modulesPtr, entryPointId, compileExecArgvPtr };
}

function parseCompiledModuleGraphFile(
  buffer: Buffer,
  offset: number
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
} {
  if (bunDataContent.length < SIZEOF_OFFSETS + BUN_TRAILER.length) {
    throw new Error('BUN data is too small to contain trailer and offsets');
  }

  // Verify trailer
  const trailerStart = bunDataContent.length - BUN_TRAILER.length;
  const trailerBytes = bunDataContent.subarray(trailerStart);

  if (isDebug()) {
    console.log(
      `parseBunDataBlob: Expected trailer: ${BUN_TRAILER.toString('hex')}`
    );
    console.log(
      `parseBunDataBlob: Got trailer: ${trailerBytes.toString('hex')}`
    );
  }

  if (!trailerBytes.equals(BUN_TRAILER)) {
    if (isDebug()) {
      console.log(`Expected: ${BUN_TRAILER.toString('hex')}`);
      console.log(`Got: ${trailerBytes.toString('hex')}`);
    }
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

  return {
    bunOffsets,
    bunData: bunDataContent,
  };
}

/**
 * Section format helper:
 * [u32 size][size bytes of Bun data blob...]
 * Size is the length of the Bun blob (which itself is [data][OFFSETS][TRAILER]).
 */
function extractBunDataFromSection(sectionData: Buffer): BunData {
  if (sectionData.length < 4) {
    throw new Error('Section data too small');
  }

  if (isDebug()) {
    console.log(
      `extractBunDataFromSection: sectionData.length=${sectionData.length}`
    );
  }

  const bunDataSize = sectionData.readUInt32LE(0);

  if (isDebug()) {
    console.log(
      `extractBunDataFromSection: bunDataSize from header=${bunDataSize}`
    );
  }

  const bunDataContent = sectionData.subarray(4, 4 + bunDataSize);

  if (isDebug()) {
    console.log(
      `extractBunDataFromSection: bunDataContent.length=${bunDataContent.length}`
    );
  }

  const { bunOffsets, bunData } = parseBunDataBlob(bunDataContent);

  return { bunOffsets, bunData };
}

/**
 * ELF layout:
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
  if (isDebug()) {
    console.log(
      `extractBunDataFromELFOverlay: Overlay size=${overlayData.length} bytes`
    );
  }

  if (overlayData.length < BUN_TRAILER.length + 8 + SIZEOF_OFFSETS) {
    throw new Error('ELF overlay data is too small');
  }

  // Read totalByteCount from last 8 bytes
  const totalByteCount = overlayData.readBigUInt64LE(overlayData.length - 8);
  if (isDebug()) {
    console.log(
      `extractBunDataFromELFOverlay: Total byte count from tail=${totalByteCount}`
    );
  }

  if (totalByteCount < 4096n || totalByteCount > 2n ** 32n - 1n) {
    throw new Error(`ELF total byte count is out of range: ${totalByteCount}`);
  }

  // Verify trailer at [len - 8 - trailer_len : len - 8]
  const trailerStart = overlayData.length - 8 - BUN_TRAILER.length;
  const trailerBytes = overlayData.subarray(
    trailerStart,
    overlayData.length - 8
  );

  if (isDebug()) {
    console.log(
      `extractBunDataFromELFOverlay: Expected trailer: ${BUN_TRAILER.toString('hex')}`
    );
    console.log(
      `extractBunDataFromELFOverlay: Got trailer: ${trailerBytes.toString('hex')}`
    );
  }

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

  if (isDebug()) {
    console.log(
      `extractBunDataFromELFOverlay: Offsets.byteCount=${bunOffsets.byteCount}`
    );
  }

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

  if (isDebug()) {
    console.log(
      `extractBunDataFromELFOverlay: Extracted ${dataRegion.length} bytes of data`
    );
  }

  // Reconstruct full blob [data][offsets][trailer] to match other formats
  const bunDataBlob = Buffer.concat([dataRegion, offsetsBytes, trailerBytes]);

  return {
    bunOffsets,
    bunData: bunDataBlob,
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

function getBunData(binary: LIEF.Abstract.Binary): BunData {
  if (isDebug()) {
    console.log(`getBunData: Binary format detected as ${binary.format}`);
  }

  switch (binary.format) {
    case 'MachO':
      return extractBunDataFromMachO(binary as LIEF.MachO.Binary);
    case 'PE':
      return extractBunDataFromPE(binary as LIEF.PE.Binary);
    case 'ELF':
      return extractBunDataFromELFOverlay(binary as LIEF.ELF.Binary);
    default:
      throw new Error(`Unsupported binary format: ${binary.format}`);
  }
}

/**
 * Extracts claude.js from a native installation binary.
 * Returns the contents as a Buffer, or null if not found.
 */
export function extractClaudeJsFromNativeInstallation(
  nativeInstallationPath: string
): Buffer | null {
  try {
    getLIEF().logging.disable();
    const binary = getLIEF().parse(nativeInstallationPath);
    const { bunOffsets, bunData } = getBunData(binary);

    if (isDebug()) {
      console.log(
        `extractClaudeJsFromNativeInstallation: Got bunData, size=${bunData.length} bytes`
      );
    }

    const result = mapModules(
      bunData,
      bunOffsets,
      (module, moduleName, index) => {
        if (isDebug()) {
          console.log(
            `extractClaudeJsFromNativeInstallation: Module ${index}: ${moduleName}`
          );
        }

        // Module name is typically:
        // - Unix/macOS: /$bunfs/root/claude
        // - Windows:    B:/~BUN/root/claude.exe
        if (!isClaudeModule(moduleName)) return undefined;

        const moduleContents = getStringPointerContent(
          bunData,
          module.contents
        );

        if (isDebug()) {
          console.log(
            `extractClaudeJsFromNativeInstallation: Found claude module, contents length=${moduleContents.length}`
          );
        }

        return moduleContents.length > 0 ? moduleContents : undefined;
      }
    );

    if (result) {
      return result;
    }

    if (isDebug()) {
      console.log(
        'extractClaudeJsFromNativeInstallation: claude module not found in any module'
      );
    }

    return null;
  } catch (error) {
    if (isDebug()) {
      console.log(
        'extractClaudeJsFromNativeInstallation: Error during extraction:',
        error
      );
    }

    return null;
  }
}

function rebuildBunData(
  bunData: Buffer,
  bunOffsets: BunOffsets,
  modifiedClaudeJs: Buffer | null
): Buffer {
  // Phase 1: Collect all string data
  const stringsData: Buffer[] = [];
  const modulesMetadata: Array<{
    name: Buffer;
    contents: Buffer;
    sourcemap: Buffer;
    bytecode: Buffer;
    encoding: number;
    loader: number;
    moduleFormat: number;
    side: number;
  }> = [];

  // Use mapModules to iterate and collect module data
  mapModules(bunData, bunOffsets, (module, moduleName) => {
    const nameBytes = getStringPointerContent(bunData, module.name);

    // Check if this is claude.js and we have modified contents
    let contentsBytes: Buffer;
    if (modifiedClaudeJs && isClaudeModule(moduleName)) {
      contentsBytes = modifiedClaudeJs;
    } else {
      contentsBytes = getStringPointerContent(bunData, module.contents);
    }

    const sourcemapBytes = getStringPointerContent(bunData, module.sourcemap);
    const bytecodeBytes = getStringPointerContent(bunData, module.bytecode);

    modulesMetadata.push({
      name: nameBytes,
      contents: contentsBytes,
      sourcemap: sourcemapBytes,
      bytecode: bytecodeBytes,
      encoding: module.encoding,
      loader: module.loader,
      moduleFormat: module.moduleFormat,
      side: module.side,
    });

    stringsData.push(nameBytes, contentsBytes, sourcemapBytes, bytecodeBytes);
    return undefined;
  });

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
  const modulesListSize = modulesMetadata.length * SIZEOF_MODULE;
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
    const baseStringIdx = i * 4;

    const moduleStruct: BunModule = {
      name: {
        offset: stringOffsets[baseStringIdx].offset,
        length: stringOffsets[baseStringIdx].length,
      },
      contents: {
        offset: stringOffsets[baseStringIdx + 1].offset,
        length: stringOffsets[baseStringIdx + 1].length,
      },
      sourcemap: {
        offset: stringOffsets[baseStringIdx + 2].offset,
        length: stringOffsets[baseStringIdx + 2].length,
      },
      bytecode: {
        offset: stringOffsets[baseStringIdx + 3].offset,
        length: stringOffsets[baseStringIdx + 3].length,
      },
      encoding: metadata.encoding,
      loader: metadata.loader,
      moduleFormat: metadata.moduleFormat,
      side: metadata.side,
    };

    // Serialize module structure inline
    const moduleOffset = modulesListOffset + i * SIZEOF_MODULE;
    let pos = moduleOffset;

    // Write StringPointers
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

    // Write flags
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
  binary: LIEF.Abstract.Binary,
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
 * Builds section data with 4-byte size header followed by content.
 * Format: [4-byte size][content]
 */
function buildSectionData(bunBuffer: Buffer): Buffer {
  const sectionData = Buffer.allocUnsafe(4 + bunBuffer.length);
  sectionData.writeUInt32LE(bunBuffer.length, 0);
  bunBuffer.copy(sectionData, 4);
  return sectionData;
}

function repackMachO(
  machoBinary: LIEF.MachO.Binary,
  binPath: string,
  newBunBuffer: Buffer,
  outputPath: string
): void {
  try {
    // CRITICAL: Remove code signature first - it will be invalidated by modifications
    if (isDebug()) {
      console.log(
        `repackMachO: Has code signature: ${machoBinary.hasCodeSignature}`
      );
    }
    if (machoBinary.hasCodeSignature) {
      if (isDebug()) {
        console.log('repackMachO: Removing code signature...');
      }
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

    const newSectionData = buildSectionData(newBunBuffer);

    if (isDebug()) {
      console.log(`repackMachO: Original section size: ${bunSection.size}`);
      console.log(
        `repackMachO: Original segment fileSize: ${bunSegment.fileSize}`
      );
      console.log(
        `repackMachO: Original segment virtualSize: ${bunSegment.virtualSize}`
      );
      console.log(`repackMachO: New data size: ${newSectionData.length}`);
    }

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
        machoBinary.header.cpuType === getLIEF().MachO.Header.CPU_TYPE.ARM64;
      const PAGE_SIZE = isARM64 ? 16384 : 4096;
      const alignedSizeDiff = Math.ceil(sizeDiff / PAGE_SIZE) * PAGE_SIZE;

      if (isDebug()) {
        console.log(`repackMachO: CPU type: ${isARM64 ? 'ARM64' : 'x86_64'}`);
        console.log(`repackMachO: Page size: ${PAGE_SIZE} bytes`);
        console.log(`repackMachO: Need to expand by ${sizeDiff} bytes`);
        console.log(
          `repackMachO: Rounding up to page-aligned: ${alignedSizeDiff} bytes`
        );
      }

      const success = machoBinary.extendSegment(bunSegment, alignedSizeDiff);
      if (isDebug()) {
        console.log(`repackMachO: extendSegment returned: ${success}`);
      }

      if (!success) {
        throw new Error('Failed to extend __BUN segment');
      }

      if (isDebug()) {
        console.log(
          `repackMachO: Section size after extend: ${bunSection.size}`
        );
        console.log(
          `repackMachO: Segment fileSize after extend: ${bunSegment.fileSize}`
        );
        console.log(
          `repackMachO: Segment virtualSize after extend: ${bunSegment.virtualSize}`
        );
      }
    }

    // Update section content
    bunSection.content = newSectionData;
    bunSection.size = BigInt(newSectionData.length);

    if (isDebug()) {
      console.log(`repackMachO: Final section size: ${bunSection.size}`);
      console.log(`repackMachO: Writing modified binary to ${outputPath}...`);
    }

    atomicWriteBinary(machoBinary, outputPath, binPath);

    // Re-sign the binary with an ad-hoc signature
    try {
      if (isDebug()) {
        console.log(`repackMachO: Re-signing binary with ad-hoc signature...`);
      }
      execSync(`codesign -s - -f "${outputPath}"`, {
        stdio: isDebug() ? 'inherit' : 'ignore',
      });
      if (isDebug()) {
        console.log('repackMachO: Code signing completed successfully');
      }
    } catch (codesignError) {
      console.warn(
        'Warning: Failed to re-sign binary. The binary may not run correctly on macOS:',
        codesignError
      );
    }

    if (isDebug()) {
      console.log('repackMachO: Write completed successfully');
    }
  } catch (error) {
    console.error('repackMachO failed:', error);
    throw error;
  }
}

function repackPE(
  peBinary: LIEF.PE.Binary,
  binPath: string,
  newBunBuffer: Buffer,
  outputPath: string
): void {
  try {
    const bunSection = peBinary.sections().find(s => s.name === '.bun');
    if (!bunSection) {
      throw new Error('.bun section not found');
    }

    const newSectionData = buildSectionData(newBunBuffer);

    if (isDebug()) {
      console.log(
        `repackPE: Original section size: ${bunSection.size}, virtual size: ${bunSection.virtualSize}`
      );
      console.log(`repackPE: New data size: ${newSectionData.length}`);
    }

    // Update section content
    bunSection.content = newSectionData;

    // Explicitly set both the virtual size AND the raw size
    // PE sections have both:
    // - size (raw size on disk, must be aligned to FileAlignment)
    // - virtualSize (size in memory when loaded)
    bunSection.virtualSize = BigInt(newSectionData.length);
    bunSection.size = BigInt(newSectionData.length);

    if (isDebug()) {
      console.log(`repackPE: Writing modified binary to ${outputPath}...`);
    }
    atomicWriteBinary(peBinary, outputPath, binPath, false);
    if (isDebug()) {
      console.log('repackPE: Write completed successfully');
    }
  } catch (error) {
    console.error('repackPE failed:', error);
    throw error;
  }
}

function repackELF(
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

    if (isDebug()) {
      console.log(
        `repackELF: Setting overlay data (${newOverlay.length} bytes)`
      );
    }

    elfBinary.overlay = newOverlay;
    if (isDebug()) {
      console.log(`repackELF: Writing modified binary to ${outputPath}...`);
    }
    atomicWriteBinary(elfBinary, outputPath, binPath);
    if (isDebug()) {
      console.log('repackELF: Write completed successfully');
    }
  } catch (error) {
    console.error('repackELF failed:', error);
    throw error;
  }
}

/**
 * Repacks a modified claude.js back into the native installation binary.
 * @param binPath - Path to the original native installation binary
 * @param modifiedClaudeJs - Modified claude.js contents as a Buffer
 * @param outputPath - Where to write the repacked binary
 */
export function repackNativeInstallation(
  binPath: string,
  modifiedClaudeJs: Buffer,
  outputPath: string
): void {
  getLIEF().logging.disable();
  const binary = getLIEF().parse(binPath);

  // Extract Bun data and rebuild with modified claude.js
  const { bunOffsets, bunData } = getBunData(binary);
  const newBuffer = rebuildBunData(bunData, bunOffsets, modifiedClaudeJs);

  switch (binary.format) {
    case 'MachO':
      repackMachO(binary as LIEF.MachO.Binary, binPath, newBuffer, outputPath);
      break;
    case 'PE':
      repackPE(binary as LIEF.PE.Binary, binPath, newBuffer, outputPath);
      break;
    case 'ELF':
      repackELF(binary as LIEF.ELF.Binary, binPath, newBuffer, outputPath);
      break;
    default:
      throw new Error(`Unsupported binary format: ${binary.format}`);
  }
}
