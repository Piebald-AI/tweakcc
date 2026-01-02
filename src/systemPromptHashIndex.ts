import * as fs from 'node:fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { StringsFile, reconstructContentFromPieces } from './systemPromptSync';
import { CONFIG_DIR } from './config';

/**
 * Gets the path to the system prompt hash index file
 */
const getHashIndexPath = (): string => {
  return path.join(CONFIG_DIR, 'systemPromptOriginalHashes.json');
};

/**
 * Gets the path to the system prompt applied hashes file
 * This tracks which hash was last applied to cli.js for each prompt
 */
const getAppliedHashesPath = (): string => {
  return path.join(CONFIG_DIR, 'systemPromptAppliedHashes.json');
};

/**
 * Structure of the hash index
 * Maps: "prompt-id-version" => "md5hash"
 * Example: "main-system-prompt-2.0.14" => "a1b2c3..."
 */
export interface HashIndex {
  [key: string]: string;
}

/**
 * Generates a hash key for a prompt
 * Format: "{promptId}-{version}"
 */
export const getHashKey = (promptId: string, version: string): string => {
  return `${promptId}-${version}`;
};

/**
 * Computes the MD5 hash of a string (after trimming leading/trailing whitespace)
 */
export const computeMD5Hash = (content: string): string => {
  return crypto.createHash('md5').update(content.trim(), 'utf8').digest('hex');
};

/**
 * Reads the hash index from disk. Returns empty object if file doesn't exist.
 */
