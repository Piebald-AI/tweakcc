// Please see the note about writing patches in ./index

import { escapeIdent, showDiff } from './index';

// Models to inject/make available.
// prettier-ignore
export const CUSTOM_MODELS: { value: string; label: string; description: string }[] = [
  { value: 'claude-opus-4-5-20251101',   label: 'Opus 4.5',             description: "Claude Opus 4.5 (November 2025)" },
  { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5',           description: "Claude Sonnet 4.5 (September 2025)" },
  { value: 'claude-opus-4-1-20250805',   label: 'Opus 4.1',             description: "Claude Opus 4.1 (August 2025)" },
  { value: 'claude-opus-4-20250514',     label: 'Opus 4',               description: "Claude Opus 4 (May 2025)" },
  { value: 'claude-sonnet-4-20250514',   label: 'Sonnet 4',             description: "Claude Sonnet 4 (May 2025)" },
  { value: 'claude-3-7-sonnet-20250219', label: 'Sonnet 3.7',           description: "Claude 3.7 Sonnet (February 2025)" },
  { value: 'claude-3-5-sonnet-20241022', label: 'Sonnet 3.5 (October)', description: "Claude 3.5 Sonnet (October 2024)" },
  { value: 'claude-3-5-haiku-20241022',  label: 'Haiku 3.5',            description: "Claude 3.5 Haiku (October 2024)" },
  { value: 'claude-3-5-sonnet-20240620', label: 'Sonnet 3.5 (June)',    description: "Claude 3.5 Sonnet (June 2024)" },
  { value: 'claude-3-haiku-20240307',    label: 'Haiku 3',              description: "Claude 3 Haiku (March 2024)" },
  { value: 'claude-3-opus-20240229',     label: 'Opus 3',               description: "Claude 3 Opus (February 2024)" },
];

const findCustomModelListInsertionPoint = (
  fileContents: string
): { insertionIndex: number; modelListVar: string } | null => {
  // 1. Find the custom model push pattern
  const pushPattern =
    /\b([$\w]+)\.push\(\{value:[$\w]+,label:[$\w]+,description:"Custom model"\}\)/;
  const pushMatch = fileContents.match(pushPattern);
  if (!pushMatch || pushMatch.index === undefined) {
    console.error(
      'patch: findCustomModelListInsertionPoint: failed to find custom model push'
    );
    return null;
  }

  // 2. Extract the model list variable name
  const modelListVar = pushMatch[1];

  // 3. Look back 600 chars from the push match
  const searchStart = Math.max(0, pushMatch.index - 600);
  const chunk = fileContents.slice(searchStart, pushMatch.index);

  // 4. Find the LAST occurrence of the function with let modelListVar=...;
  const funcPattern = new RegExp(
    `function [$\\w]+\\(\\)\\{let ${escapeIdent(modelListVar)}=.+?;`,
    'g'
  );
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = funcPattern.exec(chunk)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    console.error(
      `patch: findCustomModelListInsertionPoint: failed to find function with let ${modelListVar}`
    );
    return null;
  }

  // 5. Return index after the semicolon (end of the match), and the var name
  const insertionIndex = searchStart + lastMatch.index + lastMatch[0].length;
  return { insertionIndex, modelListVar };
};

export const writeModelCustomizations = (oldFile: string): string | null => {
  const found = findCustomModelListInsertionPoint(oldFile);
  if (!found) return null;

  const { insertionIndex, modelListVar } = found;

  // Build the injection: push each custom model onto the list
  const inject = CUSTOM_MODELS.map(
    model => `${modelListVar}.push(${JSON.stringify(model)});`
  ).join('');

  const newFile =
    oldFile.slice(0, insertionIndex) + inject + oldFile.slice(insertionIndex);
  showDiff(oldFile, newFile, inject, insertionIndex, insertionIndex);
  return newFile;
};
