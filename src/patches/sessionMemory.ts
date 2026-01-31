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
// Past sessions pattern (CC 2.1.27):
// ```diff
//  function AQ8() {
// -  if (!$_("tengu_coral_fern", !1)) return null;
//    return `# Accessing Past Sessions...
//  }
// ```

import { showDiff } from './index';

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
 */
const patchPastSessions = (file: string): string | null => {
  const pattern = /if\(![$\w]+\("tengu_coral_fern",!1\)\)return null;/;
  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error('patch: sessionMemory: failed to find past sessions gate');
    return null;
  }

  const newFile =
    file.slice(0, match.index) + file.slice(match.index + match[0].length);

  showDiff(file, newFile, '', match.index, match.index + match[0].length);
  return newFile;
};

/**
 * Combined patch - applies both extraction and past sessions
 */
export const writeSessionMemory = (oldFile: string): string | null => {
  let newFile = patchExtraction(oldFile);
  if (!newFile) return null;

  newFile = patchPastSessions(newFile);
  return newFile;
};
