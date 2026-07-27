import { debug } from '../utils';
import { showDiff } from './index';

/**
 * Disable Claude Code's server-managed settings eligibility gate.
 *
 * This gate controls the initial load, cache use, refresh, and polling paths for
 * settings delivered by Anthropic's API or a configured gateway. Local managed
 * settings files use separate loaders and intentionally remain unaffected.
 *
 * CC 2.1.220:
 * ```diff
 *  function cEe(){
 * +  return !1;
 *    if(lEe!==void 0)return lEe;
 *    if(JOe())return lEe=XOe(!0);
 *    if(Hn()==="gateway")return lEe=XOe(B5e(Cy()));
 * ```
 */
export const writeDisableServerManagedSettings = (
  oldFile: string
): string | null => {
  const alreadyPatched =
    /[,;{}]\s*function\s+([$\w]+)\s*\(\s*\)\s*\{\s*return\s+!1;\s*if\s*\(\s*([$\w]+)\s*!==\s*void\s+0\s*\)\s*return\s+\2;\s*if\s*\(\s*([$\w]+)\s*\(\s*\)\s*\)\s*return\s+\(?\s*\2\s*=\s*[$\w]+\s*\(\s*!0\s*\)\s*\)?;\s*if\s*\(\s*([$\w]+)\s*\(\s*\)\s*===\s*"gateway"\s*\)\s*return\s+\(?\s*\2\s*=\s*[$\w]+\s*\(/;
  if (alreadyPatched.test(oldFile)) return oldFile;

  // The override-file and gateway branches uniquely identify the remote-settings
  // eligibility helper without depending on minified names from a specific build.
  const pattern =
    /[,;{}]\s*function\s+([$\w]+)\s*\(\s*\)\s*\{\s*if\s*\(\s*([$\w]+)\s*!==\s*void\s+0\s*\)\s*return\s+\2;\s*if\s*\(\s*([$\w]+)\s*\(\s*\)\s*\)\s*return\s+\(?\s*\2\s*=\s*[$\w]+\s*\(\s*!0\s*\)\s*\)?;\s*if\s*\(\s*([$\w]+)\s*\(\s*\)\s*===\s*"gateway"\s*\)\s*return\s+\(?\s*\2\s*=\s*[$\w]+\s*\(/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    debug(
      'patch: disableServerManagedSettings: failed to find remote settings eligibility gate'
    );
    return null;
  }

  const functionBodyOffset = match[0].indexOf('{', 1) + 1;
  if (functionBodyOffset === 0) {
    debug(
      'patch: disableServerManagedSettings: matched eligibility gate without a function body'
    );
    return null;
  }
  const insertIndex = match.index + functionBodyOffset;
  const insertion = 'return !1;';
  const newFile =
    oldFile.slice(0, insertIndex) + insertion + oldFile.slice(insertIndex);

  showDiff(oldFile, newFile, insertion, insertIndex, insertIndex);
  return newFile;
};
