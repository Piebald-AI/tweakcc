import chalk from 'chalk';
import type { StringsFile } from './promptSync.js';

/**
 * Downloads the strings file for a given CC version from GitHub
 * @param version - Version string in format "X.Y.Z" (e.g., "0.17.0")
 * @returns Promise that resolves to the parsed JSON content
 */
export async function downloadStringsFile(
  version: string
): Promise<StringsFile> {
  // Construct the GitHub raw URL
  const url = `https://raw.githubusercontent.com/Piebald-AI/tweakcc/refs/heads/main/data/prompts/prompts-${version}.json`;

  try {
    // Fetch the file from GitHub
    const response = await fetch(url);

    if (!response.ok) {
      // Provide specific error messages for common HTTP errors
      let errorMessage: string;
      if (response.status === 429) {
        errorMessage =
          'Rate limit exceeded. GitHub has temporarily blocked requests. Please wait a few minutes and try again.';
      } else if (response.status === 404) {
        errorMessage = `Prompts file not found for Claude Code v${version}. This version was released within the past day or so and will be supported within a few hours.`;
      } else if (response.status >= 500) {
        errorMessage = `GitHub server error (${response.status}). Please try again later.`;
      } else {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }

      // Display the error in red immediately
      console.log(chalk.red('\n✖ Error downloading system prompts:'));
      console.log(chalk.red(`  ${errorMessage}`));

      throw new Error(errorMessage);
    }

    // Parse JSON directly
    const jsonData = (await response.json()) as StringsFile;

    return jsonData;
  } catch (error) {
    if (error instanceof Error) {
      // If it's already our custom error with the message displayed, re-throw it
      if (
        error.message.includes('Rate limit') ||
        error.message.includes('not found') ||
        error.message.includes('server error') ||
        error.message.includes('HTTP')
      ) {
        throw error;
      }
      // Otherwise wrap it and display
      const wrappedMessage = `Failed to download prompts for version ${version}: ${error.message}`;
      console.log(chalk.red('\n✖ Error downloading system prompts:'));
      console.log(chalk.red(`  ${wrappedMessage}`));
      throw new Error(wrappedMessage);
    }
    throw error;
  }
}

/**
 * Downloads strings files for multiple versions
 * @param versions - Array of version strings
 * @returns Promise that resolves to a map of version to parsed JSON content
 */
export async function downloadMultipleStringsFiles(
  versions: string[]
): Promise<Map<string, StringsFile>> {
  const results = new Map<string, StringsFile>();

  for (const version of versions) {
    try {
      const data = await downloadStringsFile(version);
      results.set(version, data);
    } catch (error) {
      console.error(`Failed to download version ${version}:`, error);
      // Continue with other versions
    }
  }

  return results;
}