export const readHashIndex = async (): Promise<HashIndex> => {
  try {
    const content = await fs.readFile(getHashIndexPath(), 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
};

/**
 * Writes the hash index to disk
 */
export const writeHashIndex = async (index: HashIndex): Promise<void> => {
  // Ensure config directory exists
  await fs.mkdir(CONFIG_DIR, { recursive: true });

  // Sort keys for consistent formatting
  const sortedIndex: HashIndex = {};
  const sortedKeys = Object.keys(index).sort();
  for (const key of sortedKeys) {
    sortedIndex[key] = index[key];
  }

  await fs.writeFile(
    getHashIndexPath(),
    JSON.stringify(sortedIndex, null, 2),
    'utf8'
  );
};

/**
 * Main utility function: Takes the entire contents of a strings-x.y.z.json file
 * and inserts all the hashes that aren't already in the index.
 *
 * @param stringsFile - The parsed strings file (from downloadStringsFile or similar)
 * @returns The number of new hashes added
 */
export const storeHashes = async (
  stringsFile: StringsFile
): Promise<number> => {
  const index = await readHashIndex();
  let newHashCount = 0;

  for (const prompt of stringsFile.prompts) {
    const hashKey = getHashKey(prompt.id, prompt.version);

    // Only compute and store if not already present
    if (!index[hashKey]) {
      const content = reconstructContentFromPieces(
        prompt.pieces,
        prompt.identifiers,
        prompt.identifierMap
      );
      const hash = computeMD5Hash(content);
      index[hashKey] = hash;
      newHashCount++;
    }
  }

  // Write back to disk
  await writeHashIndex(index);

  return newHashCount;
};

/**
 * Gets the hash for a specific prompt version from the index
 * Returns undefined if not found
 */
export const getPromptHash = async (
  promptId: string,
  version: string
): Promise<string | undefined> => {
  const index = await readHashIndex();
  const hashKey = getHashKey(promptId, version);
  return index[hashKey];
};

/**
 * Checks if a markdown file's content (excluding frontmatter) matches the expected hash
 *
 * @param markdownContent - The full content of a markdown file with frontmatter
 * @param expectedHash - The expected MD5 hash
 * @returns true if the content matches the hash (unmodified), false otherwise
 */
export const verifyMarkdownHash = (
  markdownContent: string,
  expectedHash: string
): boolean => {
  // Extract content after frontmatter
  const frontmatterMatch = markdownContent.match(
    /^---\n[\s\S]+?\n---\n([\s\S]*)$/
  );

  if (!frontmatterMatch) {
    // No frontmatter found - hash the entire content
    const hash = computeMD5Hash(markdownContent.trim());
    return hash === expectedHash;
  }

  // Hash only the content part (after frontmatter), trimmed
  const contentOnly = frontmatterMatch[1].trim();
  const hash = computeMD5Hash(contentOnly);
  return hash === expectedHash;
};

/**
 * Structure of the applied hashes file
 * Maps: "prompt-id" => "md5hash" | null
 * Example: "main-system-prompt" => "a1b2c3..." or null if not applied/defaults restored
 */
export interface AppliedHashIndex {
  [promptId: string]: string | null;
}

/**
 * Reads the applied hashes index from disk. Returns empty object if file doesn't exist.
 */
export const readAppliedHashIndex = async (): Promise<AppliedHashIndex> => {
  try {
    const content = await fs.readFile(getAppliedHashesPath(), 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
};

/**
 * Writes the applied hashes index to disk
 */
export const writeAppliedHashIndex = async (
  index: AppliedHashIndex
): Promise<void> => {
  // Ensure config directory exists
  await fs.mkdir(CONFIG_DIR, { recursive: true });

  // Sort keys for consistent formatting
  const sortedIndex: AppliedHashIndex = {};
  const sortedKeys = Object.keys(index).sort();
  for (const key of sortedKeys) {
    sortedIndex[key] = index[key];
  }

  await fs.writeFile(
    getAppliedHashesPath(),
    JSON.stringify(sortedIndex, null, 2),
    'utf8'
  );
};

/**
 * Updates the applied hash for a specific prompt ID
 */
export const setAppliedHash = async (
  promptId: string,
  hash: string
): Promise<void> => {
  const index = await readAppliedHashIndex();
  index[promptId] = hash;
  await writeAppliedHashIndex(index);
};

/**
 * Sets all applied hashes to null (used when restoring defaults)
 */
export const clearAllAppliedHashes = async (): Promise<void> => {
  const index = await readAppliedHashIndex();
  const clearedIndex: AppliedHashIndex = {};

  // Set all existing entries to null
  for (const key of Object.keys(index)) {
    clearedIndex[key] = null;
  }

  await writeAppliedHashIndex(clearedIndex);
};

/**
 * Gets the applied hash for a specific prompt ID
 * Returns undefined if not found, null if explicitly set to null
 */
export const getAppliedHash = async (
  promptId: string
): Promise<string | null | undefined> => {
  const index = await readAppliedHashIndex();
  return index[promptId];
};

/**
 * Checks if any system prompts have been modified since they were last applied.
 * Compares the current hash of each prompt file with the hash stored in systemPromptAppliedHashes.json.
 *
 * @param systemPromptsDir - Path to the system prompts directory
 * @returns true if any prompts have been modified, false otherwise
 */
export const hasUnappliedSystemPromptChanges = async (
  systemPromptsDir: string
): Promise<boolean> => {
  try {
    const appliedHashes = await readAppliedHashIndex();

    // If there are no applied hashes yet, nothing has been applied so no changes to track
    if (Object.keys(appliedHashes).length === 0) {
      return false;
    }

    // Read all .md files in the system prompts directory
    const files = await fs.readdir(systemPromptsDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    for (const file of mdFiles) {
      const promptId = file.replace('.md', '');
      const appliedHash = appliedHashes[promptId];

      // If this prompt doesn't have an applied hash entry, skip it
      if (appliedHash === undefined) {
        continue;
      }

      // If the applied hash is null (restored to defaults), skip comparison
      if (appliedHash === null) {
        continue;
      }

      // Read the current file and compute its hash
      const filePath = path.join(systemPromptsDir, file);
      const fileContent = await fs.readFile(filePath, 'utf8');

      // Parse the markdown to extract just the content (excluding frontmatter)
      const matter = await import('gray-matter');
      const parsed = matter.default(fileContent, {
        delimiters: ['<!--', '-->'],
      });
      const currentHash = computeMD5Hash(parsed.content);

      // If the current hash doesn't match the applied hash, changes have been made
      if (currentHash !== appliedHash) {
        return true;
      }
    }

    return false;
  } catch (error) {
    // If we can't read the directory or files, assume no changes
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};
