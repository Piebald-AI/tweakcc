// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Patches the CLAUDE.md file reading function to also check for alternative
 * filenames (e.g., AGENTS.md).
 *
 * This finds the function that reads CLAUDE.md files and modifies it to:
 * 1. Add a `didReroute` parameter to the function
 * 2. Right before the `return {` statement, check if the path ends with
 *    CLAUDE.md and try alternative names (unless didReroute is true)
 * 3. Recursive calls pass didReroute=true to avoid infinite loops
 *
 * CC 2.1.62 (approx. by Claude):
 * ```diff
 * -function _t7(A, q) {
 * +function _t7(A, q, didReroute) {
 *    try {
 *      let K = x1();
 *      if (!K.existsSync(A) || !K.statSync(A).isFile()) return null;
 *      let Y = UL9(A).toLowerCase();
 *      if (Y && !dL9.has(Y))
 *        return (I(`Skipping non-text file in @include: ${A}`), null);
 *      let z = K.readFileSync(A, { encoding: "utf-8" }),
 *        { content: w, paths: H } = cL9(z);
 * +    if (!didReroute && (A.endsWith("/CLAUDE.md") || A.endsWith("\\CLAUDE.md"))) {
 * +      for (let alt of ["AGENTS.md", "GEMINI.md", "QWEN.md"]) {
 * +        let altPath = A.slice(0, -9) + alt;
 * +        if (K.existsSync(altPath) && K.statSync(altPath).isFile())
 * +          return _t7(altPath, q, true);
 * +      }
 * +    }
 *      return { path: A, type: q, content: w, globs: H };
 *    } catch (K) {
 *      if (K instanceof Error && K.message.includes("EACCES"))
 *        n("tengu_claude_md_permission_error", {
 *          is_access_error: 1,
 *          has_home_dir: A.includes(_8()) ? 1 : 0,
 *        });
 *    }
 *    return null;
 *  }
 * ```
 */
export const writeAgentsMd = (
  file: string,
  altNames: string[]
): string | null => {
  const funcPattern =
    /(function ([$\w]+)\(([$\w]+),([^)]+?))\)(?:.|\n){0,500}Skipping non-text file in @include(?:.|\n){0,500}return\{path:[$\w]+,.{0,20}?content:[$\w]+/;

  const funcMatch = file.match(funcPattern);
  if (!funcMatch || funcMatch.index === undefined) {
    console.error('patch: agentsMd: failed to find CLAUDE.md reading function');
    return null;
  }
  const upToFuncParamsClosingParen = funcMatch[1];
  const functionName = funcMatch[2];
  const firstParam = funcMatch[3];
  const restParams = funcMatch[4];
  const funcStart = funcMatch.index;

  const fsPattern = /([$\w]+(?:\(\))?)\.(?:readFileSync|existsSync|statSync)/;
  const fsMatch = funcMatch[0].match(fsPattern);
  if (!fsMatch) {
    console.error('patch: agentsMd: failed to find fs expression in function');
    return null;
  }
  const fsExpr = fsMatch[1];

  const altNamesJson = JSON.stringify(altNames);

  const sigIndex = funcStart + upToFuncParamsClosingParen.length;
  let newFile = file.slice(0, sigIndex) + ',didReroute' + file.slice(sigIndex);

  showDiff(file, newFile, ',didReroute', sigIndex, sigIndex);

  // Step 2: Inject rerouting code right before the `return {`
  const returnPattern = /return\{path:[$\w]+,.{0,20}?content:[$\w]+/;
  const returnMatch = newFile.slice(funcStart).match(returnPattern);

  if (!returnMatch || returnMatch.index === undefined) {
    console.error(
      'patch: agentsMd: failed to find return statement for injection'
    );
    return null;
  }

  const injection = `if(!didReroute&&(${firstParam}.endsWith("/CLAUDE.md")||${firstParam}.endsWith("\\\\CLAUDE.md"))){for(let alt of ${altNamesJson}){let altPath=${firstParam}.slice(0,-9)+alt;if(${fsExpr}.existsSync(altPath)&&${fsExpr}.statSync(altPath).isFile())return ${functionName}(altPath,${restParams},true);}}`;

  const returnStart = funcStart + returnMatch.index;
  const replacement = injection + returnMatch[0];

  newFile =
    newFile.slice(0, returnStart) +
    replacement +
    newFile.slice(returnStart + returnMatch[0].length);

  showDiff(file, newFile, replacement, returnStart, returnStart);

  return newFile;
};
