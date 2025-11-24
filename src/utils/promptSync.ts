import * as fs from 'node:fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { SYSTEM_PROMPTS_DIR } from './types.js';
import { downloadStringsFile } from './download.js';
import {
  storeHashes,
  getPromptHash,
  computeMD5Hash,
} from './systemPromptHashIndex.js';
import chalk from 'chalk';

/**
 * Prompt structure from strings-X.Y.Z.json files
 */
export interface StringsPrompt {
  name: string;
  id: string;
  description: string;
  pieces: string[];
  identifiers: number[]; // Can be numbers in JSON or strings when parsed
  identifierMap: Record<string, string>;
  version: string;
}

/**
 * Structure of downloaded strings file
 */
export interface StringsFile {
  version: string;
  prompts: StringsPrompt[];
}

/**
 * Markdown file frontmatter structure (what users see and edit)
 */
export interface MarkdownPrompt {
  name: string;
  description: string;
  ccVersion: string; // CC version this prompt is based on
  variables?: string[]; // Available variables extracted from identifierMap
  content: string; // The actual prompt content with ${VARIABLE_NAME} placeholders
  /**
   * Line offset of the first content line within the original markdown file.
   * This counts how many lines (including frontmatter and delimiters) appear
   * before the first character of `content`, so we can map content-relative
   * line numbers back to real file line numbers when reporting errors.
   */
  contentLineOffset: number;
}

/**
 * Result of syncing a single prompt
 */
export interface SyncResult {
  id: string;
  name: string;
  description: string;
  action: 'created' | 'updated' | 'skipped' | 'conflict';
  oldVersion?: string;
  newVersion: string;
  diffHtmlPath?: string;
}

/**
 * Overall sync results
 */
export interface SyncSummary {
  ccVersion: string;
  results: SyncResult[];
}

/**
 * Parses markdown file with YAML frontmatter using gray-matter
 * Uses HTML comment delimiters to avoid conflicts with markdown content
 */
export const parseMarkdownPrompt = (markdown: string): MarkdownPrompt => {
  const parsed = matter(markdown, {
    delimiters: ['<!--', '-->'],
  });
  const { name, description, ccVersion, variables } = parsed.data;

  // Compute how many lines appear before the start of parsed.content in the
  // original markdown. This lets us translate content-relative line numbers
  // (starting at 1 for the first line of `parsed.content.trim()`) back to
  // absolute file line numbers for error reporting.
  let contentLineOffset = 0;
  const contentIndex = markdown.indexOf(parsed.content);
  if (contentIndex >= 0) {
    const prefix = markdown.slice(0, contentIndex);
    // Number of newline characters before the first character of content
    contentLineOffset = prefix.split('\n').length - 1;
  }

  return {
    name: name || '',
    description: description || '',
    ccVersion: ccVersion || '',
    variables: variables || [],
    content: parsed.content.trim(),
    contentLineOffset,
  };
};

/**
 * Generates markdown file content from a prompt using gray-matter
 * Uses HTML comment delimiters to avoid conflicts with markdown content
 */
export const generateMarkdownFromPrompt = (
  prompt: StringsPrompt,
  customContent?: string
): string => {
  // Reconstruct content from pieces or use custom content
  const content =
    customContent ||
    reconstructContentFromPieces(
      prompt.pieces,
      prompt.identifiers,
      prompt.identifierMap
    );

  // Extract unique variables from identifierMap
  const variables =
    Object.keys(prompt.identifierMap).length > 0
      ? [...new Set(Object.values(prompt.identifierMap))]
      : undefined;

  // Build frontmatter data
  const frontmatterData: Record<string, string | string[]> = {
    name: prompt.name,
    description: prompt.description,
    ccVersion: prompt.version,
  };

  if (variables && variables.length > 0) {
    frontmatterData.variables = variables;
  }

  return matter.stringify(content, frontmatterData, {
    delimiters: ['<!--', '-->'],
  });
};

/**
 * Reconstructs full content string from pieces array with ${HUMAN_NAME} placeholders
 */
export const reconstructContentFromPieces = (
  pieces: string[],
  identifiers: (number | string)[],
  identifierMap: Record<string, string>
): string => {
  let result = '';

  for (let i = 0; i < pieces.length; i++) {
    result += pieces[i];

    // Add the identifier placeholder if there's a corresponding identifier
    if (i < identifiers.length) {
      const labelIndex = identifiers[i];
      const humanName =
        identifierMap[String(labelIndex)] || `UNKNOWN_${labelIndex}`;
      result += humanName;
    }
  }

  return result;
};

/**
 * Builds a regex pattern from pieces array to extract user customizations
 * Returns a regex that will capture what the user put in place of each ${HUMAN_NAME}
 */
