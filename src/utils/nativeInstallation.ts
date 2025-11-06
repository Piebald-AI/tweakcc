/**
 * Utilities for extracting and repacking native installation binaries.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import LIEF from 'node-lief';
import { NtExecutable } from 'pe-library';
import { isDebug } from './misc.js';

// Constants
const BUN_TRAILER = Buffer.from('\n---- Bun! ----\n');
const BASE_PATH = '/$bunfs/';
const BASE_PATH_WINDOWS = 'B:/~BUN/';

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
  byte_count: bigint | number;
  modules_ptr: StringPointer;
  entry_point_id: number;
  compile_exec_argv_ptr: StringPointer;
}

interface BunModule {
  name: StringPointer;
  contents: StringPointer;
  sourcemap: StringPointer;
  bytecode: StringPointer;
  encoding: number;
  loader: number;
  module_format: number;
  side: number;
}

interface BunData {
  bunOffsets: BunOffsets | null;
  bunData: Buffer | null;
  basePublicPathPrefix: string;
}

// Helper functions
function getStringPointerContent(
  buffer: Buffer,
  stringPointer: StringPointer
): Buffer {
  return buffer.slice(
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

function parseOffsets(buffer: Buffer): BunOffsets {
  let pos = 0;
  const byte_count = buffer.readBigUInt64LE(pos);
  pos += 8;
  const modules_ptr = parseStringPointer(buffer, pos);
  pos += 8;
  const entry_point_id = buffer.readUInt32LE(pos);
  pos += 4;
  const compile_exec_argv_ptr = parseStringPointer(buffer, pos);

  return { byte_count, modules_ptr, entry_point_id, compile_exec_argv_ptr };
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
  const module_format = buffer.readUInt8(pos);
  pos += 1;
  const side = buffer.readUInt8(pos);

  return {
    name,
    contents,
    sourcemap,
    bytecode,
    encoding,
    loader,
    module_format,
    side,
  };
}

function detectBinaryFormat(filePath: string): 'ELF' | 'PE' | 'MachO' | 'Unknown' {
  const fd = fs.openSync(filePath, 'r');
  const magic = Buffer.allocUnsafe(4);
  fs.readSync(fd, magic, 0, 4, 0);
  fs.closeSync(fd);

  // Check magic bytes
  if (magic[0] === 0x7F && magic[1] === 0x45 && magic[2] === 0x4C && magic[3] === 0x46) {
    return 'ELF';
  } else if (magic[0] === 0x4D && magic[1] === 0x5A) {
    return 'PE';
  } else if (
    (magic[0] === 0xCF || magic[0] === 0xCE) &&
    (magic[1] === 0xFA || magic[1] === 0xFE) &&
    (magic[2] === 0xED || magic[2] === 0xBA) &&
    (magic[3] === 0xFE || magic[3] === 0xBE)
  ) {
    return 'MachO';
  }

  return 'Unknown';
}

function extractBunDataFromSection(sectionData: Buffer): BunData {
  if (sectionData.length < 4) {
    console.error('Section data too small');
    return { bunOffsets: null, bunData: null, basePublicPathPrefix: BASE_PATH };
  }

  if (isDebug()) {
    console.log(
      `extractBunDataFromSection: sectionData.length=${sectionData.length}`
    );
  }

  // Read 4-byte size header
  const bunDataSize = sectionData.readUInt32LE(0);

  if (isDebug()) {
    console.log(
      `extractBunDataFromSection: bunDataSize from header=${bunDataSize}`
    );
  }

  const bunDataContent = sectionData.slice(4, 4 + bunDataSize);

  if (isDebug()) {
    console.log(
      `extractBunDataFromSection: bunDataContent.length=${bunDataContent.length}`
    );
  }

  if (bunDataContent.length < SIZEOF_OFFSETS + BUN_TRAILER.length) {
    console.error('BUN data is too small to contain trailer and offsets');
    return { bunOffsets: null, bunData: null, basePublicPathPrefix: BASE_PATH };
  }

  // Verify trailer
  const trailerStart = bunDataContent.length - BUN_TRAILER.length;
  const trailerBytes = bunDataContent.slice(trailerStart);

  if (isDebug()) {
    console.log(
      `extractBunDataFromSection: Expected trailer: ${BUN_TRAILER.toString('hex')}`
    );
    console.log(
      `extractBunDataFromSection: Got trailer: ${trailerBytes.toString('hex')}`
    );
    console.log(
      `extractBunDataFromSection: Expected trailer (string): ${JSON.stringify(BUN_TRAILER.toString())}`
    );
    console.log(
      `extractBunDataFromSection: Got trailer (string): ${JSON.stringify(trailerBytes.toString())}`
    );
  }

  if (!trailerBytes.equals(BUN_TRAILER)) {
    console.error('BUN trailer bytes do not match trailer');
    if (isDebug()) {
      console.log(`Expected: ${BUN_TRAILER.toString('hex')}`);
      console.log(`Got: ${trailerBytes.toString('hex')}`);
    }
    return { bunOffsets: null, bunData: null, basePublicPathPrefix: BASE_PATH };
  }

  // Parse Offsets structure
  const offsetsStart =
    bunDataContent.length - SIZEOF_OFFSETS - BUN_TRAILER.length;
  const offsetsBytes = bunDataContent.slice(
    offsetsStart,
    offsetsStart + SIZEOF_OFFSETS
  );
  const bunOffsets = parseOffsets(offsetsBytes);

  return {
    bunOffsets,
    bunData: bunDataContent,
    basePublicPathPrefix: BASE_PATH,
  };
}

function extractBunDataFromPE(filePath: string): BunData {
  const fileData = fs.readFileSync(filePath);
  const exe = NtExecutable.from(fileData.buffer, { ignoreCert: true });

  // Find .bun section
  const sections = exe.getAllSections();
  const bunSection = sections.find((sec: any) => {
    // sec.info.name is a string
    const cleanName = sec.info.name.replace(/\0/g, '');
    return cleanName === '.bun';
  });

  if (!bunSection || !bunSection.data) {
    console.error('.bun section not found');
    return {
      bunOffsets: null,
      bunData: null,
      basePublicPathPrefix: BASE_PATH_WINDOWS,
    };
  }

  const sectionData = Buffer.from(bunSection.data);
  const { bunOffsets, bunData } = extractBunDataFromSection(sectionData);

  return { bunOffsets, bunData, basePublicPathPrefix: BASE_PATH_WINDOWS };
}

function extractBunDataFromELFTail(filePath: string): BunData {
  const fd = fs.openSync(filePath, 'r');
  try {
    const stats = fs.fstatSync(fd);
    const fileSize = stats.size;

    if (isDebug()) {
      console.log(`extractBunDataFromELFTail: File size=${fileSize} bytes`);
    }

    // Read last 4096 bytes
    const tailSize = 4096;
    const tailBuffer = Buffer.allocUnsafe(tailSize);
    fs.readSync(fd, tailBuffer, 0, tailSize, fileSize - tailSize);

    if (tailBuffer.length < BUN_TRAILER.length + 8 + SIZEOF_OFFSETS) {
      console.error('ELF tail data is too small');
      return {
        bunOffsets: null,
        bunData: null,
        basePublicPathPrefix: BASE_PATH,
      };
    }

    // Read total byte count from last 8 bytes
    const totalByteCount = tailBuffer.readBigUInt64LE(tailBuffer.length - 8);
    if (isDebug()) {
      console.log(
        `extractBunDataFromELFTail: Total byte count from tail=${totalByteCount}`
      );
    }

    if (totalByteCount < 4096n || totalByteCount > 2n ** 32n - 1n) {
      console.error(`ELF total byte count is out of range: ${totalByteCount}`);
      return {
        bunOffsets: null,
        bunData: null,
        basePublicPathPrefix: BASE_PATH,
      };
    }

    // Verify trailer
    const trailerStart = tailBuffer.length - 8 - BUN_TRAILER.length;
    const trailerBytes = tailBuffer.slice(
      trailerStart,
      trailerStart + BUN_TRAILER.length
    );
    if (!trailerBytes.equals(BUN_TRAILER)) {
      console.error('ELF trailer bytes do not match trailer');
      if (isDebug()) {
        console.log(`Expected: ${BUN_TRAILER.toString('hex')}`);
        console.log(`Got: ${trailerBytes.toString('hex')}`);
      }
      return {
        bunOffsets: null,
        bunData: null,
        basePublicPathPrefix: BASE_PATH,
      };
    }

    // Parse Offsets structure
    const offsetsStart =
      tailBuffer.length - 8 - BUN_TRAILER.length - SIZEOF_OFFSETS;
    const offsetsBytes = tailBuffer.slice(
      offsetsStart,
      offsetsStart + SIZEOF_OFFSETS
    );
    const bunOffsets = parseOffsets(offsetsBytes);

    const byteCountBigInt =
      typeof bunOffsets.byte_count === 'bigint'
        ? bunOffsets.byte_count
        : BigInt(bunOffsets.byte_count);

    if (isDebug()) {
      console.log(
        `extractBunDataFromELFTail: bunOffsets.byte_count=${byteCountBigInt}`
      );
    }

    if (byteCountBigInt >= totalByteCount) {
      console.error(
        `ELF byte_count (${byteCountBigInt}) >= totalByteCount (${totalByteCount})`
      );
      return {
        bunOffsets: null,
        bunData: null,
        basePublicPathPrefix: BASE_PATH,
      };
    }

    // Read actual Bun data
    const tailDataLen = 8 + BUN_TRAILER.length + SIZEOF_OFFSETS;
    const bunDataStart = fileSize - tailDataLen - Number(byteCountBigInt);
    const bunDataBuffer = Buffer.allocUnsafe(Number(byteCountBigInt));
    fs.readSync(fd, bunDataBuffer, 0, Number(byteCountBigInt), bunDataStart);

    if (isDebug()) {
      console.log(
        `extractBunDataFromELFTail: Successfully read ${bunDataBuffer.length} bytes of Bun data`
      );
    }

    return {
      bunOffsets,
      bunData: bunDataBuffer,
      basePublicPathPrefix: BASE_PATH,
    };
  } finally {
    fs.closeSync(fd);
  }
}

function getBunData(binPath: string): BunData {
  // Disable LIEF logging to avoid error spamming
  LIEF.logging.disable();

  try {
    const format = detectBinaryFormat(binPath);

    if (isDebug()) {
      console.log(`getBunData: Binary format detected as ${format}`);
    }

    if (format === 'MachO') {
      // Use LIEF for MachO files
      const binary = LIEF.parse(binPath);
      const machoBinary = binary as LIEF.MachO.Binary;
      const bunSegment = machoBinary.getSegment('__BUN');
      if (!bunSegment) {
        console.error('__BUN segment not found');
        return {
          bunOffsets: null,
          bunData: null,
          basePublicPathPrefix: BASE_PATH,
        };
      }

      const bunSection = bunSegment.getSection('__bun');
      if (!bunSection) {
        console.error('__bun section not found');
        return {
          bunOffsets: null,
          bunData: null,
          basePublicPathPrefix: BASE_PATH,
        };
      }

      // Extract section data
      const sectionData = Buffer.from(bunSection.content);
      const { bunOffsets, bunData } = extractBunDataFromSection(sectionData);

      return { bunOffsets, bunData, basePublicPathPrefix: BASE_PATH };
    } else if (format === 'PE') {
      // Use pe-library for PE files
      return extractBunDataFromPE(binPath);
    } else if (format === 'ELF') {
      // For ELF, Bun data is appended to the end of the file
      const result = extractBunDataFromELFTail(binPath);
      if (isDebug()) {
        console.log(
          `getBunData: ELF extraction result: bunOffsets=${result.bunOffsets !== null}, bunData=${result.bunData !== null}`
        );
      }
      return { ...result, basePublicPathPrefix: BASE_PATH };
    } else {
      console.error(`Unsupported binary format: ${format}`);
      return {
        bunOffsets: null,
        bunData: null,
        basePublicPathPrefix: BASE_PATH,
      };
    }
  } catch (error) {
    console.error('Failed to parse binary file:', error);
    return { bunOffsets: null, bunData: null, basePublicPathPrefix: BASE_PATH };
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
    const { bunOffsets, bunData } = getBunData(nativeInstallationPath);

    if (!bunOffsets || !bunData) {
      if (isDebug()) {
        console.log(
          'extractClaudeJsFromNativeInstallation: getBunData returned null'
        );
      }
      return null;
    }

    if (isDebug()) {
      console.log(
        `extractClaudeJsFromNativeInstallation: Got bunData, size=${bunData.length} bytes`
      );
    }

    // Parse modules list
    const modulesListBytes = getStringPointerContent(
      bunData,
      bunOffsets.modules_ptr
    );
    const modulesListCount = Math.floor(
      modulesListBytes.length / SIZEOF_MODULE
    );

    if (isDebug()) {
      console.log(
        `extractClaudeJsFromNativeInstallation: Found ${modulesListCount} modules`
      );
    }

    // Search for claude.js module
    for (let i = 0; i < modulesListCount; i++) {
      const offset = i * SIZEOF_MODULE;
      const module = parseCompiledModuleGraphFile(modulesListBytes, offset);

      const moduleName = getStringPointerContent(bunData, module.name).toString(
        'utf-8'
      );

      if (isDebug()) {
        console.log(
          `extractClaudeJsFromNativeInstallation: Module ${i}: ${moduleName}`
        );
      }

      // Look for the claude module
      // The module name is typically:
      // - On Unix/macOS: /$bunfs/root/claude
      // - On Windows: B:/~BUN/root/claude.exe
      if (
        moduleName.endsWith('/claude') ||
        moduleName === 'claude' ||
        moduleName.endsWith('/claude.exe') ||
        moduleName === 'claude.exe'
      ) {
        const moduleContents = getStringPointerContent(
          bunData,
          module.contents
        );
        if (isDebug()) {
          console.log(
            `extractClaudeJsFromNativeInstallation: Found claude module, contents length=${moduleContents.length}`
          );
        }
        if (moduleContents.length > 0) {
          // TODO: REMOVE THIS TEMPORARY DEBUG CODE - Writing extracted claude.js to temp file for debugging
          // TODO: This should be removed once debugging is complete
          // TODO: Remove the os and path imports at the top of the file as well
          try {
            const tempDir = os.tmpdir();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const tempFile = path.join(tempDir, `claude-extracted-${timestamp}.js`);
            fs.writeFileSync(tempFile, moduleContents);
            console.log(`[DEBUG] Extracted claude.js written to: ${tempFile}`);
          } catch (writeError) {
            console.error('[DEBUG] Failed to write extracted claude.js to temp file:', writeError);
          }
          // TODO: END OF TEMPORARY DEBUG CODE

          return moduleContents;
        }
      }
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

function serializeOffsets(bunOffsets: BunOffsets): Buffer {
  const buffer = Buffer.allocUnsafe(SIZEOF_OFFSETS);
  let pos = 0;

  // Write byte_count as uint64
  const byteCount =
    typeof bunOffsets.byte_count === 'bigint'
      ? bunOffsets.byte_count
      : BigInt(bunOffsets.byte_count);
  buffer.writeBigUInt64LE(byteCount, pos);
  pos += 8;

  // Write modules_ptr (StringPointer)
  buffer.writeUInt32LE(bunOffsets.modules_ptr.offset, pos);
  pos += 4;
  buffer.writeUInt32LE(bunOffsets.modules_ptr.length, pos);
  pos += 4;

  // Write entry_point_id
  buffer.writeUInt32LE(bunOffsets.entry_point_id, pos);
  pos += 4;

  // Write compile_exec_argv_ptr (StringPointer)
  buffer.writeUInt32LE(bunOffsets.compile_exec_argv_ptr.offset, pos);
  pos += 4;
  buffer.writeUInt32LE(bunOffsets.compile_exec_argv_ptr.length, pos);

  return buffer;
}

function serializeCompiledModuleGraphFile(module: BunModule): Buffer {
  const buffer = Buffer.allocUnsafe(SIZEOF_MODULE);
  let pos = 0;

  // Write name StringPointer
  buffer.writeUInt32LE(module.name.offset, pos);
  pos += 4;
  buffer.writeUInt32LE(module.name.length, pos);
  pos += 4;

  // Write contents StringPointer
  buffer.writeUInt32LE(module.contents.offset, pos);
  pos += 4;
  buffer.writeUInt32LE(module.contents.length, pos);
  pos += 4;

  // Write sourcemap StringPointer
  buffer.writeUInt32LE(module.sourcemap.offset, pos);
  pos += 4;
  buffer.writeUInt32LE(module.sourcemap.length, pos);
  pos += 4;

  // Write bytecode StringPointer
  buffer.writeUInt32LE(module.bytecode.offset, pos);
  pos += 4;
  buffer.writeUInt32LE(module.bytecode.length, pos);
  pos += 4;

  // Write flags
  buffer.writeUInt8(module.encoding, pos);
  pos += 1;
  buffer.writeUInt8(module.loader, pos);
  pos += 1;
  buffer.writeUInt8(module.module_format, pos);
  pos += 1;
  buffer.writeUInt8(module.side, pos);

  return buffer;
}

function rebuildBunData(
  modulesList: BunModule[],
  bunData: Buffer,
  bunOffsets: BunOffsets,
  modifiedClaudeJs: Buffer | null
): { newBuffer: Buffer; newOffsets: BunOffsets } {
  // Phase 1: Collect all string data
  const stringsData: Buffer[] = [];
  const modulesMetadata: Array<{
    name: Buffer;
    contents: Buffer;
    sourcemap: Buffer;
    bytecode: Buffer;
    encoding: number;
    loader: number;
    module_format: number;
    side: number;
  }> = [];

  for (const module of modulesList) {
    const nameBytes = getStringPointerContent(bunData, module.name);
    const moduleName = nameBytes.toString('utf-8');

    // Check if this is claude.js and we have modified contents
    let contentsBytes: Buffer;
    if (
      modifiedClaudeJs &&
      (moduleName.endsWith('/claude') ||
        moduleName === 'claude' ||
        moduleName.endsWith('/claude.exe') ||
        moduleName === 'claude.exe')
    ) {
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
      module_format: module.module_format,
      side: module.side,
    });

    stringsData.push(nameBytes, contentsBytes, sourcemapBytes, bytecodeBytes);
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
  const modulesListSize = modulesList.length * SIZEOF_MODULE;
  currentOffset += modulesListSize;

  // compile_exec_argv
  const compileExecArgvBytes = getStringPointerContent(
    bunData,
    bunOffsets.compile_exec_argv_ptr
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

  // Write compile_exec_argv
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
      module_format: metadata.module_format,
      side: metadata.side,
    };

    const moduleBytes = serializeCompiledModuleGraphFile(moduleStruct);
    const moduleOffset = modulesListOffset + i * SIZEOF_MODULE;
    moduleBytes.copy(newBuffer, moduleOffset);
  }

  // Build and write Offsets structure
  const newOffsets: BunOffsets = {
    byte_count: offsetsOffset,
    modules_ptr: {
      offset: modulesListOffset,
      length: modulesListSize,
    },
    entry_point_id: bunOffsets.entry_point_id,
    compile_exec_argv_ptr: {
      offset: compileExecArgvOffset,
      length: compileExecArgvLength,
    },
  };

  const offsetsBytes = serializeOffsets(newOffsets);
  offsetsBytes.copy(newBuffer, offsetsOffset);

  // Write trailer
  BUN_TRAILER.copy(newBuffer, trailerOffset);

  return { newBuffer, newOffsets };
}

/**
 * Safely writes a buffer to a file using atomic rename.
 * Writes to a temp file first, then atomically renames it to the target path.
 * This allows updating executables even while they're running on Unix-like systems.
 */
