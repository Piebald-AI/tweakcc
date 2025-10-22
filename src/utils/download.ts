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
  //const url = `https://raw.githubusercontent.com/Piebald-AI/tweakcc/refs/heads/main/data/prompts/prompts-${version}.json`;
  const url = `https://raw.githubusercontent.com/Piebald-AI/tweakcc/refs/heads/strings-tmp/strings-${version}.json`;

  try {
    // Fetch the file from GitHub
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to download strings file: ${response.status} ${response.statusText}`
      );
    }

    // Parse JSON directly
    const jsonData = (await response.json()) as StringsFile;

    return jsonData;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Error downloading strings file for version ${version}: ${error.message}`
      );
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