export const buildRegexFromPieces = (pieces: string[]): RegExp => {
  let pattern = '';

  for (let i = 0; i < pieces.length; i++) {
    // Escape special regex characters in the text piece
    const escapedPiece = pieces[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern += escapedPiece;

    // Add capture group for content between pieces (what user customized)
    if (i < pieces.length - 1) {
      // Capture everything until the next piece starts (non-greedy)
      pattern += '([\\s\\S]*?)';
    }
  }

  return new RegExp(pattern);
};

/**
 * Extracts user customizations from their markdown content by matching against pieces
 * Returns an array of what the user wrote in place of each placeholder
 */
export const extractUserCustomizations = (
  userContent: string,
  pieces: string[]
): string[] => {
  const regex = buildRegexFromPieces(pieces);
  const match = userContent.match(regex);

  if (!match) {
    throw new Error(
      'User content does not match expected structure from pieces'
    );
  }

  // Return captured groups (skip index 0 which is the full match)
  return match.slice(1);
};

/**
 * Builds HUMAN→real identifier mapping from extracted customizations
 * This maps the human-readable names to what the user actually wrote
 */
export const buildHumanToRealMapping = (
  identifiers: (number | string)[],
  identifierMap: Record<string, string>,
  extractedCustomizations: string[]
): Record<string, string> => {
  const mapping: Record<string, string> = {};
  const seenKeys = new Set<string>();

  for (let i = 0; i < identifiers.length; i++) {
    const labelIndex = identifiers[i];
    const humanName = identifierMap[String(labelIndex)];
    const realValue = extractedCustomizations[i];

    if (!humanName) continue; // Skip if no mapping exists

    // Check for duplicate keys with different values
    if (seenKeys.has(humanName)) {
      const existingValue = mapping[humanName];
      if (existingValue !== realValue) {
        throw new Error(
          `Conflicting mappings for "${humanName}": "${existingValue}" vs "${realValue}"`
        );
      }
    } else {
      mapping[humanName] = realValue;
      seenKeys.add(humanName);
    }
  }

  return mapping;
};

/**
 * Applies user customizations to a new prompt version
 * Takes the new prompt's pieces and applies the user's custom mappings
 */
export const applyCustomizationsToPrompt = (
  newPrompt: StringsPrompt,
  humanToRealMapping: Record<string, string>
): string => {
  let result = '';

  for (let i = 0; i < newPrompt.pieces.length; i++) {
    result += newPrompt.pieces[i];

    if (i < newPrompt.identifiers.length) {
      const labelIndex = newPrompt.identifiers[i];
      const humanName = newPrompt.identifierMap[String(labelIndex)];

      // Use user's customization if available, otherwise use the placeholder
      const value = humanToRealMapping[humanName] ?? `\${${humanName}}`;
      result += value;
    }
  }

  return result;
};

/**
 * Compares two version strings
 * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
export const compareVersions = (v1: string, v2: string): number => {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;

    if (num1 < num2) return -1;
    if (num1 > num2) return 1;
  }

  return 0;
};

/**
 * Gets the markdown file path for a prompt (using name, not id)
 */
export const getPromptFilePath = (promptId: string): string => {
  return path.join(SYSTEM_PROMPTS_DIR, `${promptId}.md`);
};

/**
 * Checks if a markdown file exists for a prompt
 */
export const promptFileExists = async (promptId: string): Promise<boolean> => {
  try {
    await fs.access(getPromptFilePath(promptId));
    return true;
  } catch {
    return false;
  }
};

/**
 * Reads a markdown prompt file
 */
export const readPromptFile = async (
  promptId: string
): Promise<MarkdownPrompt> => {
  const filePath = getPromptFilePath(promptId);
  const content = await fs.readFile(filePath, 'utf-8');
  return parseMarkdownPrompt(content);
};

/**
 * Writes a markdown prompt file
 */
export const writePromptFile = async (
  promptId: string,
  content: string
): Promise<void> => {
  const filePath = getPromptFilePath(promptId);
  await fs.writeFile(filePath, content, 'utf-8');
};

/**
 * Updates variables list in a markdown file's frontmatter
 * This ensures the file always has the latest available variables
 */
export const updateVariables = async (
  promptId: string,
  newIdentifierMap: Record<string, string>
): Promise<void> => {
  const filePath = getPromptFilePath(promptId);
  const markdown = await fs.readFile(filePath, 'utf-8');
  const parsed = matter(markdown, {
    delimiters: ['<!--', '-->'],
  });

  // Extract unique variables from identifierMap
  const variables =
    Object.keys(newIdentifierMap).length > 0
      ? [...new Set(Object.values(newIdentifierMap))]
      : undefined;

  // Update frontmatter with new variables
  const updatedData: Record<string, string | string[]> = {
    name: parsed.data.name,
    description: parsed.data.description,
    ccVersion: parsed.data.ccVersion,
  };

  if (variables && variables.length > 0) {
    updatedData.variables = variables;
  }

  const updatedMarkdown = matter.stringify(parsed.content, updatedData, {
    delimiters: ['<!--', '-->'],
  });
  await writePromptFile(promptId, updatedMarkdown);
};

/**
 * Computes word-level diff for a single line
 * Returns HTML with <mark> tags around changed words
 */
const computeWordDiff = (
  oldText: string,
  newText: string
): { oldHtml: string; newHtml: string } => {
  // Split by word boundaries while preserving whitespace
  const tokenize = (text: string): string[] => {
    return text.split(/(\s+)/);
  };

  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);

  // Build LCS matrix for tokens
  const m = oldTokens.length;
  const n = newTokens.length;
  const lcs: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldTokens[i - 1] === newTokens[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  // Backtrack to identify changed tokens
  const oldChanged: boolean[] = Array(m).fill(false);
  const newChanged: boolean[] = Array(n).fill(false);
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      newChanged[j - 1] = true;
      j--;
    } else if (i > 0) {
      oldChanged[i - 1] = true;
      i--;
    }
  }

  // Build HTML with highlights
  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  let oldHtml = '';
  for (let k = 0; k < oldTokens.length; k++) {
    const token = escapeHtml(oldTokens[k]);
    oldHtml += oldChanged[k] ? `<mark>${token}</mark>` : token;
  }

  let newHtml = '';
  for (let k = 0; k < newTokens.length; k++) {
    const token = escapeHtml(newTokens[k]);
    newHtml += newChanged[k] ? `<mark>${token}</mark>` : token;
  }

  return { oldHtml, newHtml };
};

