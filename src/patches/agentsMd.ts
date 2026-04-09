// Please see the note about writing patches in ./index

import { showDiff } from './index';

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
    // CC 2.1.97+: reading and processing are split into separate functions.
    // The content processor (sa_) has "Skipping non-text file" but no fs calls.
    // Check if the feature is already built into this CC version.
    if (file.includes('didReroute') && file.includes('AGENTS.md')) {
      // CC 2.1.97+ already has AGENTS.md fallback built in — no patch needed
      return file;
    }
    // Otherwise, patch the async reader function.
    return writeAgentsMdAsync(file, altNames);
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

/**
 * CC 2.1.97+ variant: the file reading function is async and split from processing.
 *
 * Structure:
 * ```
 * async function yP4(q,K,_){
 *   try {
 *     let Y = await X8().readFile(q, {encoding:"utf-8"});
 *     return sa_(Y, q, K, _);
 *   } catch(z) {
 *     return ta_(z, q), {info:null, includePaths:[]};
 *   }
 * }
 * ```
 *
 * We patch the catch block to try alternative filenames when ENOENT + CLAUDE.md.
 */
const writeAgentsMdAsync = (
  file: string,
  altNames: string[]
): string | null => {
  const infoNullStr = '{info:null,includePaths:[]}';

  // Find the async reader function by locating {info:null,includePaths:[]}
  // near a readFile call
  let infoNullIdx = -1;
  let searchStart = 0;
  while (true) {
    const idx = file.indexOf(infoNullStr, searchStart);
    if (idx === -1) break;

    const lookback = file.slice(Math.max(0, idx - 500), idx);
    if (lookback.includes('.readFile')) {
      infoNullIdx = idx;
      break;
    }
    searchStart = idx + 1;
  }

  if (infoNullIdx === -1) {
    console.error(
      'patch: agentsMd: failed to find async CLAUDE.md reader function (2.1.97+)'
    );
    return null;
  }

  const lookback = file.slice(Math.max(0, infoNullIdx - 500), infoNullIdx);

  // Find the async function definition
  const asyncFuncPattern =
    /async function ([$\w]+)\(([$\w]+),([$\w]+),([$\w]+)\)\{/g;
  const funcMatches = Array.from(lookback.matchAll(asyncFuncPattern));
  if (funcMatches.length === 0) {
    console.error(
      'patch: agentsMd: failed to find async function definition (2.1.97+)'
    );
    return null;
  }
  const lastFunc = funcMatches[funcMatches.length - 1];
  const funcName = lastFunc[1];
  const pathParam = lastFunc[2];
  const typeParam = lastFunc[3];
  const resolvedParam = lastFunc[4];

  // Find the catch variable
  const catchPattern = /catch\(([$\w]+)\)\{/g;
  const catchMatches = Array.from(lookback.matchAll(catchPattern));
  if (catchMatches.length === 0) {
    console.error('patch: agentsMd: failed to find catch block (2.1.97+)');
    return null;
  }
  const catchVar = catchMatches[catchMatches.length - 1][1];

  // Step 1: Add didReroute parameter to the function signature
  const sigStr = `async function ${funcName}(${pathParam},${typeParam},${resolvedParam})`;
  const sigIdx = file.indexOf(sigStr);
  if (sigIdx === -1) {
    console.error(
      'patch: agentsMd: failed to locate function signature for injection (2.1.97+)'
    );
    return null;
  }
  const closingParenIdx = sigIdx + sigStr.length - 1;
  let newFile =
    file.slice(0, closingParenIdx) +
    ',didReroute' +
    file.slice(closingParenIdx);

  showDiff(file, newFile, ',didReroute', closingParenIdx, closingParenIdx);

  // Step 2: Inject fallback in the catch block before {info:null,...}
  // The catch block is: catch(z){return ta_(z,q),{info:null,includePaths:[]}}
  // We inject before the return statement.
  const catchBlockStr = `catch(${catchVar}){`;
  const catchBlockIdx = newFile.indexOf(catchBlockStr, sigIdx);
  if (catchBlockIdx === -1) {
    console.error(
      'patch: agentsMd: failed to locate catch block for injection (2.1.97+)'
    );
    return null;
  }
  const returnIdx = catchBlockIdx + catchBlockStr.length;

  const altNamesJson = JSON.stringify(altNames);
  const fallback =
    `if(${catchVar}&&${catchVar}.code==="ENOENT"&&!didReroute` +
    `&&(${pathParam}.endsWith("/CLAUDE.md")||${pathParam}.endsWith("\\\\CLAUDE.md")))` +
    `{for(let alt of ${altNamesJson})` +
    `{try{let altPath=${pathParam}.slice(0,-9)+alt;` +
    `let r=await ${funcName}(altPath,${typeParam},${resolvedParam},true);` +
    `if(r.info)return r}catch(e){}}}`;

  const oldFile = newFile;
  newFile = newFile.slice(0, returnIdx) + fallback + newFile.slice(returnIdx);

  showDiff(oldFile, newFile, fallback, returnIdx, returnIdx);

  return newFile;
};