function safeWriteFile(filePath: string, data: Buffer, mode?: number): void {
  const tempPath = filePath + '.tmp';

  if (isDebug()) {
    console.log(`safeWriteFile: Writing ${data.length} bytes to ${tempPath}`);
  }

  try {
    // Write to temporary file
    fs.writeFileSync(tempPath, data);

    // Verify the write
    const writtenSize = fs.statSync(tempPath).size;
    if (isDebug()) {
      console.log(`safeWriteFile: Wrote ${writtenSize} bytes to temp file`);
    }

    if (writtenSize !== data.length) {
      throw new Error(
        `Write size mismatch: expected ${data.length}, got ${writtenSize}`
      );
    }

    // Set permissions if specified
    if (mode !== undefined) {
      fs.chmodSync(tempPath, mode);
    }

    // Atomically rename temp file to target
    fs.renameSync(tempPath, filePath);

    // Verify final file
    const finalSize = fs.statSync(filePath).size;
    if (isDebug()) {
      console.log(`safeWriteFile: Final file size: ${finalSize} bytes`);
    }
  } catch (error) {
    // Clean up temp file if it exists
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }

    // Check if it's a "file busy" error
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

function repackMachO(
  binPath: string,
  newBunBuffer: Buffer,
  outputPath: string
): void {
  try {
    // Use LIEF.parse() which returns MachO.Binary for MachO files
    const binary = LIEF.parse(binPath);

    if (binary.format !== 'MachO') {
      throw new Error(`Expected MachO binary, got ${binary.format}`);
    }

    // Cast to access MachO-specific methods
    const machoBinary = binary as LIEF.MachO.Binary;

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

    // Build new section data: 4-byte size + content
    const newSectionData = Buffer.allocUnsafe(4 + newBunBuffer.length);
    newSectionData.writeUInt32LE(newBunBuffer.length, 0);
    newBunBuffer.copy(newSectionData, 4);

    if (isDebug()) {
      console.log(`repackMachO: Original section size: ${bunSection.size}`);
      console.log(
        `repackMachO: Original segment file_size: ${bunSegment.fileSize}`
      );
      console.log(
        `repackMachO: Original segment virtual_size: ${bunSegment.virtualSize}`
      );
      console.log(`repackMachO: New data size: ${newSectionData.length}`);
    }

    // Calculate how much we need to expand
    const sizeDiff = newSectionData.length - Number(bunSection.size);

    if (sizeDiff > 0) {
      // CRITICAL: Round up to page alignment (4096 bytes)
      // macOS requires segments to be page-aligned, otherwise __LINKEDIT becomes misaligned
      const PAGE_SIZE = 4096;
      const alignedSizeDiff = Math.ceil(sizeDiff / PAGE_SIZE) * PAGE_SIZE;

      if (isDebug()) {
        console.log(`repackMachO: Need to expand by ${sizeDiff} bytes`);
        console.log(
          `repackMachO: Rounding up to page-aligned: ${alignedSizeDiff} bytes`
        );
      }

      // Extend the segment by the page-aligned amount
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
          `repackMachO: Segment file_size after extend: ${bunSegment.fileSize}`
        );
        console.log(
          `repackMachO: Segment virtual_size after extend: ${bunSegment.virtualSize}`
        );
      }
    }

    // Update section content
    bunSection.content = Array.from(newSectionData);

    // Explicitly set the section size
    bunSection.size = BigInt(newSectionData.length);

    if (isDebug()) {
      console.log(`repackMachO: Final section size: ${bunSection.size}`);
      console.log(`repackMachO: Writing modified binary to ${outputPath}...`);
    }

    // Write the modified binary using atomic rename
    const tempPath = outputPath + '.tmp';
    machoBinary.write(tempPath);

    // Copy original file permissions
    const origStat = fs.statSync(binPath);
    fs.chmodSync(tempPath, origStat.mode);

    // Atomically rename
    fs.renameSync(tempPath, outputPath);

    // Re-sign the binary with an ad-hoc signature
    // This is required on macOS after modifying a binary
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
      // Don't throw - the binary might still work in some cases
    }

    if (isDebug()) {
      console.log('repackMachO: Write completed successfully');
    }
  } catch (error) {
    console.error('repackMachO failed:', error);
    throw error;
  }
}

