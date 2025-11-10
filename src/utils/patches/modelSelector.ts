// Please see the note about writing patches in ./index.js.

import { showDiff } from './index.js';

// Models to inject/make available.
// prettier-ignore
export const CUSTOM_MODELS: { label: string; slug: string; internal: string }[] = [
  { label: 'Opus 4.1',            slug: 'opus-4.1',            internal: 'claude-opus-4-1-20250805' },
  { label: 'Opus 4',              slug: 'opus-4',              internal: 'claude-opus-4-20250514' },
  { label: 'Sonnet 4',            slug: 'sonnet-4',            internal: 'claude-sonnet-4-20250514' },
  { label: 'Sonnet 3.7',          slug: 'sonnet-3.7',          internal: 'claude-3-7-sonnet-20250219' },
  { label: 'Sonnet 3.5 (October)',slug: 'sonnet-3.5-october',  internal: 'claude-3-5-sonnet-20241022' },
  { label: 'Sonnet 3.5 (June)',   slug: 'sonnet-3.5-june',     internal: 'claude-3-5-sonnet-20240620' },
  { label: 'Haiku 3.5',           slug: 'haiku-3.5',           internal: 'claude-3-5-haiku-20241022' },
  { label: 'Haiku 3',             slug: 'haiku-3',             internal: 'claude-3-haiku-20240307' },
  { label: 'Opus 3',              slug: 'opus-3',              internal: 'claude-3-opus-20240229' },
];

const getModelSelectorInsertionPoint = (
  oldFile: string
): { insertionIndex: number; optionsVar: string } | null => {
  const labelIndex = oldFile.indexOf('Switch between Claude models');
  if (labelIndex === -1) {
    console.error(
      'patch: getModelSelectorInsertionPoint: failed to find labelIndex'
    );
    return null;
  }

  const searchStart = Math.max(0, labelIndex - 600);
  const searchEnd = labelIndex;
  const chunk = oldFile.slice(searchStart, searchEnd);

  const m = chunk.match(
    /\[[$\w]+,\s*[$\w]+\]\s*=\s*[$\w]+\.useState\([^)]*\)\s*,\s*([$\w]+)=/
  );
  if (!m || m.index === undefined) {
    console.error(
      'patch: getModelSelectorInsertionPoint: failed to find useState'
    );
    return null;
  }

  const absStart = searchStart + m.index;
  let i = absStart;
  while (i < oldFile.length && oldFile[i] !== ';') i++;
  if (i >= oldFile.length) {
    console.error(
      'patch: getModelSelectorInsertionPoint: failed to find semicolon'
    );
    return null;
  }
  const insertionIndex = i + 1; // right after the semicolon

  const optionsVar = m[1];
  return { insertionIndex, optionsVar };
};

const writeModelSelectorOptions = (oldFile: string): string | null => {
  const found = getModelSelectorInsertionPoint(oldFile);
  if (!found) return null;

  const { insertionIndex, optionsVar } = found;

  const inject = CUSTOM_MODELS.map(m => {
    const label = JSON.stringify(m.label);
    const value = JSON.stringify(m.slug);
    return `${optionsVar}.push({value:${value},label:${label}});`;
  }).join('');

  const newFile =
    oldFile.slice(0, insertionIndex) + inject + oldFile.slice(insertionIndex);
  showDiff(oldFile, newFile, inject, insertionIndex, insertionIndex);
  return newFile;
};

// 2) Extend the known model names list (sB2=[...]) to include our lowercased friendly names
const writeKnownModelNames = (oldFile: string): string | null => {
  const m = oldFile.match(/"sonnet\[1m\]"/);
  if (!m || m.index === undefined) {
    console.error(
      'patch: writeKnownModelNames: failed to find sonnet[1m] marker'
    );
    return null;
  }
  const markerIdx = m.index;

  // Find '[' belonging to the array definition (e.g., sB2=[ ... ])
  let start = markerIdx;
  while (start >= 0 && oldFile[start] !== '[') {
    start--;
  }
  if (start < 0) {
    console.error('patch: writeKnownModelNames: failed to find array start');
    return null;
  }
  // Ensure previous non-space char before '[' is '=' (assignment)
  let p = start - 1;
  while (p >= 0 && /\s/.test(oldFile[p])) {
    p--;
  }
  if (p < 0 || oldFile[p] !== '=') {
    console.error('patch: writeKnownModelNames: failed to find assignment');
    return null;
  }

  // Find matching closing ']'
  let end = start;
  let depth = 0;
  let foundEnd = -1;
  while (end < oldFile.length) {
    const ch = oldFile[end];
    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) {
        foundEnd = end;
        break;
      }
    }
    end++;
  }
  if (foundEnd === -1) {
    console.error('patch: writeKnownModelNames: failed to find array end');
    return null;
  }

  const arrayText = oldFile.slice(start, foundEnd + 1);
  let arr: string[];
  try {
    arr = JSON.parse(arrayText);
  } catch {
    console.error('patch: writeKnownModelNames: failed to parse array');
    return null;
  }

  const toAdd = CUSTOM_MODELS.map(m => m.slug);
  const set = new Set(arr);
  for (const name of toAdd) {
    set.add(name);
  }
  const updated = JSON.stringify(Array.from(set));

  const newFile =
    oldFile.slice(0, start) + updated + oldFile.slice(foundEnd + 1);
  showDiff(oldFile, newFile, updated, start, foundEnd + 1);
  return newFile;
};

// 3) Append new cases to the switch that maps friendly names -> internal IDs
const writeModelSwitchMapping = (oldFile: string): string | null => {
  const caseAnchor = 'case"sonnet[1m]"';
  const caseIdx = oldFile.indexOf(caseAnchor);
  if (caseIdx === -1) {
    console.error('patch: writeModelSwitchMapping: failed to find caseAnchor');
    return null;
  }

  // Find the opening '{' for the switch block by scanning backward
  let open = caseIdx;
  while (open >= 0 && oldFile[open] !== '{') {
    open--;
  }
  if (open < 0) {
    console.error('patch: writeModelSwitchMapping: failed to find switch open');
    return null;
  }

  // Find the closing '}' for the switch block by scanning forward
  let close = caseIdx;
  while (close < oldFile.length && oldFile[close] !== '}') {
    close++;
  }
  if (close >= oldFile.length) {
    console.error(
      'patch: writeModelSwitchMapping: failed to find switch close'
    );
    return null;
  }

  const oldSwitch = oldFile.slice(open, close + 1);
  const appended = CUSTOM_MODELS.map(
    m => `case${JSON.stringify(m.slug)}:return${JSON.stringify(m.internal)};`
  ).join('');
  const beforeClose = oldSwitch.slice(0, -1);
  const endsWithSemicolon = /;\s*$/.test(beforeClose);
  const injected = (endsWithSemicolon ? '' : ';') + appended;
  const newSwitch = beforeClose + injected + '}';

  const newFile = oldFile.slice(0, open) + newSwitch + oldFile.slice(close + 1);
  showDiff(
    oldFile,
    newFile,
    appended,
    open + oldSwitch.length - 1,
    open + oldSwitch.length - 1
  );
  return newFile;
};

// One-shot helper to apply all model-related customizations
export const writeModelCustomizations = (oldFile: string): string | null => {
  let updated: string | null = oldFile;

  // const a = writeKnownModelNames(updated);
  // if (a) updated = a;

  // const b = writeModelSwitchMapping(updated);
  // if (b) updated = b;

  const c = writeModelSelectorOptions(updated);
  if (c) updated = c;

  return updated === oldFile ? null : updated;
};
