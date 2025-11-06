import fs from 'fs';
import path from 'path';
import { Parser } from 'binary-parser';
import MachO from 'macho';
import { NtExecutable } from 'pe-library';

// Constants
const BUN_TRAILER = Buffer.from('\n---- Bun! ----\n');
const BASE_PATH = '/$bunfs/';
const BASE_PATH_WINDOWS = 'B:/~BUN/';
const BASE_PUBLIC_PATH_SUFFIX = 'root/';

// Enums
const Encoding = {
  binary: 0,
  latin1: 1,
  utf8: 2
};

const ModuleFormat = {
  none: 0,
  esm: 1,
  cjs: 2
};

const FileSide = {
  server: 0,
  client: 1
};

const Loader = {
  0: 'jsx',
  1: 'js',
  2: 'ts',
  3: 'tsx',
  4: 'css',
  5: 'file',
  6: 'json',
  7: 'jsonc',
  8: 'toml',
  9: 'wasm',
  10: 'napi',
  11: 'base64',
  12: 'dataurl',
  13: 'text',
  14: 'bunsh',
  15: 'sqlite',
  16: 'sqlite_embedded',
  17: 'html',
  18: 'yaml'
};

// Binary structure parsers using binary-parser
const StringPointerParser = new Parser()
  .endianess('little')
  .uint32('offset')
  .uint32('length');

const OffsetsParser = new Parser()
  .endianess('little')
  .uint64('byte_count')  // size_t is 8 bytes on 64-bit systems
  .nest('modules_ptr', { type: StringPointerParser })
  .uint32('entry_point_id')
  .nest('compile_exec_argv_ptr', { type: StringPointerParser });

const CompiledModuleGraphFileParser = new Parser()
  .endianess('little')
  .nest('name', { type: StringPointerParser })
  .nest('contents', { type: StringPointerParser })
  .nest('sourcemap', { type: StringPointerParser })
  .nest('bytecode', { type: StringPointerParser })
  .uint8('encoding')
  .uint8('loader')
  .uint8('module_format')
  .uint8('side');

// Size constants
// Note: Offsets structure has 4 bytes of padding at the end for alignment
const SIZEOF_OFFSETS = 32;  // byte_count(8) + modules_ptr(8) + entry_point_id(4) + compile_exec_argv_ptr(8) + padding(4)
const SIZEOF_STRING_POINTER = 8;  // offset(4) + length(4)
const SIZEOF_MODULE = 4 * SIZEOF_STRING_POINTER + 4;  // 4 StringPointers + 4 bytes for flags

// Helper functions
function getStringPointerContent(buffer, stringPointer) {
  return buffer.slice(stringPointer.offset, stringPointer.offset + stringPointer.length);
}

function extractBunDataFromSection(sectionData) {
  if (sectionData.length < 4) {
    console.error('Section data too small');
    return { bunOffsets: null, bunData: null };
  }

  // Read 4-byte size header
  const bunDataSize = sectionData.readUInt32LE(0);
  const bunDataContent = sectionData.slice(4, 4 + bunDataSize);

  if (bunDataContent.length < SIZEOF_OFFSETS + BUN_TRAILER.length) {
    console.error('BUN data is too small to contain trailer and offsets');
    return { bunOffsets: null, bunData: null };
  }

  // Verify trailer
  const trailerStart = bunDataContent.length - BUN_TRAILER.length;
  const trailerBytes = bunDataContent.slice(trailerStart);
  if (!trailerBytes.equals(BUN_TRAILER)) {
    console.error('BUN trailer bytes do not match trailer');
    return { bunOffsets: null, bunData: null };
  }

  // Parse Offsets structure
  const offsetsStart = bunDataContent.length - SIZEOF_OFFSETS - BUN_TRAILER.length;
  const offsetsBytes = bunDataContent.slice(offsetsStart, offsetsStart + SIZEOF_OFFSETS);
  const bunOffsets = OffsetsParser.parse(offsetsBytes);

  return { bunOffsets, bunData: bunDataContent };
}

