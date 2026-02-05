// Input Pattern Highlighters Patch
// This patch adds custom syntax highlighting to the user's input prompt.
// Users can define regex patterns that match text in their typing area
// and style them with custom colors, text styles, and format strings.

import { stringifyRegex } from '@/utils';
import { InputPatternHighlighter } from '../types';
import { findChalkVar, LocationResult, showDiff, escapeIdent } from './index';

/**
 * Find the location where we need to add the custom match type rendering.
 * This finds the "solid" type renderer and returns info for inserting after it.
 *
 * Pattern: else if(X.type==="solid")return Y.createElement(Z,{key:K,color:X.color},Y.createElement(T,null,M.text));
 */
const findSolidMatchRendererLocation = (
  oldFile: string
): LocationResult | null => {
  const pattern =
    /else if\(([$\w]+)\.type==="solid"\)return ([$\w]+)\.createElement\(([$\w]+),\{key:([$\w]+),color:[$\w]+\.color\},[$\w]+\.createElement\([$\w]+,null,([$\w]+)\.text\)\);/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    console.error(
      'patch: inputPatternHighlighters: failed to find solid match renderer pattern'
    );
    return null;
  }

  return {
    startIndex: match.index + match[0].length,
    endIndex: match.index + match[0].length,
    identifiers: [
      match[1], // matchDefinitionVar (the style object, e.g., X)
      match[2], // reactVar (e.g., Y)
      match[3], // textComponentVar (e.g., Z)
      match[4], // keyVar (e.g., K)
      match[5], // matchVar (the match object with .text, e.g., M)
    ],
  };
};

/**
 * Find the start of the match pushes section and return both the location and the ranges variable.
 *
 * Pattern: X.push({start:...,end:...,style:{type:"solid",color:"warning"}
 * Returns the match index and the variable name (X = rangesVar)
 */
const findStartOfMatchPushes = (
  oldFile: string
): { index: number; rangesVar: string } | null => {
  const pattern =
    /\b([$\w]+)\.push\(\{start:[$\w]+,end:[$\w]+\+[$\w]+\.length,style:\{type:"solid",color:"warning"\}/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    console.error(
      'patch: inputPatternHighlighters: failed to find match pushes pattern'
    );
    return null;
  }

  return {
    index: match.index,
    rangesVar: match[1],
  };
};

/**
 * Find the React useMemo variable by looking back from the match pushes location.
 */
const findReactVarFromUseMemo = (
  oldFile: string,
  searchEndIndex: number
): string | null => {
  // Look back 100 chars from searchEndIndex
  const searchStart = Math.max(0, searchEndIndex - 100);
  const searchWindow = oldFile.slice(searchStart, searchEndIndex);

  // Find the LAST instance of useMemo pattern
  const pattern = /\b[$\w]+=([$\w]+(?:\.default)?)\.useMemo\(/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(searchWindow)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    console.error(
      'patch: inputPatternHighlighters: failed to find useMemo pattern'
    );
    return null;
  }

  return lastMatch[1];
};

/**
 * Find the input variable by looking back from the match pushes location.
 */
const findInputVar = (
  oldFile: string,
  searchEndIndex: number
): string | null => {
  // Look back 4000 chars from searchEndIndex
  const searchStart = Math.max(0, searchEndIndex - 4000);
  const searchWindow = oldFile.slice(searchStart, searchEndIndex);

  // Find input:X pattern
  const pattern = /\binput:([$\w]+),/;
  const match = searchWindow.match(pattern);

  if (!match) {
    console.error(
      'patch: inputPatternHighlighters: failed to find input variable pattern'
    );
    return null;
  }

  return match[1];
};

/**
 * Find the location to insert the useMemo hooks.
 * We need to find a spot in the variable declarations before the match pushes.
 * Look for the pattern where useMemo is being used and insert after the last one.
 */
const findUseMemoInsertLocation = (
  oldFile: string,
  matchPushesIndex: number
): LocationResult | null => {
  const reactVar = findReactVarFromUseMemo(oldFile, matchPushesIndex);
  if (!reactVar) return null;

  const inputVar = findInputVar(oldFile, matchPushesIndex);
  if (!inputVar) return null;

  // Look back from matchPushesIndex to find the last useMemo call
  // We want to insert AFTER the last useMemo's closing bracket and comma
  const searchStart = Math.max(0, matchPushesIndex - 2000);
  const searchWindow = oldFile.slice(searchStart, matchPushesIndex);

  // Find the last useMemo pattern and where it ends (after the dependency array)
  // Pattern: varName=reactVar.useMemo(()=>{...},[...]),
  const useMemoPattern =
    /\b[$\w]+=([$\w]+(?:\.default)?)\.useMemo\(\(\)=>\{[^}]*\},\[[^\]]*\]\),?/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = useMemoPattern.exec(searchWindow)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    console.error(
      'patch: inputPatternHighlighters: failed to find useMemo insertion point'
    );
    return null;
  }

  // Insert after the last useMemo declaration
  const insertIndex = searchStart + lastMatch.index + lastMatch[0].length;

  return {
    startIndex: insertIndex,
    endIndex: insertIndex,
    identifiers: [reactVar, inputVar],
  };
};

