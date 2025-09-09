// Please see the note about writing patches in ./index.js.

import { LocationResult, showDiff } from './index.js';

const getThinkerFormatLocation = (oldFile: string): LocationResult | null => {
  const approxAreaPattern =
    /spinnerTip:[$\w]+,(?:[$\w]+:[$\w]+,)*overrideMessage:[$\w]+,.{300}/;
  const approxAreaMatch = oldFile.match(approxAreaPattern);

  if (!approxAreaMatch || approxAreaMatch.index == undefined) {
    console.error('patch: thinker format: failed to find approxAreaMatch');
    return null;
  }

  // Search within a range of 600 characters
  const searchSection = oldFile.slice(
    approxAreaMatch.index,
    approxAreaMatch.index + 600
  );

  // New nullish format: N=(Y??C?.activeForm??L)+"…"
  const formatPattern = /([$\w]+)(=\(([^;]{1,200}?)\)\+"…")/;
  const formatMatch = searchSection.match(formatPattern);

  if (!formatMatch || formatMatch.index == undefined) {
    console.error('patch: thinker format: failed to find formatMatch');
    return null;
  }

  return {
    startIndex:
      approxAreaMatch.index + formatMatch.index + formatMatch[1].length,
    endIndex:
      approxAreaMatch.index +
      formatMatch.index +
      formatMatch[1].length +
      formatMatch[2].length,
    identifiers: [formatMatch[3]],
  };
};

export const writeThinkerFormat = (
  oldFile: string,
  format: string
): string | null => {
  const location = getThinkerFormatLocation(oldFile);
  if (!location) {
    return null;
  }
  const fmtLocation = location;

  // See `getThinkerFormatLocation` for an explanation of this.
  const serializedFormat = format.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
  const curExpr = fmtLocation.identifiers?.[0];
  const curFmt =
    '`' + serializedFormat.replace(/\{\}/g, '${' + curExpr + '}') + '`';
  const formatDecl = `=${curFmt}`;

  const newFile =
    oldFile.slice(0, fmtLocation.startIndex) +
    formatDecl +
    oldFile.slice(fmtLocation.endIndex);

  showDiff(
    oldFile,
    newFile,
    formatDecl,
    fmtLocation.startIndex,
    fmtLocation.endIndex
  );
  return newFile;
};
