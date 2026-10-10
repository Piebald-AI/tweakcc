// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

/**
 * Find the file read token limit (25000) that's associated with file reading.
 *
 * Approach: Find "=25000," and verify a known anchor appears nearby to ensure
 * we're targeting the correct value. Supports multiple anchors across CC versions:
 * - "<system-reminder>" (CC <2.1.83)
 * - "tengu_amber_wren" (CC >=2.1.83)
 */
const getFileReadLimitLocation = (oldFile: string): LocationResult | null => {
  const newConfigRegion = oldFile.match(
    /CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS[\s\S]{0,1200}tengu_amber_wren/
  );
  if (newConfigRegion && newConfigRegion.index !== undefined) {
    const tokenLimitMatch = newConfigRegion[0].match(/=25000,/);
    if (tokenLimitMatch && tokenLimitMatch.index !== undefined) {
      const startIndex = newConfigRegion.index + tokenLimitMatch.index + 1;
      return { startIndex, endIndex: startIndex + 5 };
    }
  }

  // CC 2.1.29x: the default is the fallback in defaultFileReadingLimits;
  // 2.1.296 put the allow_large hint strings between it and the error class:
  //   var Ugo=25000,Aws=` To read it anyway, …`,…,jgo=128;class $de extends Error{…
  //   …defaultFileReadingLimits??={maxSizeBytes:Y5e,maxTokens:i()??Ugo}
  const limitsDefault = oldFile.match(
    /defaultFileReadingLimits\?\?=\{maxSizeBytes:[$\w]+,maxTokens:[$\w]+\(\)\?\?([$\w]+)\}/
  );
  if (limitsDefault) {
    const name = limitsDefault[1].replace(/\$/g, '\\$');
    const declaration = oldFile.match(
      new RegExp(`(?:var |,)${name}=25000[,;]`)
    );
    if (declaration?.index !== undefined) {
      const startIndex = declaration.index + declaration[0].length - 6;
      return { startIndex, endIndex: startIndex + 5 };
    }
  }

  // CC 2.1.2xx: the default lives beside the MaxFileReadTokenExceededError
  // class and the CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS reader:
  //   var kTr=25000,TTr=128;class bEe extends Error{…File content (${e} tokens) exceeds maximum allowed tokens…
  const errorClassRegion = oldFile.match(
    /=25000,[$\w]+=\d+;class [$\w]+ extends Error\{[^]{0,200}?exceeds maximum allowed tokens/
  );
  if (errorClassRegion && errorClassRegion.index !== undefined) {
    const startIndex = errorClassRegion.index + 1;
    return { startIndex, endIndex: startIndex + 5 };
  }

  // Try anchors in order of preference
  const anchors = ['<system-reminder>', 'tengu_amber_wren'];

  let match: RegExpMatchArray | null = null;
  for (const anchor of anchors) {
    const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`=25000,([\\s\\S]{0,700})${escaped}`);
    match = oldFile.match(pattern);
    if (match && match.index !== undefined) break;
  }

  if (!match || match.index === undefined) {
    console.error(
      'patch: increaseFileReadLimit: failed to find 25000 token limit near known anchor'
    );
    return null;
  }

  // The "25000" starts at match.index + 1 (after the "=")
  const startIndex = match.index + 1;
  const endIndex = startIndex + 5; // "25000" is 5 characters

  return {
    startIndex,
    endIndex,
  };
};

export const writeIncreaseFileReadLimit = (oldFile: string): string | null => {
  const location = getFileReadLimitLocation(oldFile);
  if (!location) {
    return null;
  }

  const newValue = '1000000';
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newValue +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newValue, location.startIndex, location.endIndex);
  return newFile;
};