/**
 * Find the location to insert the range pushes (before the return statement).
 */
const findRangePushesInsertLocation = (
  oldFile: string,
  matchPushesIndex: number,
  rangesVar: string
): LocationResult | null => {
  // Look ahead 600 chars from matchPushesIndex
  const searchEnd = Math.min(oldFile.length, matchPushesIndex + 600);
  const searchWindow = oldFile.slice(matchPushesIndex, searchEnd);

  // Find `return rangesVar}` (note: }} because minified, the closing brace of the function)
  const pattern = new RegExp(`return ${escapeIdent(rangesVar)}}`);
  const match = searchWindow.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: inputPatternHighlighters: failed to find return statement'
    );
    return null;
  }

  const insertIndex = matchPushesIndex + match.index;

  return {
    startIndex: insertIndex,
    endIndex: insertIndex,
    identifiers: [rangesVar],
  };
};

/**
 * Build the chalk chain for a highlighter configuration.
 */
const buildChalkChain = (
  chalkVar: string,
  highlighter: InputPatternHighlighter
): string => {
  let chain = chalkVar;

  // Add foreground color
  if (highlighter.foregroundColor) {
    const fgMatch = highlighter.foregroundColor.match(/\d+/g);
    if (fgMatch) {
      chain += `.rgb(${fgMatch.join(',')})`;
    }
  }

  // Add background color
  if (highlighter.backgroundColor) {
    const bgMatch = highlighter.backgroundColor.match(/\d+/g);
    if (bgMatch) {
      chain += `.bgRgb(${bgMatch.join(',')})`;
    }
  }

  // Add styling
  if (highlighter.styling.includes('bold')) chain += '.bold';
  if (highlighter.styling.includes('italic')) chain += '.italic';
  if (highlighter.styling.includes('underline')) chain += '.underline';
  if (highlighter.styling.includes('strikethrough')) chain += '.strikethrough';
  if (highlighter.styling.includes('inverse')) chain += '.inverse';

  return chain;
};

/**
 * Apply all input pattern highlighter patches.
 */
