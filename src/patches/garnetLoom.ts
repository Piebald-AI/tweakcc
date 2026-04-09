import { showDiff } from './index';

// ======

/**
 * Disable tengu_garnet_loom — prevents auto-downgrade of Opus to Sonnet
 *
 * CC 2.1.97 has a feature gate `tengu_garnet_loom` that, when enabled server-side,
 * auto-downgrades Opus subagents to Sonnet when context is under 200K tokens.
 *
 * The pattern in the subagent model resolver:
 *   if(!Y && Jz(j).includes("opus") && R8("tengu_garnet_loom",!1)){
 *       let H=$5("sonnet"); return O(H,"sonnet")
 *   }
 *
 * This patch forces the R8("tengu_garnet_loom") check to always return false,
 * ensuring Opus stays Opus regardless of what GrowthBook says.
 */
export const writeDisableGarnetLoom = (oldFile: string): string | null => {
  // Pattern: R8("tengu_garnet_loom",!1)
  // This appears in the subagent model resolver function
  const pattern = /R8\("tengu_garnet_loom",!1\)/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    // Try generic feature gate check function names
    const altPattern = /([$\w]+)\("tengu_garnet_loom",![01]\)/;
    const altMatch = oldFile.match(altPattern);
    if (!altMatch || altMatch.index === undefined) {
      console.error(
        'patch: garnetLoom: failed to find tengu_garnet_loom feature gate check'
      );
      return null;
    }

    // Replace the entire check with false
    const replacement = '!1';
    const newFile =
      oldFile.slice(0, altMatch.index) +
      replacement +
      oldFile.slice(altMatch.index + altMatch[0].length);
    showDiff(
      oldFile,
      newFile,
      replacement,
      altMatch.index,
      altMatch.index + altMatch[0].length
    );
    return newFile;
  }

  // Replace R8("tengu_garnet_loom",!1) with !1 (always false = never downgrade)
  const replacement = '!1';
  const newFile =
    oldFile.slice(0, match.index) +
    replacement +
    oldFile.slice(match.index + match[0].length);
  showDiff(
    oldFile,
    newFile,
    replacement,
    match.index,
    match.index + match[0].length
  );
  return newFile;
};
