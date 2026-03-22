// Please see the note about writing patches in ./index

import { showDiff, escapeIdent } from './index';

/**
 * Patches the CLAUDE.md file reading function to also check for alternative
 * filenames (e.g., AGENTS.md) when CLAUDE.md doesn't exist.
 *
 * This finds the function that reads CLAUDE.md files and modifies it to:
 * 1. Add a `didReroute` parameter to the function
 * 2. At the early `return null` (when the file doesn't exist), check if the
 *    path ends with CLAUDE.md and try alternative names (unless didReroute
 *    is true)
 * 3. Recursive calls pass didReroute=true to avoid infinite loops
 *
 * CC 2.1.62 (approx. by Claude):
 * ```diff
 * -function _t7(A, q) {
 * +function _t7(A, q, didReroute) {
 *    try {
 *      let K = x1();
 * -    if (!K.existsSync(A) || !K.statSync(A).isFile()) return null;
 * +    if (!K.existsSync(A) || !K.statSync(A).isFile()) {
 * +      if (!didReroute && (A.endsWith("/CLAUDE.md") || A.endsWith("\\CLAUDE.md"))) {
 * +        for (let alt of ["AGENTS.md", "GEMINI.md", "QWEN.md"]) {
 * +          let altPath = A.slice(0, -9) + alt;
 * +          if (K.existsSync(altPath) && K.statSync(altPath).isFile())
 * +            return _t7(altPath, q, true);
 * +        }
 * +      }
 * +      return null;
 * +    }
 *      let Y = UL9(A).toLowerCase();
 *      if (Y && !dL9.has(Y))
 *        return (I(`Skipping non-text file in @include: ${A}`), null);
 *      let z = K.readFileSync(A, { encoding: "utf-8" }),
 *        { content: w, paths: H } = cL9(z);
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
    /(function ([$\w]+)\(([$\w]+),([^)]+?))\)(?:.|\n){0,500}Skipping non-text file in @include/;

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
    // CC ≥2.1.80: file reading was split into a separate function (e.g. SI9).
    // The "Skipping non-text file" function no longer does I/O.
    // Find the caller function that does readFileSync and calls this function.
    const funcName = functionName;
    const callerPattern = new RegExp(
      `(function ([$\\w]+)\\(([$\\w]+),[^)]+\\))\\{try\\{let [$\\w]+=([$\\w]+(?:\\(\\))?)\\.readFileSync\\(\\3.{0,50}${escapeIdent(funcName)}\\(`
    );
    const callerMatch = file.match(callerPattern);
    if (!callerMatch || callerMatch.index === undefined) {
      console.error(
        'patch: agentsMd: failed to find fs expression in function or caller'
      );
      return null;
    }
    // Redirect the patch to target the caller function instead
    const callerUpToParams = callerMatch[1];
    const callerName = callerMatch[2];
    const callerFirstParam = callerMatch[3];
    const callerFsExpr = callerMatch[4];
    const callerStart = callerMatch.index;

    const altNamesJson = JSON.stringify(altNames);

    // Add didReroute param to caller — insert before the closing )
    const callerSigIndex = callerStart + callerUpToParams.length - 1;
    let newFile =
      file.slice(0, callerSigIndex) +
      ',didReroute' +
      file.slice(callerSigIndex);

    showDiff(file, newFile, ',didReroute', callerSigIndex, callerSigIndex);

    // Replace the catch block's "return errorHandler(args),null}" with fallback + return null
    // Original: catch(ERR){return errorHandler(ERR,PATH),null}
    // New: catch(ERR){errorHandler(ERR,PATH);if(!didReroute&&...){...fallback...}return null}
    const callerBody = newFile.slice(callerStart, callerStart + 500);
    const catchReturnPattern = /return ([$\w]+\([^)]+\)),null\}/;
    const catchMatch = callerBody.match(catchReturnPattern);
    if (!catchMatch || catchMatch.index === undefined) {
      console.error(
        'patch: agentsMd: failed to find catch return null in caller'
      );
      return null;
    }

    // Extract second param from the function signature: function NAME(FIRST,SECOND)
    const secondParamMatch = callerUpToParams.match(/\([$\w]+,([$\w]+)/);
    if (!secondParamMatch) {
      console.error(
        'patch: agentsMd: failed to extract second param from caller'
      );
      return null;
    }
    const callerSecondParam = secondParamMatch[1];

    const errorHandlerCall = catchMatch[1]; // e.g. "g34(K,A)"
    const replacement = `${errorHandlerCall};if(!didReroute&&(${callerFirstParam}.endsWith("/CLAUDE.md")||${callerFirstParam}.endsWith("\\\\CLAUDE.md"))){for(let alt of ${altNamesJson}){let altPath=${callerFirstParam}.slice(0,-9)+alt;try{${callerFsExpr}.statSync(altPath);return ${callerName}(altPath,${callerSecondParam},true)}catch(e){}}}return null}`;

    const replaceStart = callerStart + catchMatch.index;
    const replaceEnd = replaceStart + catchMatch[0].length;
    const oldFile2 = newFile;
    newFile =
      newFile.slice(0, replaceStart) + replacement + newFile.slice(replaceEnd);

    showDiff(oldFile2, newFile, replacement, replaceStart, replaceEnd);

    // Also patch the async version (BV1) which is the main code path
    const asyncPattern = new RegExp(
      `(async function ([$\\w]+)\\(([$\\w]+),[^)]+\\))\\{try\\{let [$\\w]+=await ([$\\w]+(?:\\(\\))?)\\.readFile\\(\\3.{0,50}${escapeIdent(funcName)}\\(`
    );
    const asyncMatch = newFile.match(asyncPattern);
    if (asyncMatch && asyncMatch.index !== undefined) {
      const asyncUpToParams = asyncMatch[1];
      const asyncName = asyncMatch[2];
      const asyncFirstParam = asyncMatch[3];
      const asyncFsExpr = asyncMatch[4];
      const asyncStart = asyncMatch.index;

      // Add didReroute param
      const asyncSigIndex = asyncStart + asyncUpToParams.length - 1;
      const oldFile3 = newFile;
      newFile =
        newFile.slice(0, asyncSigIndex) +
        ',didReroute' +
        newFile.slice(asyncSigIndex);
      showDiff(oldFile3, newFile, ',didReroute', asyncSigIndex, asyncSigIndex);

      // Find and replace catch return null
      const asyncBody = newFile.slice(asyncStart, asyncStart + 500);
      const asyncCatchMatch = asyncBody.match(
        /return ([$\w]+\([^)]+\)),null\}/
      );
      if (asyncCatchMatch && asyncCatchMatch.index !== undefined) {
        const asyncSecondMatch = asyncUpToParams.match(/\([$\w]+,([$\w]+)\)/);
        const asyncSecondParam = asyncSecondMatch
          ? asyncSecondMatch[1]
          : callerSecondParam;
        const asyncErrorHandler = asyncCatchMatch[1];
        const asyncReplacement = `${asyncErrorHandler};if(!didReroute&&(${asyncFirstParam}.endsWith("/CLAUDE.md")||${asyncFirstParam}.endsWith("\\\\CLAUDE.md"))){for(let alt of ${altNamesJson}){let altPath=${asyncFirstParam}.slice(0,-9)+alt;try{await ${asyncFsExpr}.stat(altPath);return ${asyncName}(altPath,${asyncSecondParam},true)}catch(e){}}}return null}`;

        const asyncReplaceStart = asyncStart + asyncCatchMatch.index;
        const asyncReplaceEnd = asyncReplaceStart + asyncCatchMatch[0].length;
        const oldFile4 = newFile;
        newFile =
          newFile.slice(0, asyncReplaceStart) +
          asyncReplacement +
          newFile.slice(asyncReplaceEnd);
        showDiff(
          oldFile4,
          newFile,
          asyncReplacement,
          asyncReplaceStart,
          asyncReplaceEnd
        );
      }
    }

    return newFile;
  }
  const fsExpr = fsMatch[1];

  const altNamesJson = JSON.stringify(altNames);

  // Step 1: Add didReroute parameter to function signature
  const sigIndex = funcStart + upToFuncParamsClosingParen.length;
  let newFile = file.slice(0, sigIndex) + ',didReroute' + file.slice(sigIndex);

  showDiff(file, newFile, ',didReroute', sigIndex, sigIndex);

  // Step 2: Inject fallback at the early return null (when file doesn't exist)
  const funcBody = newFile.slice(funcStart);

  // CC ≤2.1.62: existsSync/isFile check before reading
  const oldEarlyReturnPattern = /\.isFile\(\)\)return null/;
  // CC ≥2.1.69: try/catch with ENOENT/EISDIR error codes
  const newEarlyReturnPattern = /==="EISDIR"\)return null/;

  const earlyReturnMatch =
    funcBody.match(oldEarlyReturnPattern) ??
    funcBody.match(newEarlyReturnPattern);

  if (!earlyReturnMatch || earlyReturnMatch.index === undefined) {
    console.error(
      'patch: agentsMd: failed to find early return null for injection'
    );
    return null;
  }

  const isNewPattern = !funcBody.match(oldEarlyReturnPattern);

  const fallback = `if(!didReroute&&(${firstParam}.endsWith("/CLAUDE.md")||${firstParam}.endsWith("\\\\CLAUDE.md"))){for(let alt of ${altNamesJson}){let altPath=${firstParam}.slice(0,-9)+alt;if(${fsExpr}.existsSync(altPath)&&${fsExpr}.statSync(altPath).isFile())return ${functionName}(altPath,${restParams},true);}}`;

  const earlyReturnStart = funcStart + earlyReturnMatch.index;
  const oldStr = earlyReturnMatch[0];
  const newStr = isNewPattern
    ? `==="EISDIR"){${fallback}return null;}`
    : `.isFile()){${fallback}return null;}`;

  newFile =
    newFile.slice(0, earlyReturnStart) +
    newStr +
    newFile.slice(earlyReturnStart + oldStr.length);

  showDiff(file, newFile, newStr, earlyReturnStart, earlyReturnStart);

  return newFile;
};
