/**
 * ELF-specific Bun binary extraction and repacking utilities.
 * No node-lief dependency — safe to import on any platform.
 *
 * Exports only the three functions used by nativeInstallationLoader.ts
 * to bypass the node-lief gate on Linux/NixOS.
 */

import fs from 'node:fs';
import { debug } from './utils';

// ============================================================================
// Constants and types (private)
// ============================================================================

const BUN_TRAILER = Buffer.from('\n---- Bun! ----\n');
const SIZEOF_OFFSETS = 32;
const SIZEOF_STRING_POINTER = 8;
const SIZEOF_MODULE_OLD = 4 * SIZEOF_STRING_POINTER + 4;
const SIZEOF_MODULE_NEW = 6 * SIZEOF_STRING_POINTER + 4;

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
  moduleStructSize: number;
}

// ============================================================================
// Parsing helpers (private)
// ============================================================================

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

function detectModuleStructSize(modulesListLength: number): number {
  const fitsNew = modulesListLength % SIZEOF_MODULE_NEW === 0;
  const fitsOld = modulesListLength % SIZEOF_MODULE_OLD === 0;
  if (fitsNew && !fitsOld) return SIZEOF_MODULE_NEW;
  if (fitsOld && !fitsNew) return SIZEOF_MODULE_OLD;
  return SIZEOF_MODULE_NEW;
}

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
  const count = Math.floor(modulesListBytes.length / moduleStructSize);
  for (let i = 0; i < count; i++) {
    const module = parseCompiledModuleGraphFile(
      modulesListBytes,
      i * moduleStructSize,
      moduleStructSize
    );
    const moduleName = getStringPointerContent(bunData, module.name).toString(
      'utf-8'
    );
    const result = visitor(module, moduleName, i);
    if (result !== undefined) return result;
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

// ============================================================================
// ELF extraction and repacking (private)
// ============================================================================

function extractBunDataFromELFRaw(filePath: string): BunData {
  const fd = fs.openSync(filePath, 'r');
  try {
    const { size: fileSize } = fs.fstatSync(fd);
    const tailSize = SIZEOF_OFFSETS + BUN_TRAILER.length + 8;
    if (fileSize < tailSize)
      throw new Error('File too small to contain Bun data');

    const tailBuffer = Buffer.allocUnsafe(tailSize);
    fs.readSync(fd, tailBuffer, 0, tailSize, fileSize - tailSize);

    const trailerStart = tailSize - 8 - BUN_TRAILER.length;
    if (
      !tailBuffer
        .subarray(trailerStart, trailerStart + BUN_TRAILER.length)
        .equals(BUN_TRAILER)
    ) {
      throw new Error('BUN trailer not found in ELF file');
    }

    const bunOffsets = parseOffsets(tailBuffer.subarray(0, SIZEOF_OFFSETS));
    const byteCount =
      typeof bunOffsets.byteCount === 'bigint'
        ? Number(bunOffsets.byteCount)
        : bunOffsets.byteCount;
    if (byteCount <= 0 || byteCount >= fileSize)
      throw new Error(`ELF byteCount out of range: ${byteCount}`);

    const dataStart =
      fileSize - 8 - BUN_TRAILER.length - SIZEOF_OFFSETS - byteCount;
    if (dataStart < 0)
      throw new Error('ELF data region extends before start of file');

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

function rebuildBunData(
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
    const contentsBytes =
      modifiedClaudeJs && isClaudeModule(moduleName)
        ? modifiedClaudeJs
        : getStringPointerContent(bunData, module.contents);
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
  for (const s of stringsData) {
    stringOffsets.push({ offset: currentOffset, length: s.length });
    currentOffset += s.length + 1;
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
    if (length > 0) stringsData[stringIdx].copy(newBuffer, offset, 0, length);
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
    const meta = modulesMetadata[i];
    const base = i * stringsPerModule;
    const struct: BunModule = {
      name: stringOffsets[base],
      contents: stringOffsets[base + 1],
      sourcemap: stringOffsets[base + 2],
      bytecode: stringOffsets[base + 3],
      moduleInfo:
        moduleStructSize === SIZEOF_MODULE_NEW
          ? stringOffsets[base + 4]
          : { offset: 0, length: 0 },
      bytecodeOriginPath:
        moduleStructSize === SIZEOF_MODULE_NEW
          ? stringOffsets[base + 5]
          : { offset: 0, length: 0 },
      encoding: meta.encoding,
      loader: meta.loader,
      moduleFormat: meta.moduleFormat,
      side: meta.side,
    };

    let pos = modulesListOffset + i * moduleStructSize;
    newBuffer.writeUInt32LE(struct.name.offset, pos);
    newBuffer.writeUInt32LE(struct.name.length, pos + 4);
    pos += 8;
    newBuffer.writeUInt32LE(struct.contents.offset, pos);
    newBuffer.writeUInt32LE(struct.contents.length, pos + 4);
    pos += 8;
    newBuffer.writeUInt32LE(struct.sourcemap.offset, pos);
    newBuffer.writeUInt32LE(struct.sourcemap.length, pos + 4);
    pos += 8;
    newBuffer.writeUInt32LE(struct.bytecode.offset, pos);
    newBuffer.writeUInt32LE(struct.bytecode.length, pos + 4);
    pos += 8;
    if (moduleStructSize === SIZEOF_MODULE_NEW) {
      newBuffer.writeUInt32LE(struct.moduleInfo.offset, pos);
      newBuffer.writeUInt32LE(struct.moduleInfo.length, pos + 4);
      pos += 8;
      newBuffer.writeUInt32LE(struct.bytecodeOriginPath.offset, pos);
      newBuffer.writeUInt32LE(struct.bytecodeOriginPath.length, pos + 4);
      pos += 8;
    }
    newBuffer.writeUInt8(struct.encoding, pos);
    newBuffer.writeUInt8(struct.loader, pos + 1);
    newBuffer.writeUInt8(struct.moduleFormat, pos + 2);
    newBuffer.writeUInt8(struct.side, pos + 3);
  }

  const byteCount = BigInt(offsetsOffset);
  let op = offsetsOffset;
  newBuffer.writeBigUInt64LE(byteCount, op);
  op += 8;
  newBuffer.writeUInt32LE(modulesListOffset, op);
  newBuffer.writeUInt32LE(modulesListSize, op + 4);
  op += 8;
  newBuffer.writeUInt32LE(bunOffsets.entryPointId, op);
  op += 4;
  newBuffer.writeUInt32LE(compileExecArgvOffset, op);
  newBuffer.writeUInt32LE(compileExecArgvLength, op + 4);
  op += 8;
  newBuffer.writeUInt32LE(bunOffsets.flags, op);

  BUN_TRAILER.copy(newBuffer, trailerOffset);
  return newBuffer;
}

function repackELFRaw(
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
  const origOffsets = parseOffsets(
    originalData.subarray(
      fileSize - tailSize,
      fileSize - tailSize + SIZEOF_OFFSETS
    )
  );
  const origByteCount =
    typeof origOffsets.byteCount === 'bigint'
      ? Number(origOffsets.byteCount)
      : origOffsets.byteCount;
  const dataStart =
    fileSize - BUN_TRAILER.length - SIZEOF_OFFSETS - 8 - origByteCount;
  const bytecodeSize = dataStart - elfSize;
  const newTotalByteCount = bytecodeSize + newBunBuffer.length;

  debug(
    `repackELFRaw: elfSize=${elfSize}, bytecodeSize=${bytecodeSize}, dataStart=${dataStart}, newBunBuffer=${newBunBuffer.length}`
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
  fs.chmodSync(tempPath, fs.statSync(binPath).mode);
  try {
    fs.renameSync(tempPath, outputPath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      /* ignore */
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
// Public API
// ============================================================================

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);

/** Returns true if the file at filePath starts with the ELF magic bytes. */
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

/**
 * Extracts claude.js from an ELF binary without node-lief.
 * Returns null if extraction fails.
 */
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

/**
 * Repacks a modified claude.js into an ELF binary without node-lief.
 */
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
