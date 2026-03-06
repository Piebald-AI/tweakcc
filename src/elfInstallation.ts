/**
 * ELF-specific Bun binary extraction and repacking utilities.
 * No node-lief dependency — safe to import on any platform.
 */

import fs from 'node:fs';
import { debug } from './utils';

// ============================================================================
// Constants and types
// ============================================================================

export const BUN_TRAILER = Buffer.from('\n---- Bun! ----\n');

export const SIZEOF_OFFSETS = 32;
export const SIZEOF_STRING_POINTER = 8;
export const SIZEOF_MODULE_OLD = 4 * SIZEOF_STRING_POINTER + 4;
export const SIZEOF_MODULE_NEW = 6 * SIZEOF_STRING_POINTER + 4;

export interface StringPointer {
  offset: number;
  length: number;
}

export interface BunOffsets {
  byteCount: bigint | number;
  modulesPtr: StringPointer;
  entryPointId: number;
  compileExecArgvPtr: StringPointer;
  flags: number;
}

export interface BunModule {
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

export interface BunData {
  bunOffsets: BunOffsets;
  bunData: Buffer;
  /** Header size used in section format: 4 for old format (Bun < 1.3.4), 8 for new format. Only for Mach-O and PE. */
  sectionHeaderSize?: number;
  /** Detected module struct size: SIZEOF_MODULE_OLD (36) or SIZEOF_MODULE_NEW (52). */
  moduleStructSize: number;
}

// ============================================================================
// Shared parsing helpers
// ============================================================================

export function getStringPointerContent(
  buffer: Buffer,
  stringPointer: StringPointer
): Buffer {
  return buffer.subarray(
    stringPointer.offset,
    stringPointer.offset + stringPointer.length
  );
}

export function parseStringPointer(
  buffer: Buffer,
  offset: number
): StringPointer {
  return {
    offset: buffer.readUInt32LE(offset),
    length: buffer.readUInt32LE(offset + 4),
  };
}

export function isClaudeModule(moduleName: string): boolean {
  return (
    moduleName.endsWith('/claude') ||
    moduleName === 'claude' ||
    moduleName.endsWith('/claude.exe') ||
    moduleName === 'claude.exe' ||
    moduleName.endsWith('/src/entrypoints/cli.js') ||
    moduleName === 'src/entrypoints/cli.js'
  );
}

export function detectModuleStructSize(modulesListLength: number): number {
  const fitsNew = modulesListLength % SIZEOF_MODULE_NEW === 0;
  const fitsOld = modulesListLength % SIZEOF_MODULE_OLD === 0;

  if (fitsNew && !fitsOld) return SIZEOF_MODULE_NEW;
  if (fitsOld && !fitsNew) return SIZEOF_MODULE_OLD;
  if (fitsNew && fitsOld) {
    debug(
      `detectModuleStructSize: Ambiguous module list length ${modulesListLength}, assuming new format`
    );
    return SIZEOF_MODULE_NEW;
  }

  debug(
    `detectModuleStructSize: Module list length ${modulesListLength} doesn't cleanly divide by either struct size, assuming new format`
  );
  return SIZEOF_MODULE_NEW;
}

export function mapModules<T>(
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

export function parseOffsets(buffer: Buffer): BunOffsets {
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

export function parseCompiledModuleGraphFile(
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

export function parseBunDataBlob(bunDataContent: Buffer): {
  bunOffsets: BunOffsets;
  bunData: Buffer;
  moduleStructSize: number;
} {
  if (bunDataContent.length < SIZEOF_OFFSETS + BUN_TRAILER.length) {
    throw new Error('BUN data is too small to contain trailer and offsets');
  }

  const trailerStart = bunDataContent.length - BUN_TRAILER.length;
  const trailerBytes = bunDataContent.subarray(trailerStart);

  debug(`parseBunDataBlob: Expected trailer: ${BUN_TRAILER.toString('hex')}`);
  debug(`parseBunDataBlob: Got trailer: ${trailerBytes.toString('hex')}`);

  if (!trailerBytes.equals(BUN_TRAILER)) {
    debug(`Expected: ${BUN_TRAILER.toString('hex')}`);
    debug(`Got: ${trailerBytes.toString('hex')}`);
    throw new Error('BUN trailer bytes do not match trailer');
  }

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

export function extractBunDataFromSection(sectionData: Buffer): BunData {
  if (sectionData.length < 4) {
    throw new Error('Section data too small');
  }

  debug(`extractBunDataFromSection: sectionData.length=${sectionData.length}`);

  const bunDataSizeU32 = sectionData.readUInt32LE(0);
  const expectedLengthU32 = 4 + bunDataSizeU32;

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

  if (
    sectionData.length >= 8 &&
    expectedLengthU64 <= sectionData.length &&
    expectedLengthU64 >= sectionData.length - 4096
  ) {
    headerSize = 8;
    bunDataSize = bunDataSizeU64;
    debug(
      `extractBunDataFromSection: detected u64 header format (Bun >= 1.3.4)`
    );
  } else if (
    expectedLengthU32 <= sectionData.length &&
    expectedLengthU32 >= sectionData.length - 4096
  ) {
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

// ============================================================================
// ELF-specific functions
// ============================================================================

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);

export function isELFFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.allocUnsafe(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf.equals(ELF_MAGIC);
  } catch {
    return false;
  }
}

export function extractBunDataFromELFRaw(filePath: string): BunData {
  const fd = fs.openSync(filePath, 'r');
  try {
    const { size: fileSize } = fs.fstatSync(fd);
    const tailSize = SIZEOF_OFFSETS + BUN_TRAILER.length + 8;

    if (fileSize < tailSize) {
      throw new Error('File too small to contain Bun data');
    }

    const tailBuffer = Buffer.allocUnsafe(tailSize);
    fs.readSync(fd, tailBuffer, 0, tailSize, fileSize - tailSize);

    const trailerStart = tailSize - 8 - BUN_TRAILER.length;
    const trailerBytes = tailBuffer.subarray(
      trailerStart,
      trailerStart + BUN_TRAILER.length
    );
    if (!trailerBytes.equals(BUN_TRAILER)) {
      throw new Error('BUN trailer not found in ELF file');
    }

    const offsetsBytes = tailBuffer.subarray(0, SIZEOF_OFFSETS);
    const bunOffsets = parseOffsets(offsetsBytes);
    const byteCount =
      typeof bunOffsets.byteCount === 'bigint'
        ? Number(bunOffsets.byteCount)
        : bunOffsets.byteCount;

    if (byteCount <= 0 || byteCount >= fileSize) {
      throw new Error(`ELF byteCount out of range: ${byteCount}`);
    }

    const dataStart =
      fileSize - 8 - BUN_TRAILER.length - SIZEOF_OFFSETS - byteCount;
    if (dataStart < 0) {
      throw new Error('ELF data region extends before start of file');
    }

    const bunDataBlob = Buffer.allocUnsafe(byteCount);
    fs.readSync(fd, bunDataBlob, 0, byteCount, dataStart);
    const moduleStructSize = detectModuleStructSize(
      bunOffsets.modulesPtr.length
    );

    debug(
      `extractBunDataFromELFRaw: byteCount=${byteCount}, moduleStructSize=${moduleStructSize}`
    );

    return { bunOffsets, bunData: bunDataBlob, moduleStructSize };
  } finally {
    fs.closeSync(fd);
  }
}

export function rebuildBunData(
  bunData: Buffer,
  bunOffsets: BunOffsets,
  modifiedClaudeJs: Buffer | null,
  moduleStructSize: number
): Buffer {
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

  mapModules(bunData, bunOffsets, moduleStructSize, (module, moduleName) => {
    const nameBytes = getStringPointerContent(bunData, module.name);

    let contentsBytes: Buffer;
    if (modifiedClaudeJs && isClaudeModule(moduleName)) {
      contentsBytes = modifiedClaudeJs;
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

  let currentOffset = 0;
  const stringOffsets: StringPointer[] = [];

  for (const stringData of stringsData) {
    stringOffsets.push({ offset: currentOffset, length: stringData.length });
    currentOffset += stringData.length + 1;
  }

  const modulesListOffset = currentOffset;
  const modulesListSize = modulesMetadata.length * moduleStructSize;
  currentOffset += modulesListSize;

  const compileExecArgvBytes = getStringPointerContent(
    bunData,
    bunOffsets.compileExecArgvPtr
  );
  const compileExecArgvOffset = currentOffset;
  const compileExecArgvLength = compileExecArgvBytes.length;
  currentOffset += compileExecArgvLength + 1;

  const offsetsOffset = currentOffset;
  currentOffset += SIZEOF_OFFSETS;

  const trailerOffset = currentOffset;
  currentOffset += BUN_TRAILER.length;

  const newBuffer = Buffer.allocUnsafe(currentOffset);
  newBuffer.fill(0);

  let stringIdx = 0;
  for (const { offset, length } of stringOffsets) {
    if (length > 0) {
      stringsData[stringIdx].copy(newBuffer, offset, 0, length);
    }
    newBuffer[offset + length] = 0;
    stringIdx++;
  }

  if (compileExecArgvLength > 0) {
    compileExecArgvBytes.copy(
      newBuffer,
      compileExecArgvOffset,
      0,
      compileExecArgvLength
    );
    newBuffer[compileExecArgvOffset + compileExecArgvLength] = 0;
  }

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

    const moduleOffset = modulesListOffset + i * moduleStructSize;
    let pos = moduleOffset;

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

    if (moduleStructSize === SIZEOF_MODULE_NEW) {
      newBuffer.writeUInt32LE(moduleStruct.moduleInfo.offset, pos);
      newBuffer.writeUInt32LE(moduleStruct.moduleInfo.length, pos + 4);
      pos += 8;
      newBuffer.writeUInt32LE(moduleStruct.bytecodeOriginPath.offset, pos);
      newBuffer.writeUInt32LE(moduleStruct.bytecodeOriginPath.length, pos + 4);
      pos += 8;
    }

    newBuffer.writeUInt8(moduleStruct.encoding, pos);
    newBuffer.writeUInt8(moduleStruct.loader, pos + 1);
    newBuffer.writeUInt8(moduleStruct.moduleFormat, pos + 2);
    newBuffer.writeUInt8(moduleStruct.side, pos + 3);
  }

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

  BUN_TRAILER.copy(newBuffer, trailerOffset);

  return newBuffer;
}

export function buildSectionData(
  bunBuffer: Buffer,
  headerSize: number = 8
): Buffer {
  const sectionData = Buffer.allocUnsafe(headerSize + bunBuffer.length);
  if (headerSize === 8) {
    sectionData.writeBigUInt64LE(BigInt(bunBuffer.length), 0);
  } else {
    sectionData.writeUInt32LE(bunBuffer.length, 0);
  }
  bunBuffer.copy(sectionData, headerSize);
  return sectionData;
}

export function repackELFRaw(
  binPath: string,
  newBunBuffer: Buffer,
  outputPath: string
): void {
  const originalData = fs.readFileSync(binPath);
  const fileSize = originalData.length;
  const totalByteCount = Number(originalData.readBigUInt64LE(fileSize - 8));
  const elfSize = fileSize - totalByteCount - 8;

  if (elfSize <= 0 || elfSize >= fileSize) {
    throw new Error(`repackELFRaw: computed ELF size out of range: ${elfSize}`);
  }

  const tailSize = SIZEOF_OFFSETS + BUN_TRAILER.length + 8;
  const offsetsBytes = originalData.subarray(
    fileSize - tailSize,
    fileSize - tailSize + SIZEOF_OFFSETS
  );
  const origOffsets = parseOffsets(offsetsBytes);
  const origByteCount =
    typeof origOffsets.byteCount === 'bigint'
      ? Number(origOffsets.byteCount)
      : origOffsets.byteCount;
  const dataStart =
    fileSize - BUN_TRAILER.length - SIZEOF_OFFSETS - 8 - origByteCount;
  const bytecodeSize = dataStart - elfSize;

  const newTotalByteCount = bytecodeSize + newBunBuffer.length;

  debug(
    `repackELFRaw: elfSize=${elfSize}, bytecodeSize=${bytecodeSize}, dataStart=${dataStart}, totalByteCount=${totalByteCount}, newBunBuffer=${newBunBuffer.length}`
  );

  const newTailU64 = Buffer.allocUnsafe(8);
  newTailU64.writeBigUInt64LE(BigInt(newTotalByteCount));

  const newBinary = Buffer.concat([
    originalData.subarray(0, dataStart),
    newBunBuffer,
    newTailU64,
  ]);

  const tempPath = outputPath + '.tmp';
  fs.writeFileSync(tempPath, newBinary);
  const origStat = fs.statSync(binPath);
  fs.chmodSync(tempPath, origStat.mode);
  try {
    fs.renameSync(tempPath, outputPath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // ignore cleanup errors
    }
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
  debug('repackELFRaw: Write completed successfully');
}

// ============================================================================
// Public wrappers (no LIEF required)
// ============================================================================

export function extractClaudeJsFromELFBinary(path: string): Buffer | null {
  try {
    const { bunOffsets, bunData, moduleStructSize } =
      extractBunDataFromELFRaw(path);
    return (
      mapModules(
        bunData,
        bunOffsets,
        moduleStructSize,
        (module, moduleName) => {
          if (!isClaudeModule(moduleName)) return undefined;
          const contents = getStringPointerContent(bunData, module.contents);
          return contents.length > 0 ? contents : undefined;
        }
      ) ?? null
    );
  } catch (error) {
    debug('extractClaudeJsFromELFBinary: Error:', error);
    return null;
  }
}

export function repackELFBinary(
  binPath: string,
  modifiedClaudeJs: Buffer,
  outputPath: string
): void {
  const { bunOffsets, bunData, moduleStructSize } =
    extractBunDataFromELFRaw(binPath);
  const newBuffer = rebuildBunData(
    bunData,
    bunOffsets,
    modifiedClaudeJs,
    moduleStructSize
  );
  repackELFRaw(binPath, newBuffer, outputPath);
}
