import chalk from 'chalk';
import { debug, warn, stringifyRegex, verbose } from '../utils';
import { showDiff, PatchResult, PatchGroup } from './index';
import {
  loadSystemPromptsWithRegex,
  reconstructContentFromPieces,
  findUnescapedBackticks,
  formatBacktickError,
  getPromptFilePath,
} from '../systemPromptSync';
import { setAppliedHash, computeMD5Hash } from '../systemPromptHashIndex';

/**
 * Result of applying system prompts
 */
export interface SystemPromptsResult {
  newContent: string;
  results: PatchResult[];
}

/**
 * Detects if the cli.js file uses Unicode escape sequences for non-ASCII characters.
 * This is common in Bun native executables.
 */
const detectUnicodeEscaping = (content: string): boolean => {
  // Look for Unicode escape sequences like \u2026 in string literals
  // We'll check for a pattern that suggests intentional escaping of common non-ASCII chars
  const unicodeEscapePattern = /\\u[0-9a-fA-F]{4}/;
  return unicodeEscapePattern.test(content);
};

/**
 * Extracts the BUILD_TIME value from cli.js content.
 * BUILD_TIME is an ISO 8601 timestamp like "2025-12-09T19:43:43Z"
 */
const extractBuildTime = (content: string): string | undefined => {
  const match = content.match(
    /\bBUILD_TIME:"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)"/
  );
  return match ? match[1] : undefined;
};

/**
 * Apply system prompt customizations to cli.js content
 * @param content - The current content of cli.js
 * @param version - The Claude Code version
 * @param escapeNonAscii - Whether to escape non-ASCII characters (auto-detected if not specified)
 * @param patchFilter - Optional list of patch/prompt IDs to apply (if provided, only matching prompts are applied)
 * @returns SystemPromptsResult with modified content and per-prompt results
 */
export const applySystemPrompts = async (
  content: string,
  version: string,
  escapeNonAscii?: boolean,
  patchFilter?: string[] | null
): Promise<SystemPromptsResult> => {
  // Auto-detect if we should escape non-ASCII characters based on cli.js content
  const shouldEscapeNonAscii = escapeNonAscii ?? detectUnicodeEscaping(content);

  if (shouldEscapeNonAscii) {
    debug(
      'Detected Unicode escaping in cli.js - will escape non-ASCII characters in prompts'
    );
  }

  // Extract BUILD_TIME from cli.js content
  const buildTime = extractBuildTime(content);
  if (buildTime) {
    debug(`Extracted BUILD_TIME from cli.js: ${buildTime}`);
  }

  // Load system prompts and generate regexes
  const systemPrompts = await loadSystemPromptsWithRegex(
    version,
    shouldEscapeNonAscii,
    buildTime
  );
  debug(`Loaded ${systemPrompts.length} system prompts with regexes`);

  // Track per-prompt results
  const results: PatchResult[] = [];

  // Search for and replace each prompt in cli.js
  for (const {
    promptId,
    prompt,
    regex,
    getInterpolatedContent,
    pieces,
    identifiers,
    identifierMap,
  } of systemPrompts) {
    // Skip prompts not in the filter (if filter is provided)
    if (patchFilter && !patchFilter.includes(promptId)) {
      results.push({
        id: promptId,
        name: prompt.name,
        group: PatchGroup.SYSTEM_PROMPTS,
        applied: false,
        skipped: true,
      });
      continue;
    }

    debug(`Applying system prompt: ${prompt.name}`);
    const pattern = new RegExp(regex, 'si'); // 's' flag for dotAll mode, 'i' because of casing inconsistencies in unicode escape sequences (e.g. `\u201c` in the regex vs `\u201C` in the file)
    const match = content.match(pattern);

    if (match && match.index !== undefined) {
      // Generate the interpolated content using the actual variables from the match
      const interpolatedContent = getInterpolatedContent(match);

      // Check the delimiter character before the match to determine string type
      const matchIndex = match.index;
      const delimiter = matchIndex > 0 ? content[matchIndex - 1] : '';

      // Only check for unescaped backticks if the original uses template literals
      // String literals (single/double quotes) don't need backticks escaped
      if (delimiter === '`') {
        const unescapedBackticks = findUnescapedBackticks(interpolatedContent);
        if (unescapedBackticks.size > 0) {
          const filePath = getPromptFilePath(promptId);
          const contentLines = prompt.content.split('\n');

          for (const [lineNum, columns] of unescapedBackticks) {
            // lineNum is relative to prompt.content; adjust to absolute file line
            // number by accounting for any frontmatter/comment lines.
            const absoluteLineNum = lineNum + (prompt.contentLineOffset || 0);
            const lineText = contentLines[lineNum - 1] || '';
            warn(
              formatBacktickError(filePath, absoluteLineNum, lineText, columns)
            );
            warn('');
          }

          continue; // Skip this prompt
        }
      }

      // Calculate character counts for this prompt (both with human-readable placeholders)
      // Note: trim() to match how markdown files are parsed and how whitespace is applied
      const originalBaselineContent = reconstructContentFromPieces(
        pieces,
        identifiers,
        identifierMap
      ).trim();
      const originalLength = originalBaselineContent.length;
      const newLength = prompt.content.trim().length;

      const oldContent = content;
      const matchLength = match[0].length;

      // delimiter was already determined above for backtick check
      let replacementContent = interpolatedContent;

      // If it's a string literal (double or single quote), convert actual newlines to \n
      // and escape the delimiter character. Template literals can have actual newlines.
      if (delimiter === '"') {
        replacementContent = replacementContent.replace(/\n/g, '\\n');
        replacementContent = replacementContent.replace(/"/g, '\\"');
      } else if (delimiter === "'") {
        replacementContent = replacementContent.replace(/\n/g, '\\n');
        replacementContent = replacementContent.replace(/'/g, "\\'");
      }

      // Replace the matched content with the interpolated content from the markdown file
      // Use a replacer function to avoid special replacement pattern interpretation (e.g., $$ -> $), see #237
      content = content.replace(pattern, () => replacementContent);

      // Store the hash of the applied prompt content
      const appliedHash = computeMD5Hash(prompt.content);
      await setAppliedHash(promptId, appliedHash);

      // Show diff in debug mode
      showDiff(
        oldContent,
        content,
        replacementContent,
        matchIndex,
        matchIndex + matchLength
      );

      // Track this prompt's result
      const charDiff = originalLength - newLength;
      const applied = charDiff !== 0;

      let details: string;
      if (charDiff > 0) {
        details = chalk.green(`${charDiff} fewer chars`);
      } else if (charDiff < 0) {
        details = chalk.red(`${Math.abs(charDiff)} more chars`);
      } else {
        details = 'unchanged';
      }

      results.push({
        id: promptId,
        name: prompt.name,
        group: PatchGroup.SYSTEM_PROMPTS,
        applied,
        details,
      });
    } else {
      debug(
        chalk.yellow(
          `Could not find system prompt "${prompt.name}" in cli.js (using regex ${stringifyRegex(pattern)})`
        )
      );

      verbose(`\n  Debug info for ${prompt.name}:`);
      verbose(
        `  Regex pattern (first 200 chars): ${regex.substring(0, 200).replace(/\n/g, '\\n')}...`
      );
      verbose(`  Trying to match pattern in cli.js...`);
      try {
        const testMatch = content.match(new RegExp(regex.substring(0, 100)));
        verbose(
          `  Partial match result: ${testMatch ? 'found partial' : 'no match'}`
        );
      } catch {
        verbose(`  Partial match failed (regex truncation issue)`);
      }
    }
  }

  return {
    newContent: content,
    results,
  };
};
