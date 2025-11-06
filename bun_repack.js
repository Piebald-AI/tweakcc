import fs from 'fs';
import path from 'path';
import MachO from 'macho';
import { NtExecutable, calculateCheckSumForPE } from 'pe-library';
import {
  BUN_TRAILER,
  BASE_PATH,
  BASE_PATH_WINDOWS,
  BASE_PUBLIC_PATH_SUFFIX,
  Loader,
  SIZEOF_OFFSETS,
  SIZEOF_STRING_POINTER,
  SIZEOF_MODULE,
  getStringPointerContent,
  getBunData,
  detectBinaryFormat
} from './bun_unpack.js';

// Helper to write binary structures
function serializeStringPointer(offset, length) {
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeUInt32LE(offset, 0);
  buffer.writeUInt32LE(length, 4);
  return buffer;
}

function serializeOffsets(bunOffsets) {
  const buffer = Buffer.allocUnsafe(SIZEOF_OFFSETS);
  let pos = 0;

  // Write byte_count as uint64
  const byteCount = typeof bunOffsets.byte_count === 'bigint'
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

function serializeCompiledModuleGraphFile(module) {
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

function rebuildBunData(modulesList, bunData, bunOffsets, modifiedContentsMap) {
  console.log('\n=== Rebuilding Bun data ===');

  // Phase 1: Collect all string data
  const stringsData = [];
  const modulesMetadata = [];

  for (const module of modulesList) {
    const nameBytes = getStringPointerContent(bunData, module.name);
    const moduleName = nameBytes.toString('utf-8');

    // Check if modified
    let contentsBytes;
    if (modifiedContentsMap.has(moduleName)) {
      contentsBytes = modifiedContentsMap.get(moduleName);
      console.log(`Using modified contents for: ${moduleName}`);
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
      side: module.side
    });

    stringsData.push(nameBytes, contentsBytes, sourcemapBytes, bytecodeBytes);
  }

  // Phase 2: Calculate buffer layout
  let currentOffset = 0;
  const stringOffsets = [];

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
  const compileExecArgvBytes = getStringPointerContent(bunData, bunOffsets.compile_exec_argv_ptr);
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
    compileExecArgvBytes.copy(newBuffer, compileExecArgvOffset, 0, compileExecArgvLength);
    newBuffer[compileExecArgvOffset + compileExecArgvLength] = 0;
  }

  // Build and write module structures
  for (let i = 0; i < modulesMetadata.length; i++) {
    const metadata = modulesMetadata[i];
    const baseStringIdx = i * 4;

    const moduleStruct = {
      name: {
        offset: stringOffsets[baseStringIdx].offset,
        length: stringOffsets[baseStringIdx].length
      },
      contents: {
        offset: stringOffsets[baseStringIdx + 1].offset,
        length: stringOffsets[baseStringIdx + 1].length
      },
      sourcemap: {
        offset: stringOffsets[baseStringIdx + 2].offset,
        length: stringOffsets[baseStringIdx + 2].length
      },
      bytecode: {
        offset: stringOffsets[baseStringIdx + 3].offset,
        length: stringOffsets[baseStringIdx + 3].length
      },
      encoding: metadata.encoding,
      loader: metadata.loader,
      module_format: metadata.module_format,
      side: metadata.side
    };

    const moduleBytes = serializeCompiledModuleGraphFile(moduleStruct);
    const moduleOffset = modulesListOffset + i * SIZEOF_MODULE;
    moduleBytes.copy(newBuffer, moduleOffset);
  }

  // Build and write Offsets structure
  const newOffsets = {
    byte_count: offsetsOffset,
    modules_ptr: {
      offset: modulesListOffset,
      length: modulesListSize
    },
    entry_point_id: bunOffsets.entry_point_id,
    compile_exec_argv_ptr: {
      offset: compileExecArgvOffset,
      length: compileExecArgvLength
    }
  };

  const offsetsBytes = serializeOffsets(newOffsets);
  offsetsBytes.copy(newBuffer, offsetsOffset);

  // Write trailer
  BUN_TRAILER.copy(newBuffer, trailerOffset);

  console.log(`Total buffer size: ${newBuffer.length}`);
  console.log(`byte_count: ${newOffsets.byte_count}`);

  return { newBuffer, newOffsets };
}

