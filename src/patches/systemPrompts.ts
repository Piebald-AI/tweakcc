import chalk from 'chalk';
import { debug } from '../utils.js';
import { showDiff, PatchApplied } from './index.js';
import {
  loadSystemPromptsWithRegex,
  reconstructContentFromPieces,
  findUnescapedBackticks,
  formatBacktickError,
  getPromptFilePath,
} from '../systemPromptSync.js';
import { setAppliedHash, computeMD5Hash } from '../systemPromptHashIndex.js';

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

const stringifyRegex = (regex: RegExp): string => {
  const str = regex.toString();
  const pattern = JSON.stringify(str.substring(1, str.length - 1));
  const flags = JSON.stringify(str.match(/\/(\w*)$/)![1]);
  return `new RegExp(${pattern}, ${flags})`;
};

/**
 * Apply system prompt customizations to cli.js content
 * @param content - The current content of cli.js
 * @param version - The Claude Code version
 * @param escapeNonAscii - Whether to escape non-ASCII characters (auto-detected if not specified)
 * @returns PatchApplied object with modified content and items for display
 */
export const applySystemPrompts = async (
  content: string,
  version: string,
  escapeNonAscii?: boolean
): Promise<PatchApplied> => {
  // Auto-detect if we should escape non-ASCII characters based on cli.js content
  const shouldEscapeNonAscii = escapeNonAscii ?? detectUnicodeEscaping(content);

  if (shouldEscapeNonAscii) {
    debug(
      'Detected Unicode escaping in cli.js - will escape non-ASCII characters in prompts'
    );
  }

  // Load system prompts and generate regexes
  const systemPrompts = await loadSystemPromptsWithRegex(
    version,
    shouldEscapeNonAscii
  );
  debug(`Loaded ${systemPrompts.length} system prompts with regexes`);

  let totalOriginalChars = 0;
  let totalNewChars = 0;

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
    const pattern = new RegExp(regex, 'si'); // 's' flag for dotAll mode, 'i' because of casing inconsistencies in unicode escape sequences (e.g. `\u201c` in the regex vs `\u201C` in the file)
    const match = content.match(pattern);

    if (match && match.index !== undefined) {
      // Generate the interpolated content using the actual variables from the match
      const interpolatedContent = getInterpolatedContent(match);

      // Check for unescaped backticks that would break the template literal
      const unescapedBackticks = findUnescapedBackticks(interpolatedContent);
      if (unescapedBackticks.size > 0) {
        const filePath = getPromptFilePath(promptId);
        const contentLines = prompt.content.split('\n');

        for (const [lineNum, columns] of unescapedBackticks) {
          // lineNum is relative to prompt.content; adjust to absolute file line
          // number by accounting for any frontmatter/comment lines.
          const absoluteLineNum = lineNum + (prompt.contentLineOffset || 0);
          const lineText = contentLines[lineNum - 1] || '';
          console.log(
            formatBacktickError(filePath, absoluteLineNum, lineText, columns)
          );
          console.log();
        }

        continue; // Skip this prompt
      }

      // Calculate character counts for this prompt (both with human-readable placeholders)
      // Note: trim() to match how markdown files are parsed (parsed.content.trim() in parseMarkdownPrompt)
      const originalBaselineContent = reconstructContentFromPieces(
        pieces,
        identifiers,
        identifierMap
      ).trim();
      const originalLength = originalBaselineContent.length;
      const newLength = prompt.content.length;
      totalOriginalChars += originalLength;
      totalNewChars += newLength;

      if (originalLength !== newLength) {
        debug(`\n  Character count difference for ${prompt.name}:`);
        debug(`    Original baseline: ${originalLength} chars`);
        debug(`    User's version: ${newLength} chars`);
        debug(`    Difference: ${originalLength - newLength} chars`);
        if (Math.abs(originalLength - newLength) < 200) {
          debug(`\n    Original baseline content:\n${originalBaselineContent}`);
          debug(`\n    User's content:\n${prompt.content}`);
        }
      }

      debug(`\nFound match for prompt: ${prompt.name}`);
      debug(
        `  Match location: index ${match.index}, length ${match[0].length}`
      );
      debug(
        `  Original content (first 100 chars): ${match[0].substring(0, 100)}...`
      );
      debug(
        `  Replacement content (first 100 chars): ${interpolatedContent.substring(0, 100)}...`
      );
      debug(`  Captured variables: ${match.slice(1).join(', ')}`);
      debug(`  Content identical: ${match[0] === interpolatedContent}`);

      const oldContent = content;
      const matchIndex = match.index;
      const matchLength = match[0].length;

      // Replace the matched content with the interpolated content from the markdown file
      // Use a replacer function to avoid special replacement pattern interpretation (e.g., $$ -> $), see #237
      content = content.replace(pattern, () => interpolatedContent);

      // Store the hash of the applied prompt content
      const appliedHash = computeMD5Hash(prompt.content);
      await setAppliedHash(promptId, appliedHash);

      // Show diff in debug mode
      showDiff(
        oldContent,
        content,
        interpolatedContent,
        matchIndex,
        matchIndex + matchLength
      );
    } else {
      console.log(
        chalk.yellow(
          `Could not find system prompt "${prompt.name}" in cli.js (using regex ${stringifyRegex(pattern)})`
        )
      );

      debug(`\n  Debug info for ${prompt.name}:`);
      debug(`  Regex pattern (first 200 chars): ${regex.substring(0, 200)}...`);
      debug(`  Trying to match pattern in cli.js...`);
      const testMatch = content.match(new RegExp(regex.substring(0, 100)));
      debug(
        `  Partial match result: ${testMatch ? 'found partial' : 'no match'}`
      );
    }
  }

  // Calculate character savings
  const items: string[] = [];
  const charDiff = totalOriginalChars - totalNewChars;
  if (charDiff > 0) {
    items.push(
      `system prompts: \${CHALK_VAR.green('${charDiff} fewer chars')} than original`
    );
  } else if (charDiff < 0) {
    items.push(
      `system prompts: \${CHALK_VAR.red('${Math.abs(charDiff)} more chars')} than original`
    );
  }

  return {
    newContent: content,
    items,
  };
};