/**
 * Simple LCS-based diff algorithm to compute line differences
 */
const computeDiff = (
  oldLines: string[],
  newLines: string[]
): Array<{
  type: 'unchanged' | 'removed' | 'added' | 'modified';
  line: string;
  oldLineNo?: number;
  newLineNo?: number;
  oldHtml?: string;
  newHtml?: string;
}> => {
  // Build LCS (Longest Common Subsequence) matrix
  const m = oldLines.length;
  const n = newLines.length;
  const lcs: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff with word-level highlighting
  const diff: Array<{
    type: 'unchanged' | 'removed' | 'added' | 'modified';
    line: string;
    oldLineNo?: number;
    newLineNo?: number;
    oldHtml?: string;
    newHtml?: string;
  }> = [];
  let i = m;
  let j = n;

  const tempDiff: Array<{
    type: 'unchanged' | 'removed' | 'added';
    line: string;
    oldLineNo?: number;
    newLineNo?: number;
  }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      tempDiff.unshift({
        type: 'unchanged',
        line: oldLines[i - 1],
        oldLineNo: i,
        newLineNo: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      tempDiff.unshift({ type: 'added', line: newLines[j - 1], newLineNo: j });
      j--;
    } else if (i > 0) {
      tempDiff.unshift({
        type: 'removed',
        line: oldLines[i - 1],
        oldLineNo: i,
      });
      i--;
    }
  }

  // Post-process to detect modified lines (adjacent removed+added pairs)
  for (let k = 0; k < tempDiff.length; k++) {
    const current = tempDiff[k];
    const next = tempDiff[k + 1];

    if (current.type === 'removed' && next?.type === 'added') {
      // Adjacent removed/added = modified line with word diff
      const wordDiff = computeWordDiff(current.line, next.line);
      diff.push({
        type: 'modified',
        line: current.line,
        oldLineNo: current.oldLineNo,
        newLineNo: next.newLineNo,
        oldHtml: wordDiff.oldHtml,
        newHtml: wordDiff.newHtml,
      });
      k++; // Skip next since we consumed it
    } else {
      diff.push(current);
    }
  }

  return diff;
};

/**
 * Generates an HTML diff file showing differences between old and new versions
 * Shows TWO diffs side-by-side:
 * - Left: oldcc ↔ user customizations (what the user changed)
 * - Right: oldcc ↔ newcc (what changed upstream)
 * Returns the path to the generated HTML file
 */