function extractBunDataFromELFTail(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const stats = fs.fstatSync(fd);
    const fileSize = stats.size;

    // Read last 4096 bytes
    const tailSize = 4096;
    const tailBuffer = Buffer.allocUnsafe(tailSize);
    fs.readSync(fd, tailBuffer, 0, tailSize, fileSize - tailSize);

    if (tailBuffer.length < BUN_TRAILER.length + 8 + SIZEOF_OFFSETS) {
      console.error('ELF tail data is too small');
      return { bunOffsets: null, bunData: null };
    }

    // Read total byte count from last 8 bytes
    const totalByteCount = tailBuffer.readBigUInt64LE(tailBuffer.length - 8);
    if (totalByteCount < 4096n || totalByteCount > 2n ** 32n - 1n) {
      console.error(`ELF total byte count is out of range: ${totalByteCount}`);
      return { bunOffsets: null, bunData: null };
    }

    // Verify trailer
    const trailerStart = tailBuffer.length - 8 - BUN_TRAILER.length;
    const trailerBytes = tailBuffer.slice(trailerStart, trailerStart + BUN_TRAILER.length);
    if (!trailerBytes.equals(BUN_TRAILER)) {
      console.error('ELF trailer bytes do not match trailer');
      return { bunOffsets: null, bunData: null };
    }

    // Parse Offsets structure
    const offsetsStart = tailBuffer.length - 8 - BUN_TRAILER.length - SIZEOF_OFFSETS;
    const offsetsBytes = tailBuffer.slice(offsetsStart, offsetsStart + SIZEOF_OFFSETS);
    const bunOffsets = OffsetsParser.parse(offsetsBytes);

    const byteCountBigInt = typeof bunOffsets.byte_count === 'bigint'
      ? bunOffsets.byte_count
      : BigInt(bunOffsets.byte_count);

    if (byteCountBigInt >= totalByteCount) {
      console.error(`ELF total byte count is out of range`);
      return { bunOffsets: null, bunData: null };
    }

    // Read actual Bun data
    const tailDataLen = 8 + BUN_TRAILER.length + SIZEOF_OFFSETS;
    const bunDataStart = fileSize - tailDataLen - Number(byteCountBigInt);
    const bunDataBuffer = Buffer.allocUnsafe(Number(byteCountBigInt));
    fs.readSync(fd, bunDataBuffer, 0, Number(byteCountBigInt), bunDataStart);

    return { bunOffsets, bunData: bunDataBuffer };
  } finally {
    fs.closeSync(fd);
  }
}

function getBunDataFromMachO(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const macho = MachO.parse(fileBuffer);

  if (!macho || !macho.cmds) {
    console.error('Failed to parse Mach-O file');
    return { bunOffsets: null, bunData: null, basePublicPathPrefix: BASE_PATH };
  }

  // Find __BUN segment (segments are in cmds with type 'segment_64' or 'segment')
  const segments = macho.cmds.filter(c => c.type === 'segment_64' || c.type === 'segment');
  const bunSegment = segments.find(seg => seg.name === '__BUN');
  if (!bunSegment) {
    console.error('__BUN segment not found');
    return { bunOffsets: null, bunData: null, basePublicPathPrefix: BASE_PATH };
  }

  const bunSection = bunSegment.sections?.find(sec => sec.sectname === '__bun');
  if (!bunSection) {
    console.error('__bun section not found');
    return { bunOffsets: null, bunData: null, basePublicPathPrefix: BASE_PATH };
  }

  // Extract section data
  const sectionData = fileBuffer.slice(bunSection.offset, bunSection.offset + bunSection.size);
  const { bunOffsets, bunData } = extractBunDataFromSection(sectionData);

  return { bunOffsets, bunData, basePublicPathPrefix: BASE_PATH };
}