function align(value: number, alignment: number): number {
  if (value % alignment === 0) return value;
  return value + (alignment - (value % alignment));
}

function repackPE(
  binPath: string,
  newBunBuffer: Buffer,
  outputPath: string
): void {
  try {
    const fileData = fs.readFileSync(binPath);
    const exe = NtExecutable.from(fileData.buffer, { ignoreCert: true });

    // Get alignment values
    const fileAlignment = exe.getFileAlignment();
    const sectionAlignment = exe.getSectionAlignment();

    if (isDebug()) {
      console.log(`repackPE: File alignment: ${fileAlignment}, Section alignment: ${sectionAlignment}`);
    }

    // Find .bun section
    const sections = exe.getAllSections();
    const bunSection = sections.find((sec: any) => {
      const cleanName = sec.info.name.replace(/\0/g, '');
      return cleanName === '.bun';
    });

    if (!bunSection) {
      throw new Error('.bun section not found');
    }

    // Build new section data: 4-byte size + content
    const newSectionData = Buffer.allocUnsafe(4 + newBunBuffer.length);
    newSectionData.writeUInt32LE(newBunBuffer.length, 0);
    newBunBuffer.copy(newSectionData, 4);

    if (isDebug()) {
      console.log(`repackPE: Original section size: ${bunSection.data?.byteLength || 0}`);
      console.log(`repackPE: New data size: ${newSectionData.length}`);
    }

    // Update the section data
    bunSection.data = newSectionData.buffer.slice(
      newSectionData.byteOffset,
      newSectionData.byteOffset + newSectionData.byteLength
    );

    // Manually update section header sizes with proper alignment
    bunSection.info.virtualSize = newSectionData.length;
    bunSection.info.sizeOfRawData = align(newSectionData.length, fileAlignment);

    if (isDebug()) {
      console.log(`repackPE: Aligned SizeOfRawData: ${bunSection.info.sizeOfRawData}`);
    }

    // Recalculate SizeOfImage in optional header
    const headers = exe.newHeader;
    let newSizeOfImage = exe.getTotalHeaderSize();

    for (const section of sections) {
      newSizeOfImage += align(section.info.virtualSize, sectionAlignment);
    }

    headers.optionalHeader.sizeOfImage = newSizeOfImage;

    if (isDebug()) {
      console.log(`repackPE: Updated SizeOfImage: ${newSizeOfImage}`);
      console.log(`repackPE: Writing modified binary to ${outputPath}...`);
    }

    // Generate with proper file alignment padding
    const newBinary = exe.generate(fileAlignment);

    // Write the modified binary directly
    fs.writeFileSync(outputPath, Buffer.from(newBinary));

    if (isDebug()) {
      console.log('repackPE: Write completed successfully');
    }
  } catch (error) {
    console.error('repackPE failed:', error);
    throw error;
  }
}

