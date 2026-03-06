/**
 * Utilities for extracting and repacking native installation binaries.
 */

import fs from 'node:fs';
import { execSync } from 'node:child_process';
import LIEF from 'node-lief';
import { isDebug, debug } from './utils';
import {
  BUN_TRAILER,
  SIZEOF_OFFSETS,
  type BunOffsets,
  type BunData,
  getStringPointerContent,
  isClaudeModule,
  detectModuleStructSize,
  mapModules,
  parseOffsets,
  extractBunDataFromSection,
  isELFFile,
  extractBunDataFromELFRaw,
  rebuildBunData,
  buildSectionData,
  repackELFRaw,
} from './elfInstallation';

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

function getBunData(binary: LIEF.Abstract.Binary): BunData {
  debug(`getBunData: Binary format detected as ${binary.format}`);

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
    let bunOffsets: BunOffsets;
    let bunData: Buffer;
    let moduleStructSize: number;

    if (isELFFile(nativeInstallationPath)) {
      ({ bunOffsets, bunData, moduleStructSize } = extractBunDataFromELFRaw(
        nativeInstallationPath
      ));
    } else {
      LIEF.logging.disable();
      const binary = LIEF.parse(nativeInstallationPath);
      ({ bunOffsets, bunData, moduleStructSize } = getBunData(binary));
    }

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

        const moduleContents = getStringPointerContent(
          bunData,
          module.contents
        );

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

    debug(`repackELF: Setting overlay data (${newOverlay.length} bytes)`);

    elfBinary.overlay = newOverlay;
    debug(`repackELF: Writing modified binary to ${outputPath}...`);

    atomicWriteBinary(elfBinary, outputPath, binPath);
    debug('repackELF: Write completed successfully');
  } catch (error) {
    console.error('repackELF failed:', error);
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
  if (isELFFile(binPath)) {
    const { bunOffsets, bunData, moduleStructSize } =
      extractBunDataFromELFRaw(binPath);
    const newBuffer = rebuildBunData(
      bunData,
      bunOffsets,
      modifiedClaudeJs,
      moduleStructSize
    );
    repackELFRaw(binPath, newBuffer, outputPath);
    return;
  }

  LIEF.logging.disable();
  const binary = LIEF.parse(binPath);

  const { bunOffsets, bunData, sectionHeaderSize, moduleStructSize } =
    getBunData(binary);
  const newBuffer = rebuildBunData(
    bunData,
    bunOffsets,
    modifiedClaudeJs,
    moduleStructSize
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
      repackELF(binary as LIEF.ELF.Binary, binPath, newBuffer, outputPath);
      break;
    default:
      throw new Error(`Unsupported binary format: ${binary.format}`);
  }
}
