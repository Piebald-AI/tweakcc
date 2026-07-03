// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Patches the CLAUDE.md file reading function to also check for alternative
 * filenames (e.g., AGENTS.md) when CLAUDE.md doesn't exist.
 *
 * Supports two code patterns across CC versions:
 *
 * CC <=2.1.69 (sync): Function uses readFileSync/existsSync/statSync directly
 * CC >=2.1.83 (async): File reading is split into jh1 (async reader) and XB9 (processor)
 *   The async reader catches ENOENT/EISDIR errors and returns {info:null,includePaths:[]}
 */
export const writeAgentsMd = (
  file: string,
  altNames: string[]
): string | null => {
  const async2199 = writeAgentsMdAsync2199(file, altNames);
  if (async2199) return async2199;

  const asyncResult = writeAgentsMdAsync(file, altNames);
  if (asyncResult) return asyncResult;

  return writeAgentsMdSync(file, altNames);
};

const writeAgentsMdAsync2199 = (
  file: string,
  altNames: string[]
): string | null => {
  const pattern =
    /async function ([$\w]+)\(([$\w]+),([$\w]+),([$\w]+)\)\{try\{let [$\w]+=[$\w]+\(\),([$\w]+)=await [$\w]+\(([$\w]+),\2,[$\w]+\);if\(\5===null\)return [$\w]+\(`\[CLAUDE\.md\][^`]*`\),\{info:null,includePaths:\[\]\};return [$\w]+\(\5,\2,\3,\4\)\}catch\(([$\w]+)\)\{return ([$\w]+)\(\7,\2\),\{info:null,includePaths:\[\]\}\}\}/;

  const m = file.match(pattern);
  if (!m || m.index === undefined) return null;

  const funcName = m[1];
  const pathParam = m[2];
  const p2 = m[3];
  const p3 = m[4];
  const catchVar = m[7];
  const errorHandler = m[8];

  const altNamesJson = JSON.stringify(altNames);

  const oldSig = `async function ${funcName}(${pathParam},${p2},${p3})`;
  const newSig = `async function ${funcName}(${pathParam},${p2},${p3},didReroute)`;

  const oldCatch = `catch(${catchVar}){return ${errorHandler}(${catchVar},${pathParam}),{info:null,includePaths:[]}}`;
  const reroute =
    `if(!didReroute&&(${pathParam}.endsWith("/CLAUDE.md")||${pathParam}.endsWith("\\\\CLAUDE.md"))){` +
    `for(let alt of ${altNamesJson}){let altPath=${pathParam}.slice(0,-9)+alt;` +
    `try{let _r=await ${funcName}(altPath,${p2},${p3},true);if(_r.info)return _r}catch{}}}`;
  const newCatch = `catch(${catchVar}){${reroute}return ${errorHandler}(${catchVar},${pathParam}),{info:null,includePaths:[]}}`;

  let fn = m[0];
  fn = fn.replace(oldSig, newSig);
  fn = fn.replace(oldCatch, newCatch);

  const startIndex = m.index;
  const endIndex = startIndex + m[0].length;
  const newFile = file.slice(0, startIndex) + fn + file.slice(endIndex);

  showDiff(file, newFile, fn, startIndex, endIndex);

  return newFile;
};

const writeAgentsMdAsync = (
  file: string,
  altNames: string[]
): string | null => {
  // Match the async reader function that:
  // 1. Contains readFile (async)
  // 2. Has a catch block that calls a function with error code checks (ENOENT/EISDIR)
  // 3. Returns {info:null,includePaths:[]}
  const funcPattern =
    /(async function ([$\w]+)\(([$\w]+),([$\w]+),([$\w]+))\)\{try\{let ([$\w]+)=await ([$\w]+)\(\)\.readFile\(\3,\{encoding:"utf-8"\}\);return ([$\w]+)\(\6,\3,\4,\5\)\}catch\(([$\w]+)\)\{return ([$\w]+)\(\9,\3\),\{info:null,includePaths:\[\]\}\}\}/;

  const funcMatch = file.match(funcPattern);
  if (!funcMatch || funcMatch.index === undefined) {
    return null;
  }

  const fullMatch = funcMatch[0];
  const funcSig = funcMatch[1]; // async function NAME(A,q,K
  const funcName = funcMatch[2]; // jh1
  const pathParam = funcMatch[3]; // A
  const typeParam = funcMatch[4]; // q
  const thirdParam = funcMatch[5]; // K
  const readVar = funcMatch[6]; // z
  const fsGetter = funcMatch[7]; // j8
  const processorFunc = funcMatch[8]; // XB9
  const catchVar = funcMatch[9]; // _
  const errorHandler = funcMatch[10]; // DB9

  const altNamesJson = JSON.stringify(altNames);

  const replacement =
    `${funcSig},didReroute){try{let ${readVar}=await ${fsGetter}().readFile(${pathParam},{encoding:"utf-8"});return ${processorFunc}(${readVar},${pathParam},${typeParam},${thirdParam})}catch(${catchVar}){` +
    `if(!didReroute&&(${pathParam}.endsWith("/CLAUDE.md")||${pathParam}.endsWith("\\\\CLAUDE.md"))){` +
    `for(let alt of ${altNamesJson}){` +
    `let altPath=${pathParam}.slice(0,-9)+alt;` +
    `try{let r=await ${funcName}(altPath,${typeParam},${thirdParam},true);if(r.info)return r}catch{}` +
    `}}` +
    `return ${errorHandler}(${catchVar},${pathParam}),{info:null,includePaths:[]}}}`;

  const startIndex = funcMatch.index;
  const endIndex = startIndex + fullMatch.length;

  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);

  return newFile;
};

const writeAgentsMdSync = (file: string, altNames: string[]): string | null => {
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
  let callerFsMatch: RegExpMatchArray | null = null;
  if (!fsMatch) {
    // Try the caller function for fs expression
    const callerSearch = file.slice(Math.max(0, funcStart - 5000), funcStart);
    callerFsMatch = callerSearch.match(fsPattern);
    if (!callerFsMatch) {
      console.error(
        'patch: agentsMd: failed to find fs expression in function or caller'
      );
      return null;
    }
  }

  const fsExpr = fsMatch
    ? fsMatch[1]
    : callerFsMatch
      ? callerFsMatch[1]
      : 'require("fs")';

  const altNamesJson = JSON.stringify(altNames);

  const sigIndex = funcStart + upToFuncParamsClosingParen.length;
  let newFile = file.slice(0, sigIndex) + ',didReroute' + file.slice(sigIndex);

  showDiff(file, newFile, ',didReroute', sigIndex, sigIndex);

  const funcBody = newFile.slice(funcStart);

  const oldEarlyReturnPattern = /\.isFile\(\)\)return null/;
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