function repackELF(
  binPath: string,
  newBunBuffer: Buffer,
  bunOffsets: BunOffsets,
  outputPath: string
): void {
  const fileSize = fs.statSync(binPath).size;

  // Calculate where Bun data starts
  const tailDataSize = 8 + BUN_TRAILER.length + SIZEOF_OFFSETS;
  const byteCount =
    typeof bunOffsets.byte_count === 'bigint'
      ? Number(bunOffsets.byte_count)
      : bunOffsets.byte_count;
  const bunDataStart = fileSize - tailDataSize - byteCount;

  // Read everything before Bun data
  const fd = fs.openSync(binPath, 'r');
  const originalBinary = Buffer.allocUnsafe(bunDataStart);
  fs.readSync(fd, originalBinary, 0, bunDataStart, 0);
  fs.closeSync(fd);

  // Build new tail
  const totalByteCount =
    newBunBuffer.length + BUN_TRAILER.length + SIZEOF_OFFSETS;
  const newTail = Buffer.allocUnsafe(newBunBuffer.length + 8);
  newBunBuffer.copy(newTail, 0);
  newTail.writeBigUInt64LE(BigInt(totalByteCount), newBunBuffer.length);

  // Concatenate original binary with new tail
  const modifiedBinary = Buffer.concat([originalBinary, newTail]);

  // Write modified binary using atomic rename
  safeWriteFile(outputPath, modifiedBinary, 0o755);
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
  // Disable LIEF logging to avoid error spamming
  LIEF.logging.disable();

  // Extract Bun data
  const { bunOffsets, bunData } = getBunData(binPath);

  if (!bunOffsets || !bunData) {
    throw new Error('Failed to extract Bun data from binary');
  }

  // Parse modules
  const modulesListBytes = getStringPointerContent(
    bunData,
    bunOffsets.modules_ptr
  );
  const modulesListCount = Math.floor(modulesListBytes.length / SIZEOF_MODULE);
  const modulesList: BunModule[] = [];

  for (let i = 0; i < modulesListCount; i++) {
    const offset = i * SIZEOF_MODULE;
    const module = parseCompiledModuleGraphFile(modulesListBytes, offset);
    modulesList.push(module);
  }

  // Rebuild Bun data with modified claude.js
  const { newBuffer } = rebuildBunData(
    modulesList,
    bunData,
    bunOffsets,
    modifiedClaudeJs
  );

  // Detect format
  const format = detectBinaryFormat(binPath);

  // Repack based on format
  if (format === 'MachO') {
    repackMachO(binPath, newBuffer, outputPath);
  } else if (format === 'PE') {
    repackPE(binPath, newBuffer, outputPath);
  } else if (format === 'ELF') {
    repackELF(binPath, newBuffer, bunOffsets, outputPath);
  } else {
    throw new Error(`Unsupported binary format: ${format}`);
  }
}