function getBunDataFromPE(filePath) {
  const fileData = fs.readFileSync(filePath);
  const exe = NtExecutable.from(fileData.buffer, { ignoreCert: true });

  // Find .bun section
  const sections = exe.getAllSections();
  const bunSection = sections.find(sec => {
    // sec.info.name is a string
    const cleanName = sec.info.name.replace(/\0/g, '');
    return cleanName === '.bun';
  });

  if (!bunSection || !bunSection.data) {
    console.error('.bun section not found');
    return { bunOffsets: null, bunData: null, basePublicPathPrefix: BASE_PATH_WINDOWS };
  }

  const sectionData = Buffer.from(bunSection.data);
  const { bunOffsets, bunData } = extractBunDataFromSection(sectionData);

  return { bunOffsets, bunData, basePublicPathPrefix: BASE_PATH_WINDOWS };
}

function detectBinaryFormat(filePath) {
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

function getBunData(binPath) {
  const format = detectBinaryFormat(binPath);

  switch (format) {
    case 'MachO':
      return getBunDataFromMachO(binPath);
    case 'PE':
      return getBunDataFromPE(binPath);
    case 'ELF':
      return { ...extractBunDataFromELFTail(binPath), basePublicPathPrefix: BASE_PATH };
    default:
      console.error('Unknown binary format');
      return { bunOffsets: null, bunData: null, basePublicPathPrefix: BASE_PATH };
  }
}

// Main execution
function main() {
  if (process.argv.length < 3) {
    console.error('Missing binary file path argument');
    console.error('Usage: node bun_unpack.js <binary_file_path>');
    process.exit(1);
  }

  const binFilePath = process.argv[2];

  if (!fs.existsSync(binFilePath)) {
    console.error(`File not found: ${binFilePath}`);
    process.exit(1);
  }

  const { bunOffsets, bunData, basePublicPathPrefix } = getBunData(binFilePath);

  if (!bunOffsets || !bunData) {
    console.error('Failed to get bun data');
    process.exit(1);
  }

  // Parse modules list
  const modulesListBytes = getStringPointerContent(bunData, bunOffsets.modules_ptr);
  const modulesListCount = Math.floor(modulesListBytes.length / SIZEOF_MODULE);
  const modulesList = [];

  for (let i = 0; i < modulesListCount; i++) {
    const offset = i * SIZEOF_MODULE;
    const moduleBytes = modulesListBytes.slice(offset, offset + SIZEOF_MODULE);
    const module = CompiledModuleGraphFileParser.parse(moduleBytes);
    modulesList.push(module);
  }

  // Extract modules to disk
  const outputPath = 'out_modules';
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  for (let idx = 0; idx < modulesList.length; idx++) {
    const module = modulesList[idx];
    const moduleName = getStringPointerContent(bunData, module.name).toString('utf-8');
    const moduleContents = getStringPointerContent(bunData, module.contents);

    // Calculate output filename
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

    if (moduleContents.length === 0) {
      console.log(`Contents of ${moduleNameOut} are empty`);
      continue;
    }

    console.log(`Dump module ${moduleNameOut}`);
    const moduleOutPath = path.join(outputPath, moduleNameOut);

    // Create directory if needed
    const moduleDir = path.dirname(moduleOutPath);
    if (!fs.existsSync(moduleDir)) {
      fs.mkdirSync(moduleDir, { recursive: true });
    }

    fs.writeFileSync(moduleOutPath, moduleContents);
  }

  console.log(`\nExtracted ${modulesList.length} modules to ${outputPath}/`);
}

// Export for use in repack script
export {
  BUN_TRAILER,
  BASE_PATH,
  BASE_PATH_WINDOWS,
  BASE_PUBLIC_PATH_SUFFIX,
  Loader,
  SIZEOF_OFFSETS,
  SIZEOF_STRING_POINTER,
  SIZEOF_MODULE,
  StringPointerParser,
  OffsetsParser,
  CompiledModuleGraphFileParser,
  getStringPointerContent,
  extractBunDataFromSection,
  extractBunDataFromELFTail,
  getBunData,
  detectBinaryFormat
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
