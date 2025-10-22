import chalk from 'chalk';
import { isDebug } from '../misc.js';
import { showDiff } from './index.js';
import { loadSystemPromptsWithRegex } from '../promptSync.js';
import { setAppliedHash, computeMD5Hash } from '../systemPromptHashIndex.js';

/**
 * Apply system prompt customizations to cli.js content
 * @param content - The current content of cli.js
 * @param version - The Claude Code version
 * @returns The modified content with system prompts applied
 */
export const applySystemPrompts = async (
  content: string,
  version: string
): Promise<string> => {
  // Load system prompts and generate regexes
  const systemPrompts = await loadSystemPromptsWithRegex(version);
  if (isDebug()) {
    console.log(`Loaded ${systemPrompts.length} system prompts with regexes`);
  }

  // Search for and replace each prompt in cli.js
  for (const {
    promptId,
    prompt,
    regex,
    getInterpolatedContent,
  } of systemPrompts) {
    const pattern = new RegExp(regex, 's'); // 's' flag for dotAll mode
    const match = content.match(pattern);

    if (match && match.index !== undefined) {
      // Generate the interpolated content using the actual variables from the match
      const interpolatedContent = getInterpolatedContent(match);

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
          `Could not find system prompt "${prompt.name}" in cli.js (using regex /${regex}/)`
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

  return content;
};
