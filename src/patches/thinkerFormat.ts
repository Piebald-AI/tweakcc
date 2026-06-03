// Please see the note about writing patches in ./index

import { LocationResult, showDiff } from './index';

const getThinkerFormatLocation = (oldFile: string): LocationResult | null => {
  const approxAreaPattern =
    /spinnerTip:[$\w]+,(?:[$\w]+:[$\w]+,)*overrideMessage:[$\w]+,.{300}/;
  const approxAreaMatch =
    oldFile.match(approxAreaPattern) ??
    oldFile.match(
      /function [$\w]+\(\{mode:[$\w]+,[^)]{0,500}overrideMessage:[$\w]+,[^)]{0,800}\}\)\{let .{0,2500}spinnerTip.{0,2500}activeForm.{0,1000}spinnerVerb/
    );

  const searchStart = approxAreaMatch?.index;

  // Search within a range of 1000 characters to support CC 2.0.76+
  const searchSection =
    searchStart === undefined
      ? ''
      : oldFile.slice(searchStart, searchStart + 10000);

  // New nullish format: N=(Y??C?.activeForm??L)+"…"
  const formatPatternOld = /,([$\w]+)(=\(([^;]{1,200}?)\)\+"(?:…|\\u2026)")/;
  const formatMatchOld = searchSection.match(formatPatternOld);

  if (formatMatchOld && formatMatchOld.index != undefined) {
    return {
      startIndex:
        searchStart! + formatMatchOld.index + formatMatchOld[1].length + 1, // + 1 for the comma
      endIndex:
        searchStart! +
        formatMatchOld.index +
        formatMatchOld[1].length +
        formatMatchOld[2].length +
        1, // + 1 for the comma
      identifiers: [formatMatchOld[3]],
    };
  }

  // Fallback pattern: =($a&&!$b.isIdle?$c.spinnerVerb??$d:$e)+"…"
  const formatPatternNew =
    /,([$\w]+)(=(\([$\w]+&&![$\w]+\.isIdle\?[$\w]+\.spinnerVerb\?\?[$\w]+:[$\w]+\))\+"(?:…|\\u2026)")/;
  const formatMatchNew = searchSection.match(formatPatternNew);

  if (formatMatchNew && formatMatchNew.index != undefined) {
    return {
      startIndex:
        searchStart! + formatMatchNew.index + formatMatchNew[1].length + 1, // + 1 for the comma
      endIndex:
        searchStart! +
        formatMatchNew.index +
        formatMatchNew[1].length +
        formatMatchNew[2].length +
        1, // + 1 for the comma
      identifiers: [formatMatchNew[3]],
    };
  }

  const formatPatternNewGlobal = new RegExp(formatPatternNew.source, 'g');
  const formatMatches = [...oldFile.matchAll(formatPatternNewGlobal)].filter(
    match => {
      if (match.index == undefined) {
        return false;
      }
      const context = oldFile.slice(
        Math.max(0, match.index - 2500),
        match.index + 1000
      );
      return (
        context.includes('overrideMessage:') &&
        context.includes('.activeForm') &&
        context.includes('.isIdle') &&
        context.includes('.spinnerVerb') &&
        context.includes('spinnerTip')
      );
    }
  );

  if (formatMatches.length === 1) {
    const formatMatch = formatMatches[0];
    return {
      startIndex: formatMatch.index! + formatMatch[1].length + 1, // + 1 for the comma
      endIndex:
        formatMatch.index! + formatMatch[1].length + formatMatch[2].length + 1, // + 1 for the comma
      identifiers: [formatMatch[3]],
    };
  }

  if (searchStart === undefined) {
    console.error('patch: thinker format: failed to find approxAreaMatch');
  }
  console.error('patch: thinker format: failed to find formatMatch');
  return null;
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
