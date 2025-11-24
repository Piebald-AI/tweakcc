import chalk from 'chalk';
import { isDebug } from '../misc.js';
import { showDiff, PatchApplied } from './index.js';
import {
  loadSystemPromptsWithRegex,
  reconstructContentFromPieces,
  findUnescapedBackticks,
  formatBacktickError,
  getPromptFilePath,
} from '../promptSync.js';
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

  if (isDebug() && shouldEscapeNonAscii) {
    console.log(
      'Detected Unicode escaping in cli.js - will escape non-ASCII characters in prompts'
    );
  }

  // Load system prompts and generate regexes
  const systemPrompts = await loadSystemPromptsWithRegex(
    version,
    shouldEscapeNonAscii
  );
  if (isDebug()) {
    console.log(`Loaded ${systemPrompts.length} system prompts with regexes`);
  }

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
          const lineText = contentLines[lineNum - 1] || '';
          console.log(formatBacktickError(filePath, lineNum, lineText, columns));
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

      if (isDebug() && originalLength !== newLength) {
        console.log(`\n  Character count difference for ${prompt.name}:`);
        console.log(`    Original baseline: ${originalLength} chars`);
        console.log(`    User's version: ${newLength} chars`);
        console.log(`    Difference: ${originalLength - newLength} chars`);
        if (Math.abs(originalLength - newLength) < 200) {
          console.log(
            `\n    Original baseline content:\n${originalBaselineContent}`
          );
          console.log(`\n    User's content:\n${prompt.content}`);
        }
      }

      if (isDebug()) {
        console.log(`\nFound match for prompt: ${prompt.name}`);
        console.log(
          `  Match location: index ${match.index}, length ${match[0].length}`
        );
        console.log(
          `  Original content (first 100 chars): ${match[0].substring(0, 100)}...`
        );
        console.log(
          `  Replacement content (first 100 chars): ${interpolatedContent.substring(0, 100)}...`
        );
        console.log(`  Captured variables: ${match.slice(1).join(', ')}`);
        console.log(`  Content identical: ${match[0] === interpolatedContent}`);
      }

      const oldContent = content;
      const matchIndex = match.index;
      const matchLength = match[0].length;

      // Replace the matched content with the interpolated content from the markdown file
      content = content.replace(pattern, interpolatedContent);

      // Store the hash of the applied prompt content
      const appliedHash = computeMD5Hash(prompt.content);
      await setAppliedHash(promptId, appliedHash);

      // Show diff in debug mode
      if (isDebug()) {
        showDiff(
          oldContent,
          content,
          interpolatedContent,
          matchIndex,
          matchIndex + matchLength
        );
      }
    } else {
      console.log(
        chalk.yellow(
          `Could not find system prompt "${prompt.name}" in cli.js (using regex ${stringifyRegex(pattern)})`
        )
      );

      if (isDebug()) {
        console.log(`\n  Debug info for ${prompt.name}:`);
        console.log(
          `  Regex pattern (first 200 chars): ${regex.substring(0, 200)}...`
        );
        console.log(`  Trying to match pattern in cli.js...`);
        const testMatch = content.match(new RegExp(regex.substring(0, 100)));
        console.log(
          `  Partial match result: ${testMatch ? 'found partial' : 'no match'}`
        );
      }
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