export const writeInputPatternHighlighters = (
  oldFile: string,
  highlighters: InputPatternHighlighter[]
): string | null => {
  // Filter to only enabled highlighters
  const enabledHighlighters = highlighters.filter(h => h.enabled);

  if (enabledHighlighters.length === 0) {
    return null; // No highlighters to apply
  }

  // Find chalk variable
  const chalkVar = findChalkVar(oldFile);
  if (!chalkVar) {
    console.error(
      '^ patch: inputPatternHighlighters: failed to find chalk variable'
    );
    return null;
  }

  let newFile = oldFile;

  // === PATCH 1: Add custom match type rendering ===
  const solidLocation = findSolidMatchRendererLocation(oldFile);
  if (!solidLocation) {
    console.error(
      '^ patch: inputPatternHighlighters: solidLocation returned null'
    );
    return null;
  }

  const [matchDefinitionVar, reactVar, textComponentVar, keyVar, matchVar] =
    solidLocation.identifiers!;

  const customRendererCode = `else if(${matchDefinitionVar}.type==="custom")return ${reactVar}.createElement(${textComponentVar},{key:${keyVar}},${matchDefinitionVar}.fn(${matchDefinitionVar}.format.replace(/\\{MATCH\\}/g,${matchVar}.text)));`;

  newFile =
    oldFile.slice(0, solidLocation.startIndex) +
    customRendererCode +
    oldFile.slice(solidLocation.endIndex);

  showDiff(
    oldFile,
    newFile,
    customRendererCode,
    solidLocation.startIndex,
    solidLocation.endIndex
  );

  // === PATCH 2: Add useMemo hooks for each highlighter ===
  // Note: We need to re-find locations since we modified the file
  const matchPushes = findStartOfMatchPushes(newFile);
  if (!matchPushes) {
    console.error(
      '^ patch: inputPatternHighlighters: matchPushes returned null'
    );
    return null;
  }

  const useMemoLocation = findUseMemoInsertLocation(newFile, matchPushes.index);
  if (!useMemoLocation) {
    console.error(
      '^ patch: inputPatternHighlighters: useMemoLocation returned null'
    );
    return null;
  }

  const [reactVarFromMemo, inputVar] = useMemoLocation.identifiers!;

  // Build useMemo hooks for each highlighter
  let useMemoCode = '';
  for (let i = 0; i < enabledHighlighters.length; i++) {
    const highlighter = enabledHighlighters[i];
    // Ensure the regex has the global flag
    let flags = highlighter.regexFlags;
    if (!flags.includes('g')) {
      flags += 'g';
    }
    const regex = new RegExp(highlighter.regex, flags);
    const regexStr = stringifyRegex(regex);

    useMemoCode += `matchedTweakccReplacements${i}=${reactVarFromMemo}.useMemo(()=>{return[...${inputVar}.matchAll(${regexStr})].map(m=>({start:m.index,end:m.index+m[0].length}))},[${inputVar}]),`;
  }

  const oldFileForPatch2 = newFile;
  newFile =
    newFile.slice(0, useMemoLocation.startIndex) +
    useMemoCode +
    newFile.slice(useMemoLocation.endIndex);

  showDiff(
    oldFileForPatch2,
    newFile,
    useMemoCode,
    useMemoLocation.startIndex,
    useMemoLocation.endIndex
  );

  // === PATCH 3: Add range pushes for each highlighter ===
  // Re-find the match pushes location since we modified the file
  const matchPushes2 = findStartOfMatchPushes(newFile);
  if (!matchPushes2) {
    console.error(
      '^ patch: inputPatternHighlighters: matchPushes2 returned null'
    );
    return null;
  }

  const rangePushesLocation = findRangePushesInsertLocation(
    newFile,
    matchPushes2.index,
    matchPushes2.rangesVar
  );
  if (!rangePushesLocation) {
    console.error(
      '^ patch: inputPatternHighlighters: rangePushesLocation returned null'
    );
    return null;
  }

  const rangesVar = rangePushesLocation.identifiers![0];

  // Build range push code for each highlighter
  let rangePushCode = '';
  for (let i = 0; i < enabledHighlighters.length; i++) {
    const highlighter = enabledHighlighters[i];
    const chalkChain = buildChalkChain(chalkVar, highlighter);
    const formatStr = JSON.stringify(highlighter.format);

    rangePushCode += `for(let matchedTweakccReplacement of matchedTweakccReplacements${i}){${rangesVar}.push({start:matchedTweakccReplacement.start,end:matchedTweakccReplacement.end,style:{type:"custom",fn:${chalkChain},format:${formatStr}},priority:100})}`;
  }

  const oldFileForPatch3 = newFile;
  newFile =
    newFile.slice(0, rangePushesLocation.startIndex) +
    rangePushCode +
    newFile.slice(rangePushesLocation.endIndex);

  showDiff(
    oldFileForPatch3,
    newFile,
    rangePushCode,
    rangePushesLocation.startIndex,
    rangePushesLocation.endIndex
  );

  return newFile;
};
