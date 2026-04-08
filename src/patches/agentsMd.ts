// Please see the note about writing patches in ./index

import { escapeIdent, showDiff } from './index';

/**
 * Patches the CLAUDE.md file reading function to also check for alternative
 * filenames (e.g., AGENTS.md) when CLAUDE.md doesn't exist.
 *
 * Supports two code shapes:
 *
 * **Sync (CC ≤ 2.1.84):** A single function reads, checks existence, and
 * processes the file.  We add a `didReroute` parameter and inject the fallback
 * at the early `return null`.
 *
 * **Async (CC ≥ 2.1.85):** The function was split into three:
 *   - content processor (has "Skipping non-text file" but no fs ops)
 *   - async reader (calls `readFile`, then the content processor)
 *   - error handler (ENOENT / EISDIR / EACCES)
 * We patch the *async reader* instead: add `didReroute` and inject the
 * fallback in its `catch` block.
 */
export const writeAgentsMd = (
  file: string,
  altNames: string[]
): string | null => {
  // CC ≥ 2.1.87 ships with native AGENTS.md / alternative MD file support.
  // Detect the fallback loop: endsWith("...CLAUDE.md")...for(let ... of [
  if (/CLAUDE\.md.{0,100}for\(let \w+ of \["AGENTS\.md"/.test(file)) {
    console.log(
      'patch: agentsMd: alternative MD file support already present natively — skipping'
    );
    return file;
  }

  // Step 1: Locate the content-processing function via the "Skipping" anchor.
  const funcPattern =
    /(function ([$\w]+)\(([$\w]+),([^)]+?))\)(?:.|\n){0,500}Skipping non-text file in @include/;

  const funcMatch = file.match(funcPattern);
  if (!funcMatch || funcMatch.index === undefined) {
    console.error('patch: agentsMd: failed to find CLAUDE.md reading function');
    return null;
  }

  // Step 2: Decide which code shape we're dealing with.
  const fsPattern = /([$\w]+(?:\(\))?)\.(?:readFileSync|existsSync|statSync)/;
  const fsMatch = funcMatch[0].match(fsPattern);

  if (fsMatch) {
    // Sync single-function pattern (CC ≤ 2.1.84)
    return writeAgentsMdSync(
      file,
      funcMatch as RegExpMatchArray & { index: number },
      fsMatch[1],
      altNames
    );
  }

  // Async split-function pattern (CC ≥ 2.1.85)
  return writeAgentsMdAsync(file, funcMatch[2], altNames);
};

// ─── Sync strategy (unchanged logic, extracted) ──────────────────────────────

const writeAgentsMdSync = (
  file: string,
  funcMatch: RegExpMatchArray & { index: number },
  fsExpr: string,
  altNames: string[]
): string | null => {
  const upToFuncParamsClosingParen = funcMatch[1];
  const functionName = funcMatch[2];
  const firstParam = funcMatch[3];
  const restParams = funcMatch[4];
  const funcStart = funcMatch.index;

  const altNamesJson = JSON.stringify(altNames);

  // Add didReroute parameter to function signature
  const sigIndex = funcStart + upToFuncParamsClosingParen.length;
  let newFile = file.slice(0, sigIndex) + ',didReroute' + file.slice(sigIndex);

  showDiff(file, newFile, ',didReroute', sigIndex, sigIndex);

  // Inject fallback at the early return null (when file doesn't exist)
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

// ─── Async strategy (CC ≥ 2.1.85) ───────────────────────────────────────────

const writeAgentsMdAsync = (
  file: string,
  contentProcessorName: string,
  altNames: string[]
): string | null => {
  // Find the async reader function:
  //   async function Fb8(H,$,q){
  //     try{ let _=await FS.readFile(H,...); return CONTENT_PROC(_,...) }
  //     catch(K){ return ERR_HANDLER(K,H),{info:null,includePaths:[]} }
  //   }
  const readerPattern = new RegExp(
    `(async function ([$\\w]+)\\(([$\\w]+),([^)]+))\\)\\{try\\{` +
      `[^}]{0,200}\\.readFile\\(\\3,.{0,100}${escapeIdent(contentProcessorName)}\\(`
  );
  const readerMatch = file.match(readerPattern);
  if (!readerMatch || readerMatch.index === undefined) {
    console.error(
      'patch: agentsMd: failed to find async CLAUDE.md reader function'
    );
    return null;
  }

  const readerSig = readerMatch[1]; // e.g. "async function Fb8(H,$,q"
  const readerFuncName = readerMatch[2]; // e.g. "Fb8"
  const pathParam = readerMatch[3]; // e.g. "H"
  const restParams = readerMatch[4]; // e.g. "$,q"

  const altNamesJson = JSON.stringify(altNames);

  // Step 1: Add didReroute parameter to the reader's signature.
  const sigIndex = readerMatch.index + readerSig.length;
  let newFile = file.slice(0, sigIndex) + ',didReroute' + file.slice(sigIndex);

  showDiff(file, newFile, ',didReroute', sigIndex, sigIndex);

  // Step 2: Replace the catch block's return statement with fallback logic.
  //   Before: return al4(K,H),{info:null,includePaths:[]}
  //   After:  al4(K,H); if(!didReroute && ...) { try alts } return{info:null,...}
  const catchReturnPattern = new RegExp(
    `return ([$\\w]+)\\(([$\\w]+),${escapeIdent(pathParam)}\\),\\{info:null,includePaths:\\[\\]\\}`
  );

  // Search in the vicinity of the async function (in the already-modified file).
  const searchStart = readerMatch.index;
  const searchSlice = newFile.slice(searchStart, searchStart + 1000);
  const catchMatch = searchSlice.match(catchReturnPattern);

  if (!catchMatch || catchMatch.index === undefined) {
    console.error(
      'patch: agentsMd: failed to find catch return in async reader'
    );
    return null;
  }

  const errorHandlerName = catchMatch[1]; // e.g. "al4"
  const catchVar = catchMatch[2]; // e.g. "K"

  const replacement =
    `${errorHandlerName}(${catchVar},${pathParam});` +
    `if(!didReroute&&(${pathParam}.endsWith("/CLAUDE.md")||${pathParam}.endsWith("\\\\CLAUDE.md"))){` +
    `for(let alt of ${altNamesJson}){let altPath=${pathParam}.slice(0,-9)+alt;` +
    `let r=await ${readerFuncName}(altPath,${restParams},true);if(r.info)return r}}` +
    `return{info:null,includePaths:[]}`;

  const catchReturnStart = searchStart + catchMatch.index;
  const catchReturnEnd = catchReturnStart + catchMatch[0].length;

  newFile =
    newFile.slice(0, catchReturnStart) +
    replacement +
    newFile.slice(catchReturnEnd);

  showDiff(file, newFile, replacement, catchReturnStart, catchReturnEnd);

  return newFile;
};
