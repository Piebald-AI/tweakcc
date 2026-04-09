import { showDiff } from './index';

/**
 * Replaces the hardcoded default context limit (200K) with an env var override.
 *
 * The context window function determines the token limit for each model:
 * ```
 * function TV(q,K){
 *   if(Cf(q))return 1e6;                      // [1m] models → 1M
 *   if(K?.includes(ni)&&U01(q))return 1e6;     // SDK beta + supported model → 1M
 *   if(cZ8(q))return 1e6;                      // coral_reef_sonnet experiment → 1M
 *   return eN1                                  // default: eN1 = 200000
 * }
 * ```
 *
 * We patch the final `return eN1` to read from CLAUDE_CODE_CONTEXT_LIMIT env var,
 * falling back to the original eN1 value if unset.
 *
 * ```diff
 * -  return eN1
 * +  return Number(process.env.CLAUDE_CODE_CONTEXT_LIMIT??eN1)
 * ```
 */
export const writeContextLimit = (file: string): string | null => {
  // Find the context window function by its unique structure:
  // three 1e6 returns (for special models) then a variable return (default)
  const pattern =
    /function ([$\w]+)\(([$\w]+),([$\w]+)\)\{if\([$\w]+\(\2\)\)return 1e6;if\(\3\?\.includes\([$\w]+\)&&[$\w]+\(\2\)\)return 1e6;if\([$\w]+\(\2\)\)return 1e6;return ([$\w]+)\}/;

  const match = file.match(pattern);
  if (!match || match.index === undefined) {
    console.error(
      'patch: contextLimit: failed to find context window function'
    );
    return null;
  }

  const defaultVar = match[4];
  const oldStr = `return ${defaultVar}}`;
  const newStr = `return Number(process.env.CLAUDE_CODE_CONTEXT_LIMIT??${defaultVar})}`;

  const replaceStart = match.index + match[0].length - oldStr.length;
  const newFile =
    file.slice(0, replaceStart) +
    newStr +
    file.slice(replaceStart + oldStr.length);

  showDiff(file, newFile, newStr, replaceStart, replaceStart + oldStr.length);

  return newFile;
};