export const generateDiffHtml = async (
  promptId: string,
  promptName: string,
  oldBaselineContent: string,
  userContent: string,
  newBaselineContent: string,
  oldVersion: string,
  newVersion: string,
  markdownFilePath: string
): Promise<string> => {
  const oldBaselineLines = oldBaselineContent.split('\n');
  const userLines = userContent.split('\n');
  const newBaselineLines = newBaselineContent.split('\n');

  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  // Compute BOTH diffs
  const userDiff = computeDiff(oldBaselineLines, userLines); // oldcc -> user
  const upstreamDiff = computeDiff(oldBaselineLines, newBaselineLines); // oldcc -> newcc

  // Generate left diff HTML (user customizations)
  let userDiffHtml = '';
  for (const entry of userDiff) {
    const escapedLine = escapeHtml(entry.line);
    if (entry.type === 'modified') {
      // Show both old and new lines with word-level highlighting
      const oldLineNum = entry.oldLineNo
        ? String(entry.oldLineNo).padStart(4, ' ')
        : '    ';
      const newLineNum = entry.newLineNo
        ? String(entry.newLineNo).padStart(4, ' ')
        : '    ';
      userDiffHtml += `<div class="line removed"><span class="line-num">${oldLineNum}</span><span class="prefix">- </span>${entry.oldHtml}</div>\n`;
      userDiffHtml += `<div class="line added"><span class="line-num">${newLineNum}</span><span class="prefix">+ </span>${entry.newHtml}</div>\n`;
    } else if (entry.type === 'removed') {
      const lineNum = entry.oldLineNo
        ? String(entry.oldLineNo).padStart(4, ' ')
        : '    ';
      userDiffHtml += `<div class="line removed"><span class="line-num">${lineNum}</span><span class="prefix">- </span>${escapedLine}</div>\n`;
    } else if (entry.type === 'added') {
      const lineNum = entry.newLineNo
        ? String(entry.newLineNo).padStart(4, ' ')
        : '    ';
      userDiffHtml += `<div class="line added"><span class="line-num">${lineNum}</span><span class="prefix">+ </span>${escapedLine}</div>\n`;
    } else {
      const oldLineNum = entry.oldLineNo
        ? String(entry.oldLineNo).padStart(4, ' ')
        : '    ';
      const newLineNum = entry.newLineNo
        ? String(entry.newLineNo).padStart(4, ' ')
        : '    ';
      userDiffHtml += `<div class="line unchanged"><span class="line-num">${oldLineNum} ${newLineNum}</span><span class="prefix">  </span>${escapedLine}</div>\n`;
    }
  }

  // Generate right diff HTML (upstream changes)
  let upstreamDiffHtml = '';
  for (const entry of upstreamDiff) {
    const escapedLine = escapeHtml(entry.line);
    if (entry.type === 'modified') {
      // Show both old and new lines with word-level highlighting
      const oldLineNum = entry.oldLineNo
        ? String(entry.oldLineNo).padStart(4, ' ')
        : '    ';
      const newLineNum = entry.newLineNo
        ? String(entry.newLineNo).padStart(4, ' ')
        : '    ';
      upstreamDiffHtml += `<div class="line removed"><span class="line-num">${oldLineNum}</span><span class="prefix">- </span>${entry.oldHtml}</div>\n`;
      upstreamDiffHtml += `<div class="line added"><span class="line-num">${newLineNum}</span><span class="prefix">+ </span>${entry.newHtml}</div>\n`;
    } else if (entry.type === 'removed') {
      const lineNum = entry.oldLineNo
        ? String(entry.oldLineNo).padStart(4, ' ')
        : '    ';
      upstreamDiffHtml += `<div class="line removed"><span class="line-num">${lineNum}</span><span class="prefix">- </span>${escapedLine}</div>\n`;
    } else if (entry.type === 'added') {
      const lineNum = entry.newLineNo
        ? String(entry.newLineNo).padStart(4, ' ')
        : '    ';
      upstreamDiffHtml += `<div class="line added"><span class="line-num">${lineNum}</span><span class="prefix">+ </span>${escapedLine}</div>\n`;
    } else {
      const oldLineNum = entry.oldLineNo
        ? String(entry.oldLineNo).padStart(4, ' ')
        : '    ';
      const newLineNum = entry.newLineNo
        ? String(entry.newLineNo).padStart(4, ' ')
        : '    ';
      upstreamDiffHtml += `<div class="line unchanged"><span class="line-num">${oldLineNum} ${newLineNum}</span><span class="prefix">  </span>${escapedLine}</div>\n`;
    }
  }

  const diffHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Diff: ${escapeHtml(promptName)} (${escapeHtml(promptId)})</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      margin: 0 0 10px 0;
      color: #333;
    }
    .version-info {
      color: #666;
      font-size: 14px;
    }
    .warning {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin-bottom: 20px;
      border-radius: 4px;
    }
    .warning code {
      background: rgba(0,0,0,0.1);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 13px;
    }
    .diff-panels {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    .diff-container {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .diff-header {
      background: #f8f9fa;
      padding: 12px 15px;
      font-weight: bold;
      border-bottom: 2px solid #dee2e6;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 14px;
    }
    .diff-content {
      padding: 0;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 13px;
      line-height: 1.5;
      overflow-x: auto;
      max-height: 600px;
      overflow-y: auto;
    }
    .line {
      padding: 2px 10px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .line .line-num {
      display: inline-block;
      min-width: 50px;
      margin-right: 10px;
      color: #6a737d;
      text-align: right;
      user-select: none;
      font-size: 12px;
    }
    .line .prefix {
      display: inline-block;
      width: 20px;
      font-weight: bold;
      user-select: none;
    }
    .removed {
      background: #ffebe9;
      color: #24292e;
    }
    .removed .prefix {
      color: #d73a49;
    }
    .added {
      background: #e6ffed;
      color: #24292e;
    }
    .added .prefix {
      color: #22863a;
    }
    .unchanged {
      background: #ffffff;
      color: #24292e;
    }
    .unchanged .prefix {
      color: #6a737d;
    }
    mark {
      background: rgba(255, 200, 0, 0.4);
      padding: 0;
      border-radius: 2px;
    }
    .removed mark {
      background: rgba(215, 58, 73, 0.3);
    }
    .added mark {
      background: rgba(34, 134, 58, 0.3);
    }
    @media (max-width: 1200px) {
      .diff-panels {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(promptName)}</h1>
    <div class="version-info">
      <strong>Old Version:</strong> ${escapeHtml(oldVersion)} →
      <strong>New Version:</strong> ${escapeHtml(newVersion)}
    </div>
  </div>

  <div class="warning">
    <strong>⚠️ Version Mismatch Warning</strong><br>
    Your customized prompt file is based on version ${escapeHtml(oldVersion)},
    but Claude Code is now using version ${escapeHtml(newVersion)}.
    Review the differences below to understand both your customizations and the upstream changes.<br><br>
    <strong>File:</strong> <code>${escapeHtml(markdownFilePath)}</code><br><br>
    When you're done reviewing, update the <code>ccVersion</code> in the file to <strong>${escapeHtml(newVersion)}</strong>.
  </div>

  <div class="diff-panels">
    <div class="diff-container">
      <div class="diff-header">Your Customizations (v${escapeHtml(oldVersion)} → User)</div>
      <div class="diff-content">
${userDiffHtml}      </div>
    </div>

    <div class="diff-container">
      <div class="diff-header">Upstream Changes (v${escapeHtml(oldVersion)} → v${escapeHtml(newVersion)})</div>
      <div class="diff-content">
${upstreamDiffHtml}      </div>
    </div>
  </div>
</body>
</html>`;

  // Save to system prompts directory
  const htmlPath = path.join(SYSTEM_PROMPTS_DIR, `${promptId}.diff.html`);
  await fs.writeFile(htmlPath, diffHtml, 'utf-8');

  return htmlPath;
};

/**
 * Syncs a single prompt file with the current CC version
 * Similar to ensurePromptFile in config.ts but with version tracking
 */
export const syncPrompt = async (
  prompt: StringsPrompt
): Promise<SyncResult> => {
  const result: SyncResult = {
    id: prompt.id,
    name: prompt.name,
    description: prompt.description,
    action: 'skipped',
    newVersion: prompt.version,
  };

  const fileExists = await promptFileExists(prompt.id);

  // File doesn't exist - create it
  if (!fileExists) {
    const markdown = generateMarkdownFromPrompt(prompt);
    await writePromptFile(prompt.id, markdown);
    result.action = 'created';
    return result;
  }

  // File exists - read and update
  const existingFile = await readPromptFile(prompt.id);
  result.oldVersion = existingFile.ccVersion;

  // Always update variables list
  await updateVariables(prompt.id, prompt.identifierMap);

  // Check version comparison
  if (existingFile.ccVersion && prompt.version) {
    const versionComparison = compareVersions(
      existingFile.ccVersion,
      prompt.version
    );

    if (versionComparison === 0) {
      // Same version - already updated above
      result.action = 'skipped';
      return result;
    }

    if (versionComparison != 0) {
      // User's file is based on an older version
      // Check if the user has modified the content
      const oldHash = await getPromptHash(prompt.id, existingFile.ccVersion);
      const currentHash = computeMD5Hash(existingFile.content);
      const isModified = !oldHash || oldHash !== currentHash;

      if (isModified) {
        // User has modified the file
        result.action = 'conflict';

        // Get the old baseline content (unmodified version from old CC version)
        // We need to reconstruct what the old version looked like
        // For now, we'll fetch the old strings file to get the baseline
        let oldBaselineContent = existingFile.content; // Default fallback
        try {
          const oldStringsFile = await downloadStringsFile(
            existingFile.ccVersion
          );
          const oldPrompt = oldStringsFile.prompts.find(
            p => p.id === prompt.id
          );

          if (oldPrompt) {
            oldBaselineContent = reconstructContentFromPieces(
              oldPrompt.pieces,
              oldPrompt.identifiers,
              oldPrompt.identifierMap
            );
          }
        } catch {
          // If we can't download the old version, just use existing content as baseline
          console.log(
            chalk.yellow(
              `Warning: Could not fetch old version ${existingFile.ccVersion} for comparison. Using current file as baseline.`
            )
          );
        }

        // Get the new baseline content
        const newBaselineContent = reconstructContentFromPieces(
          prompt.pieces,
          prompt.identifiers,
          prompt.identifierMap
        );

        const markdownFilePath = getPromptFilePath(prompt.id);
        const diffPath = await generateDiffHtml(
          prompt.id,
          prompt.name,
          oldBaselineContent,
          existingFile.content, // User's current content
          newBaselineContent,
          existingFile.ccVersion,
          prompt.version,
          markdownFilePath
        );
        result.diffHtmlPath = diffPath;
      } else {
        // User has NOT modified the file - automatically upgrade it
        const newMarkdown = generateMarkdownFromPrompt(prompt);
        await writePromptFile(prompt.id, newMarkdown);
        result.action = 'updated';
      }
    }
  }

  return result;
};

/**
 * Main sync function - downloads strings for current CC version and syncs all prompts
 */
export const syncSystemPrompts = async (
  ccVersion: string
): Promise<SyncSummary> => {
  const summary: SyncSummary = {
    ccVersion,
    results: [],
  };

  // Download strings file for current CC version
  const stringsFile = await downloadStringsFile(ccVersion);

  // Store hashes for all prompts in this version
  await storeHashes(stringsFile);

  // Ensure system prompts directory exists
  await fs.mkdir(SYSTEM_PROMPTS_DIR, { recursive: true });

  // Sync each prompt
  for (const prompt of stringsFile.prompts) {
    try {
      const result = await syncPrompt(prompt);
      summary.results.push(result);
    } catch (error) {
      console.log(chalk.red(`Failed to sync prompt ${prompt.id}:`));
      throw error;
    }
  }

  return summary;
};

// Global cache for downloaded strings file to avoid multiple downloads
// This is loaded once at app startup and reused throughout the session
let globalStringsFile: StringsFile | null = null;
let globalCachedVersion: string | null = null;

/**
 * Preloads the strings file for a given version into global cache
 * Should be called once at app startup
 * Returns an object with success status and optional error message
 * @param version - Version string to preload
 */
export const preloadStringsFile = async (
  version: string
): Promise<{ success: boolean; errorMessage?: string }> => {
  try {
    const stringsFile = await downloadStringsFile(version);
    globalStringsFile = stringsFile;
    globalCachedVersion = version;
    return { success: true };
  } catch (error) {
    // If download fails, just leave global cache as null
    globalStringsFile = null;
    globalCachedVersion = null;

    // Return the error message for display
    if (error instanceof Error) {
      return { success: false, errorMessage: error.message };
    }
    return {
      success: false,
      errorMessage: 'Unknown error occurred while downloading system prompts',
    };
  }
};

/**
 * Builds a regex pattern from pieces array that will match the original content in cli.js.
 * The regex captures the actual variable names used in the current CC version.
 *
 * Pieces are split at identifier boundaries, so:
 * - pieces[i] contains text ending with ${ (or no ${ for last piece)
 * - identifier appears between pieces[i] and pieces[i+1]
 * - pieces[i+1] starts with text after the identifier (e.g., .method(), }, etc.)
 *
 * We only capture the bare identifier, not the surrounding ${} or any method calls.
 */
/**
 * Converts non-ASCII characters to regex alternation patterns that match both
 * literal and Unicode-escaped forms (e.g., … matches both "…" and "\u2026").
 * This handles cases where cli.js has escaped Unicode characters.
 */
const escapeNonAsciiForRegex = (text: string): string => {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x00-\x7F]/g, char => {
    const codePoint = char.charCodeAt(0);
    const escaped = `\\\\u${codePoint.toString(16).padStart(4, '0')}`;
    // Match either the literal character OR the escaped version
    return `(?:${char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${escaped})`;
  });
};

/**
 * Converts non-ASCII characters to Unicode escape sequences (\uXXXX).
 * Used when writing prompts back to cli.js for environments that only support ASCII.
 */
const escapeNonAsciiChars = (text: string): string => {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x00-\x7F]/g, char => {
    const codePoint = char.charCodeAt(0);
    return `\\u${codePoint.toString(16).padStart(4, '0')}`;
  });
};

const buildSearchRegexFromPieces = (
  pieces: string[],
  ccVersion: string
): string => {
  let pattern = '';

  for (let i = 0; i < pieces.length; i++) {
    // Replace <<CCVERSION>> with actual version before escaping
    const piece = pieces[i].replace(/<<CCVERSION>>/g, ccVersion);

    // Escape special regex characters in the text piece
    const escapedPiece = piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Handle non-ASCII characters by creating alternation patterns
    const withNonAsciiHandling = escapeNonAsciiForRegex(escapedPiece);
    pattern += withNonAsciiHandling;

    // Add capture group for the variable if this isn't the last piece
    if (i < pieces.length - 1) {
      // Match only the identifier itself - pieces contain ${, }, and any method calls
      // This is more robust as it doesn't assume where } appears
      pattern += '([\\w$]+)';
    }
  }

  return pattern;
};

/**
 * Finds unescaped backticks outside of ${...} interpolation regions using a stack-based parser.
 * Returns a Map of line number -> array of column numbers for each unescaped backtick found.
 */
export const findUnescapedBackticks = (content: string) => {
  const result = new Map<number, number[]>();
  let depth = 0, line = 1, col = 1;

  for (let i = 0; i < content.length; i++, col++) {
    const ch = content[i];

    if (ch === '\n') { line++; col = 0; continue; }

    const next = content[i + 1];
    if (ch === '$' && next === '{') { depth++; i++; col++; continue; }

    if (depth) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      continue;
    }

    if (ch === '`' && content[i - 1] !== '\\') {
      const arr = result.get(line) ?? [];
      arr.push(col);
      result.set(line, arr);
    }
  }

  return result;
};

/**
 * Formats a Rust-style error message for unescaped backticks in a file.
 */
export const formatBacktickError = (
  filePath: string,
  lineNumber: number,
  lineText: string,
  columns: number[]
): string => {
  const lines: string[] = [];
  const lineNumStr = String(lineNumber);
  const lineNumWidth = lineNumStr.length;
  const padding = ' '.repeat(lineNumWidth);

  // First and last column for truncation logic
  const firstColumn = columns[0];
  const lastColumn = columns[columns.length - 1];

  // Calculate truncation
  const maxPrefix = 30;
  const maxSuffix = 30;
  const prefixLen = firstColumn - 1;
  const suffixLen = lineText.length - lastColumn;

  let displayLine = lineText;
  let displayColumns = columns;
  let prefixTruncation = '';
  let suffixTruncation = '';
  let prefixTruncationLen = 0; // Visible length without ANSI codes

  if (prefixLen > maxPrefix || suffixLen > maxSuffix) {
    // Need to truncate
    let startIdx = 0;
    let endIdx = lineText.length;
    let colOffset = 0;

    if (prefixLen > maxPrefix) {
      const charsToSkip = prefixLen - maxPrefix;
      startIdx = charsToSkip;
      colOffset = -charsToSkip;
      const prefixText = `[${charsToSkip} chars] ...`;
      prefixTruncation = chalk.dim(prefixText);
      prefixTruncationLen = prefixText.length;
    }

    if (suffixLen > maxSuffix) {
      const charsToSkip = suffixLen - maxSuffix;
      endIdx = lineText.length - charsToSkip;
      suffixTruncation = chalk.dim(`... [${charsToSkip} chars]`);
    }

    displayLine = lineText.substring(startIdx, endIdx);
    displayColumns = columns.map(c => c + colOffset);
  }

  // Header: error message
  lines.push(
    `${chalk.red.bold('error')}${chalk.bold(': system prompt file contains unescaped backtick')}`
  );

  // File location (use original column number)
  lines.push(
    `${chalk.blue.bold(' '.repeat(lineNumWidth) + ' -->')} ${filePath}:${lineNumber}:${firstColumn}`
  );

  // Empty pipe line
  lines.push(`${padding} ${chalk.blue.bold('|')}`);

  // The actual line with line number (with truncation indicators)
  const fullDisplayLine = prefixTruncation + displayLine + suffixTruncation;
  lines.push(
    `${chalk.blue.bold(lineNumStr)} ${chalk.blue.bold('|')} ${fullDisplayLine}`
  );

  // Caret line pointing to first backtick (adjusted for prefix truncation text)
  const caretOffset = prefixTruncationLen + displayColumns[0] - 1;
  const caretLine = ' '.repeat(caretOffset) + '^' + ' unescaped backtick';
  lines.push(`${padding} ${chalk.blue.bold('|')} ${chalk.red.bold(caretLine)}`);

  // Empty pipe line before help
  lines.push(`${padding} ${chalk.blue.bold('|')}`);

  // Help message
  lines.push(
    `${chalk.cyan.bold('help')}: add \`\\\` before the backtick to escape it`
  );

  // Empty pipe line
  lines.push(`${padding} ${chalk.blue.bold('|')}`);

  // Fixed line with escaped backticks (using displayLine and displayColumns)
  // Build the line with green backslashes
  const fixedLineParts: string[] = [];
  let lastPos = 0;
  for (const col of displayColumns) {
    fixedLineParts.push(displayLine.substring(lastPos, col - 1));
    fixedLineParts.push(chalk.green('\\') + '`');
    lastPos = col; // Skip the original backtick
  }
  fixedLineParts.push(displayLine.substring(lastPos));

  const fullFixedLine =
    prefixTruncation + fixedLineParts.join('') + suffixTruncation;
  lines.push(
    `${chalk.blue.bold(lineNumStr)} ${chalk.blue.bold('|')} ${fullFixedLine}`
  );

  // Plus signs under the added backslashes only (adjusted for prefix truncation)
  let plusLine = '';
  let offset = 0;
  for (let i = 0; i < displayColumns.length; i++) {
    const col = displayColumns[i];
    const targetPos = prefixTruncationLen + col - 1 + offset;
    plusLine = plusLine.padEnd(targetPos, ' ') + '+';
    offset++; // Each added backslash shifts subsequent positions
  }

  lines.push(`${padding} ${chalk.blue.bold('|')} ${chalk.green(plusLine)}`);

  return lines.join('\n');
};

/**
 * Applies identifier mapping to convert human-readable names to actual minified variables.
 * Takes content with ${HUMAN_NAME} and converts to ${actualVar} using extracted variable names.
 *
 * The identifiers array tells us the order and label indices of captured variables.
 * For example:
 *   identifiers: [2, 0, 1] means:
 *     - extractedVars[0] maps to identifierMap["2"]
 *     - extractedVars[1] maps to identifierMap["0"]
 *     - extractedVars[2] maps to identifierMap["1"]
 */
const applyIdentifierMapping = (
  content: string,
  identifiers: (number | string)[],
  identifierMap: Record<string, string>,
  extractedVars: string[],
  ccVersion: string,
  escapeNonAscii = false
): string => {
  // Build reverse map: HUMAN_NAME -> actual minified var from cli.js
  const reverseMap: Record<string, string> = {};

  // Use identifiers array to map in correct order
  for (let i = 0; i < extractedVars.length; i++) {
    const capturedVar = extractedVars[i];
    const labelIndex = String(identifiers[i]);
    const humanName = identifierMap[labelIndex];

    if (humanName) {
      // Skip empty mappings
      reverseMap[humanName] = capturedVar;
    }
  }

  // Replace ${HUMAN_NAME} with ${actualVar} - sort by length descending to avoid partial replacements
  let result = content;
  const sortedEntries = Object.entries(reverseMap).sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [humanName, actualVar] of sortedEntries) {
    const pattern = new RegExp(`\\b${humanName}\\b`, 'g');
    result = result.replace(pattern, actualVar);
  }

  // Replace <<CCVERSION>> with the actual Claude Code version
  result = result.replace(/<<CCVERSION>>/g, ccVersion);

  // Escape non-ASCII characters if requested (for Bun native executables)
  if (escapeNonAscii) {
    result = escapeNonAsciiChars(result);
  }

  return result;
};

/**
 * Reads system prompts from dynamically downloaded strings-X.Y.Z.json to generate search regex,
 * and from ~/.tweakcc/system-prompts for replacement content.
 *
 * The workflow:
 * 1. Download strings-X.Y.Z.json (has pieces, identifiers, identifierMap)
 * 2. Build search regex from pieces array
 * 3. Match against cli.js to extract ACTUAL variable names
 * 4. Read corresponding .md file (has ${HUMAN_NAME} placeholders)
 * 5. Replace ${HUMAN_NAME} with actual vars from cli.js
 *
 * Returns empty array if strings file is not available (not preloaded or failed to download)
 */
export const loadSystemPromptsWithRegex = async (
  ccVersion: string,
  escapeNonAscii = false
): Promise<
  Array<{
    promptId: string;
    prompt: MarkdownPrompt;
    regex: string;
    getInterpolatedContent: (match: RegExpMatchArray) => string;
    pieces: string[];
    identifiers: (number | string)[];
    identifierMap: Record<string, string>;
  }>
> => {
  // Check if strings file was preloaded - if not, return empty array
  if (!globalStringsFile || globalCachedVersion !== ccVersion) {
    return [];
  }

  const stringsJson: StringsFile = globalStringsFile;

  const results: Array<{
    promptId: string;
    prompt: MarkdownPrompt;
    regex: string;
    getInterpolatedContent: (match: RegExpMatchArray) => string;
    pieces: string[];
    identifiers: (number | string)[];
    identifierMap: Record<string, string>;
  }> = [];

  // For each prompt in strings.json
  for (const jsonPrompt of stringsJson.prompts) {
    // Build the search regex from pieces array
    const regex = buildSearchRegexFromPieces(jsonPrompt.pieces, ccVersion);

    // Try to read the corresponding markdown file for REPLACEMENT content
    const mdPath = path.join(SYSTEM_PROMPTS_DIR, `${jsonPrompt.id}.md`);
    let markdown;
    try {
      markdown = await fs.readFile(mdPath, 'utf8');
    } catch (error) {
      console.error(`Failed to read markdown file ${mdPath}:`, error);
      continue;
    }
    const replacementPrompt = parseMarkdownPrompt(markdown);

    // Create a function that will apply identifier mapping when we have the match
    const getInterpolatedContent = (match: RegExpMatchArray): string => {
      // Extract captured variable names from the regex match (skip index 0 which is full match)
      const extractedVars = match.slice(1);

      // The markdown file has content with human-readable variable names
      // We need to replace those with the actual minified variable names from cli.js
      return applyIdentifierMapping(
        replacementPrompt.content,
        jsonPrompt.identifiers,
        jsonPrompt.identifierMap,
        extractedVars,
        ccVersion,
        escapeNonAscii
      );
    };

    results.push({
      promptId: jsonPrompt.id,
      prompt: replacementPrompt,
      regex,
      getInterpolatedContent,
      pieces: jsonPrompt.pieces,
      identifiers: jsonPrompt.identifiers,
      identifierMap: jsonPrompt.identifierMap,
    });
  }

  return results;
};

/**
 * Formats and displays sync results to the user
 */
export const displaySyncResults = (summary: SyncSummary): void => {
  const created = summary.results.filter(r => r.action === 'created');
  const updated = summary.results.filter(r => r.action === 'updated');
  const conflicts = summary.results.filter(r => r.action === 'conflict');
  const skipped = summary.results.filter(r => r.action === 'skipped');

  // Display skipped files (if any)
  if (
    (created.length > 0 || updated.length > 0 || conflicts.length > 0) &&
    skipped.length > 0
  ) {
    console.log(chalk.dim(`Skipped ${skipped.length} up-to-date file(s)`));
    console.log();
  }

  // Display created files
  if (created.length > 0) {
    console.log(
      chalk.bold.green(`Created ${created.length} new prompt file(s):`)
    );
    for (const result of created) {
      console.log(chalk.green(`  ${SYSTEM_PROMPTS_DIR}/${result.id}.md`));
      console.log(chalk.green.dim(`    ${result.description}`));
    }
    console.log();
  }

  // Display updated files
  if (updated.length > 0) {
    console.log(
      chalk.bold.blue(`Updated ${updated.length} system prompt file(s):`)
    );
    for (const result of updated) {
      if (result.oldVersion) {
        console.log(
          chalk.blue(
            `  ${result.id}.md  (${result.oldVersion} → ${result.newVersion})`
          )
        );
      } else {
        console.log(chalk.blue(`  ${result.id}.md  (→ ${result.newVersion})`));
      }
    }
    console.log();
  }

  // Display conflicts with warnings
  if (conflicts.length > 0) {
    console.log(
      chalk.bold.yellow(
        `WARNING: Conflicts detected for ${conflicts.length} system prompt file(s)`
      )
    );
    for (const result of conflicts) {
      console.log(
        chalk.yellow(
          ` ${result.id}.md (${result.oldVersion} → ${result.newVersion})`
        )
      );
      console.log(
        chalk.yellow(`   Open the diff in your browser: ${result.diffHtmlPath}`)
      );
    }
    console.log();
  }

  // Actionable next steps
  if (created.length > 0) {
    console.log(
      chalk.green.bold(
        `New prompt files have been created; either more are now supported by tweakcc or Anthropic has added new ones.`
      )
    );
    console.log(
      chalk.green(
        `You can now customize the markdown files at ${SYSTEM_PROMPTS_DIR} in a text editor.`
      )
    );
    console.log(
      chalk.green(
        `Then run tweakcc and select "apply" or use tweakcc --apply to update your system prompts`
      )
    );
    console.log();
  }

  if (conflicts.length > 0) {
    console.log();
    console.log(`Review conflicts:`);
    console.log(`  1. Open the diff HTML files in your browser`);
    console.log(`  2. Verify your customizations are still appropriate`);
    console.log(`  3. Update your markdown files if needed`);
    console.log(
      chalk.bold.cyan(
        `  4. Important: Update the ccVersion in your markdown files to the latest version of each prompt:`
      )
    );
    for (const result of conflicts) {
      console.log(
        chalk.yellow(`      ${result.id}.md → `) +
          chalk.bold.magenta(result.newVersion)
      );
    }
    console.log(`  5. Delete the diff HTML files`);
    console.log();
  }
};
