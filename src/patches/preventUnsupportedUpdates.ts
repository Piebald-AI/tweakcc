// Please see the note about writing patches in ./index
//
// This patch prevents Claude Code from auto-updating to versions that tweakcc
// doesn't yet support. It works by checking if the prompts file exists on GitHub
// for the target version before allowing the update.

import { LocationResult, showDiff } from './index';

/**
 * Finds the location in the auto-updater where the latest version is fetched
 * and the update decision is made.
 *
 * The pattern we're looking for (minified):
 *   BUILD_TIME:"..."}.VERSION,CHANNEL_VAR=FUNC()?.autoUpdatesChannel??"latest",VERSION_VAR=await FUNC(CHANNEL_VAR),OTHER_VAR=FUNC2();
 *
 * Note: The function name for autoUpdatesChannel (e.g., hq, z5) varies between builds.
 *
 * We'll inject code after VERSION_VAR assignment to check if it's supported.
 */
const getAutoUpdaterLocation = (oldFile: string): LocationResult | null => {
  // Pattern to match the auto-updater version fetch in minified code
  // The key markers are:
  // - BUILD_TIME:"..." followed by }.VERSION,
  // - FUNC()?.autoUpdatesChannel??"latest" (function name varies between builds)
  // - await FUNC(VAR) pattern
  // Captures:
  //   [1] = channel var (e.g., _)
  //   [2] = autoUpdatesChannel function (e.g., z5, hq - varies between builds)
  //   [3] = version var (e.g., G)
  //   [4] = fetch function (e.g., v3A)
  //   [5] = next var (e.g., Z)
  //   [6] = next func (e.g., Oc)
  const pattern =
    /BUILD_TIME:"[^"]+"\}\.VERSION,([$\w]+)=([$\w]+)\(\)\?\.autoUpdatesChannel\?\?"latest",([$\w]+)=await ([$\w]+)\(\1\),([$\w]+)=([$\w]+)\(\);/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: preventUnsupportedUpdates: failed to find auto-updater pattern'
    );
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    identifiers: [
      match[0], // Full match
      match[1], // channel var (e.g., _)
      match[2], // autoUpdatesChannel function (e.g., z5)
      match[3], // version var (e.g., G)
      match[4], // fetch function (e.g., v3A)
      match[5], // next var (e.g., Z)
      match[6], // next var's function (e.g., Oc)
    ],
  };
};

/**
 * Gets the variable name used for the current version.
 * This is typically $ in the code pattern:
 *   let $={...ISSUES_EXPLAINER:...}.VERSION,
 */
const getCurrentVersionVar = (
  oldFile: string,
  autoUpdaterLocation: LocationResult
): string | null => {
  // Look backwards from our match to find the current version variable
  // Pattern: let CURRENT_VAR={...ISSUES_EXPLAINER:...
  const searchStart = Math.max(0, autoUpdaterLocation.startIndex - 500);
  const searchChunk = oldFile.slice(
    searchStart,
    autoUpdaterLocation.startIndex
  );

  // Find the last "let VAR={" pattern with ISSUES_EXPLAINER reference (minified format)
  const pattern = /let ([$\w]+)=\{[^}]*ISSUES_EXPLAINER:/g;
  let lastMatch = null;
  let match;

  while ((match = pattern.exec(searchChunk)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    console.error(
      'patch: preventUnsupportedUpdates: failed to find current version variable'
    );
    return null;
  }

  return lastMatch[1];
};

export const writePreventUnsupportedUpdates = (
  oldFile: string
): string | null => {
  const location = getAutoUpdaterLocation(oldFile);
  if (!location) {
    return null;
  }

  const currentVersionVar = getCurrentVersionVar(oldFile, location);
  if (!currentVersionVar) {
    return null;
  }

  // Extract captured groups from the pattern match
  // identifiers: [0]=full match, [1]=channel var, [2]=autoUpdatesChannel func,
  //              [3]=version var, [4]=fetch func, [5]=next var, [6]=next func
  const channelVar = location.identifiers![1];
  const autoUpdatesChannelFunc = location.identifiers![2];
  const versionVar = location.identifiers![3];
  const fetchFunc = location.identifiers![4];
  const nextVar = location.identifiers![5];
  const nextFunc = location.identifiers![6];

  // Construct the replacement with the tweakcc version check injected
  // The check wraps the version fetch to check if tweakcc supports the version.
  // If the prompts file doesn't exist (404) or check fails, it returns the current version to block the update.
  // Fails closed: if we can't verify support, we block the update to be safe.
  // Wrapped in outer try-catch to ensure no errors propagate that could affect module initialization.
  const tweakccVersionCheck = `${versionVar}=await(async()=>{try{let v=await ${fetchFunc}(${channelVar});if(!v)return v;try{const r=await fetch(\`https://raw.githubusercontent.com/georpar/tweakcc/refs/heads/main/data/prompts/prompts-\${v}.json\`,{method:'HEAD'});if(!r.ok)return ${currentVersionVar};}catch(e){return ${currentVersionVar};}return v;}catch(e){return null;}})(),`;

  // Extract the BUILD_TIME portion from the matched string (minified format)
  const buildTimeMatch = location.identifiers![0].match(/BUILD_TIME:"[^"]+"\}/);
  const buildTimePrefix = buildTimeMatch ? buildTimeMatch[0] : '';

  // Reconstruct the replacement using the captured function name (not hardcoded)
  const replacement =
    buildTimePrefix +
    `.VERSION,` +
    `${channelVar}=${autoUpdatesChannelFunc}()?.autoUpdatesChannel??"latest",` +
    tweakccVersionCheck +
    `${nextVar}=${nextFunc}();`;

  const newFile =
    oldFile.slice(0, location.startIndex) +
    replacement +
    oldFile.slice(location.endIndex);

  showDiff(
    oldFile,
    newFile,
    replacement,
    location.startIndex,
    location.endIndex
  );

  return newFile;
};