function repackMachO(binPath, newBunBuffer, outputPath) {
  console.log('\n=== Repacking Mach-O ===');

  const fileBuffer = fs.readFileSync(binPath);
  const macho = MachO.parse(fileBuffer);

  // Find __BUN segment (segments are in cmds with type 'segment_64' or 'segment')
  const segments = macho.cmds.filter(c => c.type === 'segment_64' || c.type === 'segment');
  const bunSegment = segments.find(seg => seg.name === '__BUN');
  if (!bunSegment) {
    throw new Error('__BUN segment not found');
  }

  const bunSection = bunSegment.sections?.find(sec => sec.sectname === '__bun');
  if (!bunSection) {
    throw new Error('__bun section not found');
  }

  // Build new section data: 4-byte size + content
  const newSectionData = Buffer.allocUnsafe(4 + newBunBuffer.length);
  newSectionData.writeUInt32LE(newBunBuffer.length, 0);
  newBunBuffer.copy(newSectionData, 4);

  // Create a copy of the file buffer
  const newFileBuffer = Buffer.from(fileBuffer);

  // Replace section data
  if (newSectionData.length > bunSection.size) {
    console.warn(`WARNING: New section data (${newSectionData.length} bytes) is larger than original (${bunSection.size} bytes)`);
    console.warn('This may cause issues. Consider increasing section size.');
  }

  newSectionData.copy(newFileBuffer, bunSection.offset, 0, Math.min(newSectionData.length, bunSection.size));

  // Write to output
  fs.writeFileSync(outputPath, newFileBuffer);
  fs.chmodSync(outputPath, 0o755);

  console.log(`Wrote Mach-O binary to: ${outputPath}`);
}

function align(value, alignment) {
  if (value % alignment === 0) return value;
  return value + (alignment - (value % alignment));
}

