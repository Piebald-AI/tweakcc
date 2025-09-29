import { LocationResult, findChalkVar, showDiff } from './index.js';

/**
 * Finds the location of the version output pattern in Claude Code's cli.js
 */
export const findVersionOutputLocation = (
  fileContents: string
): {
  versionLocation: LocationResult;
  sessionIdLocation: LocationResult;
} | null => {
  // Pattern: }.VERSION} (Claude Code)
  const versionPattern = /\}\.VERSION\} \(Claude Code\)/;
  const versionMatch = fileContents.match(versionPattern);
  if (!versionMatch || versionMatch.index === undefined) {
    return null;
  }

  const sessionIdPattern =
    /,([$\w]+)\.createElement\(([$\w]+),null,\1\.createElement\(([$\w]+),\{dimColor:!0\}," L "\),\1\.createElement\(\3,null,"Session ID: ",[$\w]+\(\)\)\)/;
  const sessionIdMatch = fileContents.match(sessionIdPattern);
  if (!sessionIdMatch || sessionIdMatch.index === undefined) {
    return null;
  }

  const sessionIdEndIndex = sessionIdMatch.index + sessionIdMatch[0].length;

  return {
    versionLocation: {
      startIndex: versionMatch.index,
      endIndex: versionMatch.index + versionMatch[0].length,
    },
    sessionIdLocation: {
      startIndex: sessionIdEndIndex,
      endIndex: sessionIdEndIndex,
      identifiers: [sessionIdMatch[1], sessionIdMatch[2], sessionIdMatch[3]],
    },
  };
};

/**
 * Modifies the version output to include tweakcc version
 */
export const writeVersionOutput = (
  fileContents: string,
  tweakccVersion: string
): string | null => {
  const locations = findVersionOutputLocation(fileContents);
  if (!locations) {
    return null;
  }
  const { versionLocation, sessionIdLocation } = locations;

  const originalVersionText = fileContents.slice(
    versionLocation.startIndex,
    versionLocation.endIndex
  );
  const newText = `${originalVersionText}\\n${tweakccVersion} (tweakcc)`;

  const newFileContents1 =
    fileContents.slice(0, versionLocation.startIndex) +
    newText +
    fileContents.slice(versionLocation.endIndex);

  showDiff(
    fileContents,
    newFileContents1,
    newText,
    versionLocation.startIndex,
    versionLocation.endIndex
  );

  const [r1, r2, r3] = sessionIdLocation.identifiers!;
  const chalkVar = findChalkVar(fileContents);
  if (!chalkVar) {
    console.error('patch: versionOutput: failed to find chalk variable');
    return null;
  }
  const newStatusInfo = `,${r1}.createElement(${r2},null,${r1}.createElement(${r3},{dimColor:!0}," L "),${r1}.createElement(${r3},null,${chalkVar}.rgb(235, 109, 13).bold("tweakcc: v${tweakccVersion}")))`;
  const newFileContents2 =
    fileContents.slice(0, sessionIdLocation.startIndex) +
    newStatusInfo +
    fileContents.slice(sessionIdLocation.endIndex);

  showDiff(
    fileContents,
    newFileContents2,
    newStatusInfo,
    sessionIdLocation.startIndex,
    sessionIdLocation.endIndex
  );

  return newFileContents2;
};
