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
 *   BUILD_TIME:"..."}.VERSION,CHANNEL_VAR=hq()?.autoUpdatesChannel??"latest",VERSION_VAR=await FUNC(CHANNEL_VAR),OTHER_VAR=FUNC2();
 *
 * We'll inject code after VERSION_VAR assignment to check if it's supported.
 */
const getAutoUpdaterLocation = (oldFile: string): LocationResult | null => {
  // Pattern to match the auto-updater version fetch in minified code
  // The key markers are:
  // - BUILD_TIME:"..." followed by }.VERSION,
  // - hq()?.autoUpdatesChannel??"latest"
  // - await FUNC(VAR) pattern
  // Captures: [1]=channel var, [2]=version var, [3]=fetch function, [4]=next var, [5]=next func
  const pattern =
    /BUILD_TIME:"[^"]+"\}\.VERSION,([$\w]+)=hq\(\)\?\.autoUpdatesChannel\?\?"latest",([$\w]+)=await ([$\w]+)\(\1\),([$\w]+)=([$\w]+)\(\);/;

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
      match[2], // version var (e.g., Z)
      match[3], // fetch function (e.g., _t)
      match[4], // next var (e.g., G)
      match[5], // next var's function (e.g., Ed)
    ],
  };
};

/**
 * Gets the variable name used for the current version.
 * This is typically $ in the code pattern:
 *   let $={...}.VERSION,
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

  const channelVar = location.identifiers![1];
  const versionVar = location.identifiers![2];
  const fetchFunc = location.identifiers![3];
  const nextVar = location.identifiers![4];
  const nextFunc = location.identifiers![5];

  // Construct the replacement with the tweakcc version check injected
  // The check wraps the version fetch to check if tweakcc supports the version.
  // If the prompts file doesn't exist (404) or check fails, it returns the current version to block the update.
  // Fails closed: if we can't verify support, we block the update to be safe.
  const tweakccVersionCheck = `${versionVar}=await(async()=>{let v=await ${fetchFunc}(${channelVar});if(!v)return v;try{const r=await fetch(\`https://raw.githubusercontent.com/Piebald-AI/tweakcc/refs/heads/main/data/prompts/prompts-\${v}.json\`,{method:'HEAD'});if(!r.ok)return ${currentVersionVar};}catch(e){return ${currentVersionVar};}return v;})(),`;

  // Reconstruct the original prefix (BUILD_TIME part) which we matched but want to preserve
  const buildTimeMatch = location.identifiers![0].match(/BUILD_TIME:"[^"]+"\}/);
  const buildTimePrefix = buildTimeMatch ? buildTimeMatch[0] : '';

  const replacement =
    buildTimePrefix +
    `.VERSION,` +
    `${channelVar}=hq()?.autoUpdatesChannel??"latest",` +
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