function repackPE(binPath, newBunBuffer, outputPath) {
  console.log('\n=== Repacking PE ===');

  const fileData = fs.readFileSync(binPath);
  const exe = NtExecutable.from(fileData.buffer, { ignoreCert: true });

  // Get alignment values
  const fileAlignment = exe.getFileAlignment();
  const sectionAlignment = exe.getSectionAlignment();
  console.log(`File alignment: ${fileAlignment}, Section alignment: ${sectionAlignment}`);

  // Find .bun section
  const sections = exe.getAllSections();
  const bunSection = sections.find(sec => {
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

  console.log(`Original section size: ${bunSection.data?.byteLength || 0}`);
  console.log(`New data size: ${newSectionData.length}`);

  // Update the section data
  bunSection.data = newSectionData.buffer.slice(newSectionData.byteOffset, newSectionData.byteOffset + newSectionData.byteLength);

  // Manually update section header sizes with proper alignment
  bunSection.info.virtualSize = newSectionData.length;
  bunSection.info.sizeOfRawData = align(newSectionData.length, fileAlignment);

  console.log(`Aligned SizeOfRawData: ${bunSection.info.sizeOfRawData}`);

  // Recalculate SizeOfImage in optional header
  const headers = exe.newHeader;
  let newSizeOfImage = exe.getTotalHeaderSize();

  for (const section of sections) {
    newSizeOfImage += align(section.info.virtualSize, sectionAlignment);
  }

  headers.optionalHeader.sizeOfImage = newSizeOfImage;
  console.log(`Updated SizeOfImage: ${newSizeOfImage}`);

  console.log('Generating new PE binary...');

  // Generate with proper file alignment padding
  const newBinary = exe.generate(fileAlignment);

  // Write the modified binary
  fs.writeFileSync(outputPath, Buffer.from(newBinary));

  console.log(`Wrote PE binary to: ${outputPath}`);
}

function repackELF(binPath, newBunBuffer, bunOffsets, outputPath) {
  console.log('\n=== Repacking ELF ===');

  const fileSize = fs.statSync(binPath).size;

  // Calculate where Bun data starts
  const tailDataSize = 8 + BUN_TRAILER.length + SIZEOF_OFFSETS;
  const byteCount = typeof bunOffsets.byte_count === 'bigint'
    ? Number(bunOffsets.byte_count)
    : bunOffsets.byte_count;
  const bunDataStart = fileSize - tailDataSize - byteCount;

  // Read everything before Bun data
  const fd = fs.openSync(binPath, 'r');
  const originalBinary = Buffer.allocUnsafe(bunDataStart);
  fs.readSync(fd, originalBinary, 0, bunDataStart, 0);
  fs.closeSync(fd);

  // Build new tail
  const totalByteCount = newBunBuffer.length + BUN_TRAILER.length + SIZEOF_OFFSETS;
  const newTail = Buffer.allocUnsafe(newBunBuffer.length + 8);
  newBunBuffer.copy(newTail, 0);
  newTail.writeBigUInt64LE(BigInt(totalByteCount), newBunBuffer.length);

  // Write modified binary
  const outFd = fs.openSync(outputPath, 'w');
  fs.writeSync(outFd, originalBinary);
  fs.writeSync(outFd, newTail);
  fs.closeSync(outFd);

  // Make executable
  fs.chmodSync(outputPath, 0o755);

  console.log(`Wrote ELF binary to: ${outputPath}`);
}

function repackBunBinary(binPath, modulesList, bunData, bunOffsets, outputPath, modifiedContentsMap) {
  // Rebuild Bun data
  const { newBuffer, newOffsets } = rebuildBunData(modulesList, bunData, bunOffsets, modifiedContentsMap);

  // Detect format and repack
  const format = detectBinaryFormat(binPath);

  switch (format) {
    case 'MachO':
      repackMachO(binPath, newBuffer, outputPath);
      break;
    case 'PE':
      repackPE(binPath, newBuffer, outputPath);
      break;
    case 'ELF':
      repackELF(binPath, newBuffer, bunOffsets, outputPath);
      break;
    default:
      throw new Error('Unknown binary format');
  }
}

// Main execution
async function main() {
  if (process.argv.length < 4) {
    console.error('Usage: node bun_repack.js <input_binary> <output_binary> [modules_dir]');
    console.error('This script repacks a Bun binary with modules from the extraction directory.');
    console.error('1. First run bun_unpack.js to extract modules to out_modules/');
    console.error('2. Manually modify the files in out_modules/');
    console.error('3. Run this script to repack them into a new binary');
    process.exit(1);
  }

  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  const modulesDir = process.argv[4] || 'out_modules';

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(modulesDir)) {
    console.error(`Modules directory not found: ${modulesDir}`);
    console.error('Did you run bun_unpack.js first?');
    process.exit(1);
  }

  // Extract Bun data
  const { bunOffsets, bunData, basePublicPathPrefix } = getBunData(inputPath);

  if (!bunOffsets || !bunData) {
    console.error('Failed to get bun data');
    process.exit(1);
  }

  // Parse modules
  const modulesListBytes = getStringPointerContent(bunData, bunOffsets.modules_ptr);
  const modulesListCount = Math.floor(modulesListBytes.length / SIZEOF_MODULE);
  const modulesList = [];

  // Import parser
  const { CompiledModuleGraphFileParser } = await import('./bun_unpack.js');

  for (let i = 0; i < modulesListCount; i++) {
    const offset = i * SIZEOF_MODULE;
    const moduleBytes = modulesListBytes.slice(offset, offset + SIZEOF_MODULE);
    const module = CompiledModuleGraphFileParser.parse(moduleBytes);
    modulesList.push(module);
  }

  // Load modified modules from disk
  const modifiedContentsMap = new Map();

  for (let idx = 0; idx < modulesList.length; idx++) {
    const module = modulesList[idx];
    const moduleName = getStringPointerContent(bunData, module.name).toString('utf-8');

    // Calculate output filename (same logic as unpack)
    let moduleNameOut = moduleName.replace(basePublicPathPrefix, '');
    if (moduleNameOut.startsWith(BASE_PUBLIC_PATH_SUFFIX)) {
      moduleNameOut = moduleNameOut.replace(BASE_PUBLIC_PATH_SUFFIX, '');
    }

    if (idx === bunOffsets.entry_point_id) {
      const ext = path.extname(moduleNameOut);
      const base = path.basename(moduleNameOut, ext);
      const dir = path.dirname(moduleNameOut);
      moduleNameOut = path.join(dir, `${base}.${Loader[module.loader]}`);
    }

    // Try to read modified file
    const moduleFilePath = path.join(modulesDir, moduleNameOut);
    if (fs.existsSync(moduleFilePath)) {
      const modifiedContents = fs.readFileSync(moduleFilePath);
      modifiedContentsMap.set(moduleName, modifiedContents);
      console.log(`Loaded modified: ${moduleNameOut}`);
    } else if (module.contents.length > 0) {
      console.log(`Warning: Module file not found: ${moduleFilePath}`);
    }
  }

  if (modifiedContentsMap.size === 0) {
    console.error(`\nNo modified modules found in ${modulesDir}`);
    console.error('Did you run bun_unpack.js first?');
    process.exit(1);
  }

  console.log(`\nRepacking ${modifiedContentsMap.size} modules...`);

  // Repack
  repackBunBinary(inputPath, modulesList, bunData, bunOffsets, outputPath, modifiedContentsMap);

  console.log('\nDone! Test with:', outputPath);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
