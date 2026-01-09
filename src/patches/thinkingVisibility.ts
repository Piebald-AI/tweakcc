// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

/**
 * Forces thinking blocks to be visible inline by default.
 *
 * Two patches are required:
 * 1. Case statement - prevents thinking blocks from being skipped entirely
 * 2. FbH function - shows expanded view instead of collapsed "(ctrl+o to expand)"
 *
 * Both patches work by replacing variable references with literal `1` (truthy),
 * making the visibility conditions always pass.
 */

/**
 * Patch 1: Case statement visibility
 *
 * Original: case"thinking":{if(!J&&!I)return null
 * Patched:  case"thinking":{if(!1&&!1)return null
 *
 * Variable names (J, I) change between versions, so we use regex matching.
 */
const getCaseStatementLocation = (oldFile: string): LocationResult | null => {
  // Pattern matches: case"thinking":{if(!X&&!Y)return null
  // where X and Y are single-letter or multi-char identifiers
  const pattern = /case"thinking":\{if\(!([$\w]+)&&!([$\w]+)\)return null/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    // Try alternate pattern without the opening brace (older versions)
    const altPattern =
      /(case"thinking":)if\(!([$\w]+)&&!([$\w]+)\)return null;(.+?isTranscriptMode:)([$\w]+)([},])/;
    const altMatch = oldFile.match(altPattern);

    if (altMatch && altMatch.index !== undefined) {
      // Use original tweakcc approach for older format:
      // Remove the if/return and set isTranscriptMode to true
      const startIndex = altMatch.index;
      const endIndex = startIndex + altMatch[0].length;
      return {
        startIndex,
        endIndex,
        identifiers: [
          altMatch[1], // case"thinking":
          altMatch[4], // ...isTranscriptMode:
          'true',
          altMatch[6], // }, or ,
        ],
      };
    }

    console.error(
      'patch: thinkingVisibility: failed to find case statement pattern'
    );
    return null;
  }

  // For the new format, we just replace the variable names with 1
  // case"thinking":{if(!J&&!I) -> case"thinking":{if(!1&&!1)
  const fullMatch = match[0];
  const var1 = match[1];
  const var2 = match[2];

  const startIndex = match.index;
  const endIndex = startIndex + fullMatch.length;

  return {
    startIndex,
    endIndex,
    identifiers: [var1, var2],
  };
};

/**
 * Patch 2: FbH collapsed view function
 *
 * Original: if(!(A||L))return p0H
 * Patched:  if(!(1||1))return p0H
 *
 * This shows the expanded thinking view instead of collapsed "(ctrl+o to expand)".
 * Variable names (A, L) and return value (p0H) change between versions.
 *
 * IMPORTANT: Patch the FIRST occurrence only. The binary contains two copies
 * (source + runtime). Patching the second breaks the binary.
 */
const getFbhCollapsedLocation = (oldFile: string): LocationResult | null => {
  // Pattern matches: if(!(X||Y))return ZZZ
  // where X, Y are single uppercase letters and ZZZ is a short identifier (p0H, etc.)
  // Using uppercase letter constraint to avoid false positives
  const pattern = /if\(!\(([A-Z])\|\|([A-Z])\)\)return ([a-zA-Z0-9$_]+)/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: thinkingVisibility: failed to find FbH collapsed pattern'
    );
    return null;
  }

  const fullMatch = match[0];
  const var1 = match[1];
  const var2 = match[2];
  const returnVar = match[3];

  const startIndex = match.index;
  const endIndex = startIndex + fullMatch.length;

  return {
    startIndex,
    endIndex,
    identifiers: [var1, var2, returnVar],
  };
};

export const writeThinkingVisibility = (oldFile: string): string | null => {
  let newFile = oldFile;
  let anyPatched = false;

  // Patch 1: Case statement visibility
  const caseLocation = getCaseStatementLocation(oldFile);
  if (caseLocation) {
    let replacement: string;

    if (caseLocation.identifiers!.length === 4) {
      // Old format: remove if/return and set isTranscriptMode to true
      replacement = `${caseLocation.identifiers![0]}${caseLocation.identifiers![1]}${caseLocation.identifiers![2]}${caseLocation.identifiers![3]}`;
    } else {
      // New format: replace variable names with 1
      replacement = `case"thinking":{if(!1&&!1)return null`;
    }

    newFile =
      newFile.slice(0, caseLocation.startIndex) +
      replacement +
      newFile.slice(caseLocation.endIndex);

    showDiff(
      oldFile,
      newFile,
      replacement,
      caseLocation.startIndex,
      caseLocation.endIndex
    );
    anyPatched = true;
  }

  // Patch 2: FbH collapsed view (use newFile to account for offset changes)
  const fbhLocation = getFbhCollapsedLocation(newFile);
  if (fbhLocation) {
    const returnVar = fbhLocation.identifiers![2];
    const replacement = `if(!(1||1))return ${returnVar}`;

    const patchedFile =
      newFile.slice(0, fbhLocation.startIndex) +
      replacement +
      newFile.slice(fbhLocation.endIndex);

    showDiff(
      newFile,
      patchedFile,
      replacement,
      fbhLocation.startIndex,
      fbhLocation.endIndex
    );

    newFile = patchedFile;
    anyPatched = true;
  }

  return anyPatched ? newFile : null;
};
