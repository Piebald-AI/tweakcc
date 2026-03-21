// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Patches the CLAUDE.md file reading functions to also check for alternative
 * filenames (e.g., AGENTS.md) when CLAUDE.md doesn't exist.
 *
 * This finds both the sync and async reader functions and modifies them to:
 * 1. Add a `didReroute` parameter to the function
 * 2. In the catch block (when file doesn't exist), check if the path ends
 *    with CLAUDE.md and try alternative names (unless didReroute is true)
 * 3. Recursive calls pass didReroute=true to avoid infinite loops
 *
 * CC ≥2.1.80 structure (3 separate functions):
 * ```
 * // Content processor
 * function U94(A, q, K) {
 *   if (_ && !yx9.has(_)) return V(`Skipping non-text file in @include: ${q}`), null;
 *   return {path: q, type: K, content: O, globs: z, ...};
 * }
 *
 * // Error handler
 * function Q94(A, q) {
 *   let K = A.code;
 *   if (K === "ENOENT" || K === "EISDIR") return;
 *   if (K === "EACCES") Q("tengu_claude_md_permission_error", ...);
 * }
 *
 * // Sync reader - PATCHED
 * function Rx9(A, q, didReroute) {
 *   try { let _ = w8().readFileSync(A, {encoding: "utf-8"}); return U94(_, A, q); }
 *   catch(K) {
 *     if (!didReroute && (A.endsWith("/CLAUDE.md") || ...)) { ...try alts... }
 *     return Q94(K, A), null;
 *   }
 * }
 *
 * // Async reader - PATCHED
 * async function BE1(A, q, didReroute) {
 *   try { let _ = await w8().readFile(A, {encoding: "utf-8"}); return U94(_, A, q); }
 *   catch(K) {
 *     if (!didReroute && (A.endsWith("/CLAUDE.md") || ...)) { ...try alts... }
 *     return Q94(K, A), null;
 *   }
 * }
 * ```
 *
 * CC ≤2.1.69 structure (single function with existsSync/isFile check):
 * ```
 * function _t7(A, q) {
 *   let K = x1();
 *   if (!K.existsSync(A) || !K.statSync(A).isFile()) return null;
 *   // ... "Skipping non-text file in @include" ...
 *   let z = K.readFileSync(A, {encoding: "utf-8"});
 *   return {path: A, type: q, content: w, globs: H};
 * }
 * ```
 */
export const writeAgentsMd = (
  file: string,
  altNames: string[]
): string | null => {
  // Try new pattern first (CC ≥2.1.80), then fall back to legacy
  return writeAgentsMdNew(file, altNames) ?? writeAgentsMdLegacy(file, altNames);
};

/**
 * CC ≥2.1.80: readFileSync and "Skipping non-text file" are in separate functions.
 * Sync reader: function X(A,q){try{let _=w8().readFileSync(A,...);return Y(_,A,q)}catch(K){return Z(K,A),null}}
 * Async reader: async function X(A,q){try{let _=await w8().readFile(A,...);return Y(_,A,q)}catch(K){return Z(K,A),null}}
 */
const writeAgentsMdNew = (
  file: string,
  altNames: string[]
): string | null => {
  // Match the sync reader: function X(A,q){try{let _=w8().readFileSync(A,{encoding:"utf-8"});return Y(_,A,q)}catch(K){return Z(K,A),null}}
  const syncPattern =
    /(function ([$\w]+)\(([$\w]+),([$\w]+)\))\{try\{let ([$\w]+)=w8\(\)\.readFileSync\(\3,\{encoding:"utf-8"\}\);return ([$\w]+)\(\5,\3,\4\)\}catch\(([$\w]+)\)\{return ([$\w]+)\(\7,\3\),null\}\}/;

  const syncMatch = file.match(syncPattern);
  if (!syncMatch || syncMatch.index === undefined) {
    console.error(
      'patch: agentsMd (new): failed to find sync reader function'
    );
    return null;
  }

  // Match the async reader: async function X(A,q){try{let _=await w8().readFile(A,{encoding:"utf-8"});return Y(_,A,q)}catch(K){return Z(K,A),null}}
  const asyncPattern =
    /(async function ([$\w]+)\(([$\w]+),([$\w]+)\))\{try\{let ([$\w]+)=await w8\(\)\.readFile\(\3,\{encoding:"utf-8"\}\);return ([$\w]+)\(\5,\3,\4\)\}catch\(([$\w]+)\)\{return ([$\w]+)\(\7,\3\),null\}\}/;

  const asyncMatch = file.match(asyncPattern);
  if (!asyncMatch || asyncMatch.index === undefined) {
    console.error(
      'patch: agentsMd (new): failed to find async reader function'
    );
    return null;
  }

  const altNamesJson = JSON.stringify(altNames);
  let newFile = file;

  // Patch sync reader
  {
    const fullMatch = syncMatch[0];
    const sig = syncMatch[1];
    const funcName = syncMatch[2];
    const pathParam = syncMatch[3];
    const typeParam = syncMatch[4];
    const contentVar = syncMatch[5];
    const processorFunc = syncMatch[6];
    const errorVar = syncMatch[7];
    const errorHandler = syncMatch[8];

    const fallback =
      `if(!didReroute&&${errorVar}.code==="ENOENT"&&` +
      `(${pathParam}.endsWith("/CLAUDE.md")||${pathParam}.endsWith("\\\\CLAUDE.md"))){` +
      `for(let alt of ${altNamesJson}){` +
      `let altPath=${pathParam}.slice(0,-9)+alt;` +
      `let r=${funcName}(altPath,${typeParam},true);` +
      `if(r)return r;` +
      `}}`;

    const sigOpen = sig.slice(0, -1); // strip trailing )
    const replacement =
      `${sigOpen},didReroute){try{let ${contentVar}=w8().readFileSync(${pathParam},{encoding:"utf-8"});` +
      `return ${processorFunc}(${contentVar},${pathParam},${typeParam})}` +
      `catch(${errorVar}){${fallback}return ${errorHandler}(${errorVar},${pathParam}),null}}`;

    newFile = newFile.replace(fullMatch, replacement);
    showDiff(file, newFile, replacement, syncMatch.index, syncMatch.index);
  }

  // Patch async reader
  {
    const asyncMatchInNew = newFile.match(asyncPattern);
    if (!asyncMatchInNew || asyncMatchInNew.index === undefined) {
      console.error(
        'patch: agentsMd (new): failed to find async reader in modified file'
      );
      return null;
    }

    const fullMatch = asyncMatchInNew[0];
    const sig = asyncMatchInNew[1];
    const funcName = asyncMatchInNew[2];
    const pathParam = asyncMatchInNew[3];
    const typeParam = asyncMatchInNew[4];
    const contentVar = asyncMatchInNew[5];
    const processorFunc = asyncMatchInNew[6];
    const errorVar = asyncMatchInNew[7];
    const errorHandler = asyncMatchInNew[8];

    const fallback =
      `if(!didReroute&&${errorVar}.code==="ENOENT"&&` +
      `(${pathParam}.endsWith("/CLAUDE.md")||${pathParam}.endsWith("\\\\CLAUDE.md"))){` +
      `for(let alt of ${altNamesJson}){` +
      `let altPath=${pathParam}.slice(0,-9)+alt;` +
      `let r=await ${funcName}(altPath,${typeParam},true);` +
      `if(r)return r;` +
      `}}`;

    const sigOpen = sig.slice(0, -1); // strip trailing )
    const replacement =
      `${sigOpen},didReroute){try{let ${contentVar}=await w8().readFile(${pathParam},{encoding:"utf-8"});` +
      `return ${processorFunc}(${contentVar},${pathParam},${typeParam})}` +
      `catch(${errorVar}){${fallback}return ${errorHandler}(${errorVar},${pathParam}),null}}`;

    const startIdx = asyncMatchInNew.index;
    newFile =
      newFile.slice(0, startIdx) +
      replacement +
      newFile.slice(startIdx + fullMatch.length);
    showDiff(file, newFile, replacement, startIdx, startIdx);
  }

  return newFile;
};

/**
 * CC ≤2.1.69: Single function with existsSync/isFile or EISDIR check,
 * and "Skipping non-text file in @include" in the same function body.
 */
const writeAgentsMdLegacy = (
  file: string,
  altNames: string[]
): string | null => {
  const funcPattern =
    /(function ([$\w]+)\(([$\w]+),([^)]+?))\)(?:.|\n){0,500}Skipping non-text file in @include/;

  const funcMatch = file.match(funcPattern);
  if (!funcMatch || funcMatch.index === undefined) {
    console.error(
      'patch: agentsMd: failed to find CLAUDE.md reading function'
    );
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
    console.error(
      'patch: agentsMd: failed to find fs expression in function'
    );
    return null;
  }
  const fsExpr = fsMatch[1];

  const altNamesJson = JSON.stringify(altNames);

  // Step 1: Add didReroute parameter to function signature
  const sigIndex = funcStart + upToFuncParamsClosingParen.length;
  let newFile =
    file.slice(0, sigIndex) + ',didReroute' + file.slice(sigIndex);

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
