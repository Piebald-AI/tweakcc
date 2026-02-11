// Session Memory Patch - Force-enable session memory in Claude Code
//
// Enables both:
// 1. Session memory extraction (tengu_session_memory) - auto-extracts notes during conversation
// 2. Past session search (tengu_coral_fern) - adds system prompt for searching past sessions
//
// These are logically one feature - extraction creates session memories, search lets you use them.
//
// Extraction pattern (CC 2.1.27):
// ```diff
//  function l28() {
// +  return true;
//    return $_("tengu_session_memory", !1)
//  }
// ```
//
// Past sessions pattern (CC ≤2.1.37):
// ```diff
//  function AQ8() {
// -  if (!$_("tengu_coral_fern", !1)) return null;
//    return `# Accessing Past Sessions...
//  }
// ```
//
// Past sessions pattern (CC ≥2.1.38):
// ```diff
// -if(uL("tengu_coral_fern",!1)){
// +if(true){
//    let M=wX(YL());E.push("## Searching past context",...
//  }
// ```

import { showDiff, globalReplace } from './index';

/**
 * Patch 1: Bypass tengu_session_memory flag check for extraction
 */
const patchExtraction = (file: string): string | null => {
  const pattern = /function [$\w]+\(\)\{return [$\w]+\("tengu_session_memory"/;
  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error('patch: sessionMemory: failed to find extraction gate');
    return null;
  }

  const insertIndex = match.index + match[0].indexOf('{') + 1;
  const insertion = 'return true;';

  const newFile =
    file.slice(0, insertIndex) + insertion + file.slice(insertIndex);

  showDiff(file, newFile, insertion, insertIndex, insertIndex);
  return newFile;
};

/**
 * Patch 2: Bypass tengu_coral_fern flag check for past session search
 *
 * CC ≤2.1.37: negative guard with early return
 *   if(!fn("tengu_coral_fern",!1))return null;
 *
 * CC ≥2.1.38: positive conditional block
 *   if(fn("tengu_coral_fern",!1)){...}
 */
const patchPastSessions = (file: string): string | null => {
  // Try new pattern first (CC ≥2.1.38): positive conditional block
  const newPattern = /if\([$\w]+\("tengu_coral_fern",!1\)\)\{/;
  const newMatch = file.match(newPattern);

  if (newMatch && newMatch.index !== undefined) {
    const replacement = 'if(true){';
    const newFile =
      file.slice(0, newMatch.index) +
      replacement +
      file.slice(newMatch.index + newMatch[0].length);

    showDiff(
      file,
      newFile,
      replacement,
      newMatch.index,
      newMatch.index + newMatch[0].length
    );
    return newFile;
  }

  // Fall back to old pattern (CC ≤2.1.37): negative guard with early return
  const oldPattern = /if\(![$\w]+\("tengu_coral_fern",!1\)\)return null;/;
  const oldMatch = file.match(oldPattern);

  if (oldMatch && oldMatch.index !== undefined) {
    const newFile =
      file.slice(0, oldMatch.index) +
      file.slice(oldMatch.index + oldMatch[0].length);

    showDiff(
      file,
      newFile,
      '',
      oldMatch.index,
      oldMatch.index + oldMatch[0].length
    );
    return newFile;
  }

  console.error('patch: sessionMemory: failed to find past sessions gate');
  return null;
};

/**
 * Patch 3: Make per-section and total file token limits configurable via env vars
 */
const patchTokenLimits = (file: string): string | null => {
  // Pattern matches: =2000 ... =12000 ... # Session Title
  const pattern =
    /(=)2000((?:.|\n){0,15}?=)12000((?:.|\n){0,20}# Session Title)/;
  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error('patch: sessionMemory: failed to find token limits pattern');
    return null;
  }

  const perSectionCode = 'Number(process.env.CC_SM_PER_SECTION_TOKENS??2000)';
  const totalFileCode = 'Number(process.env.CM_SM_TOTAL_FILE_LIMIT??12000)';

  const replacement =
    match[1] + perSectionCode + match[2] + totalFileCode + match[3];
  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);
  return newFile;
};

/**
 * Patch 4: Make session memory update thresholds configurable via env vars
 */
const patchUpdateThresholds = (file: string): string | null => {
  let newFile = file;

  // Replace minimumMessageTokensToInit
  newFile = globalReplace(
    newFile,
    /minimumMessageTokensToInit:1e4\b/g,
    'minimumMessageTokensToInit:Number(process.env.CC_SM_MINIMUM_MESSAGE_TOKENS_TO_INIT??1e4)'
  );

  // Replace minimumTokensBetweenUpdate
  newFile = globalReplace(
    newFile,
    /minimumTokensBetweenUpdate:5000\b/g,
    'minimumTokensBetweenUpdate:Number(process.env.CC_SM_MINIMUM_TOKENS_BETWEEN_UPDATE??5000)'
  );

  // Replace toolCallsBetweenUpdates
  newFile = globalReplace(
    newFile,
    /toolCallsBetweenUpdates:3\b/g,
    'toolCallsBetweenUpdates:Number(process.env.CC_SM_TOOL_CALLS_BETWEEN_UPDATES??3)'
  );

  // Check if any replacements were made
  if (newFile === file) {
    console.error(
      'patch: sessionMemory: failed to find update thresholds patterns'
    );
    return null;
  }

  return newFile;
};

/**
 * Combined patch - applies extraction, past sessions, token limits, and update thresholds
 */
export const writeSessionMemory = (oldFile: string): string | null => {
  let newFile = patchExtraction(oldFile);
  if (!newFile) return null;

  newFile = patchPastSessions(newFile);
  if (!newFile) return null;

  newFile = patchTokenLimits(newFile);
  if (!newFile) return null;

  newFile = patchUpdateThresholds(newFile);
  return newFile;
};
