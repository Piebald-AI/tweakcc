import chalk from 'chalk';
import { debug, stringifyRegex, verbose } from '../utils';
import { showDiff, PatchResult, PatchGroup } from './index';
import {
  loadSystemPromptsWithRegex,
  reconstructContentFromPieces,
  escapeDepthZeroBackticks,
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
 * Collects the ALL-CAPS identifier tokens used inside `${...}` interpolations of
 * a string. Escaped interpolations (`\${...}`) are inert (even in a backtick
 * literal) and skipped; only ALL-CAPS tokens are collected because Claude Code's
 * minified variables are lowercase while its prompt identifiers are ALL-CAPS, so
 * ordinary lowercase code and method names inside an interpolation are ignored.
 */
const capsTokensInInterpolations = (s: string): Set<string> => {
  const found = new Set<string>();
  const capsToken = /\b[A-Z][A-Z0-9_]*\b/g;

  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === '$' && s[i + 1] === '{') {
      // Skip escaped interpolations (\${...}); inert even in a backtick literal.
      let backslashes = 0;
      let k = i - 1;
      while (k >= 0 && s[k] === '\\') {
        backslashes++;
        k--;
      }
      if (backslashes % 2 === 1) continue;

      // Walk to the matching close brace, tracking nested braces.
      let depth = 1;
      let j = i + 2;
      const start = j;
      while (j < s.length && depth > 0) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
        j++;
      }
      for (const m of s.slice(start, j - 1).matchAll(capsToken))
        found.add(m[0]);
      i = j - 1;
    }
  }

  return found;
};

/**
 * Detects identifiers a prompt's interpolated replacement would introduce into a
 * live `${...}` interpolation that the original matched bundle text never
 * defined.
 *
 * This catches a stale prompt .md whose interpolation identifier was renamed
 * upstream without a per-prompt version bump (#899): applyIdentifierMapping
 * leaves the old human-name unmapped, so the replacement references a variable
 * that does not exist. That is a runtime ReferenceError which `node --check`
 * cannot catch (it parses fine) and which crashes Claude Code on the first turn
 * (#900).
 *
 * Callers must invoke this only for backtick-delimited prompts, where `${...}`
 * is real interpolation; in quoted/JSON string literals `${...}` is inert text.
 * Interpolation-identifier sets are compared like-for-like, so a name that also
 * appears in the prompt's ALL-CAPS prose (e.g. a "## TOOLS" heading) does not
 * mask a genuinely drifted `${TOOLS}` interpolation.
 */
const findIntroducedInterpolationIdentifiers = (
  replacement: string,
  originalMatch: string
): string[] => {
  const inMatch = capsTokensInInterpolations(originalMatch);
  return [...capsTokensInInterpolations(replacement)].filter(
    tok => !inMatch.has(tok)
  );
};

const escapeUnescapedChar = (str: string, char: string): string => {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    if (str[i] === char) {
      let bs = 0;
      let j = i - 1;
      while (j >= 0 && str[j] === '\\') {
        bs++;
        j--;
      }
      if (bs % 2 === 0) {
        result += '\\' + char;
      } else {
        result += char;
      }
    } else {
      result += str[i];
    }
  }
  return result;
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
    // 's' = dotAll; 'i' for hex-case differences in unicode escapes. Guard regex
    // construction + match: an oversized pattern (e.g. the Model Migration Guide) can
    // overflow V8's regex stack on Node <=22 and abort the whole --apply (#753).
    let pattern: RegExp;
    let match: RegExpMatchArray | null;
    try {
      pattern = new RegExp(regex, 'si');
      match = content.match(pattern);
    } catch (error) {
      console.log(
        chalk.yellow(
          `Skipped "${prompt.name}": regex too complex to compile (${
            error instanceof Error ? error.message : String(error)
          })`
        )
      );
      results.push({
        id: promptId,
        name: prompt.name,
        group: PatchGroup.SYSTEM_PROMPTS,
        applied: false,
        details: 'regex too complex',
      });
      continue;
    }

    if (match && match.index !== undefined) {
      // Generate the interpolated content using the actual variables from the match
      const interpolatedContent = getInterpolatedContent(match);

      // Check the delimiter character before the match to determine string type
      const matchIndex = match.index;
      const delimiter = matchIndex > 0 ? content[matchIndex - 1] : '';

      // For backtick-delimited prompts, `${...}` is live interpolation. A stale
      // .md (identifier renamed upstream without a version bump, #899) leaves an
      // old human-name unmapped in applyIdentifierMapping, so the replacement
      // references a variable the bundle never defines; writing it would throw
      // ReferenceError at runtime, which node --check cannot catch (#900). Skip
      // the prompt rather than corrupt cli.js. Quoted/JSON prompts are inert
      // here and are left to the escaping paths below.
      if (delimiter === '`') {
        const introduced = findIntroducedInterpolationIdentifiers(
          interpolatedContent,
          match[0]
        );
        if (introduced.length > 0) {
          console.log(
            chalk.yellow(
              `Skipped "${prompt.name}": replacement references ${introduced.join(
                ', '
              )} not found in cli.js (stale prompt file — re-sync it, e.g. delete the prompt's .md in your system-prompts directory and re-run --apply)`
            )
          );
          results.push({
            id: promptId,
            name: prompt.name,
            group: PatchGroup.SYSTEM_PROMPTS,
            applied: false,
            details: `stale identifier: ${introduced.join(', ')}`,
          });
          continue;
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

      let replacementContent = interpolatedContent;

      if (delimiter === '"' || delimiter === "'") {
        replacementContent = replacementContent.replace(/\\/g, '\\\\');
      }

      if (delimiter === '"') {
        replacementContent = replacementContent.replace(/\n/g, '\\n');
        replacementContent = replacementContent.replace(/\r/g, '\\r');
        replacementContent = escapeUnescapedChar(replacementContent, '"');
      } else if (delimiter === "'") {
        replacementContent = replacementContent.replace(/\n/g, '\\n');
        replacementContent = replacementContent.replace(/\r/g, '\\r');
        replacementContent = escapeUnescapedChar(replacementContent, "'");
      } else if (delimiter === '`') {
        const { content: escaped, incomplete } =
          escapeDepthZeroBackticks(replacementContent);
        if (incomplete) {
          console.log(
            chalk.red(
              `Incomplete backtick escaping for "${prompt.name}" (unclosed interpolation) - skipping`
            )
          );
          results.push({
            id: promptId,
            name: prompt.name,
            group: PatchGroup.SYSTEM_PROMPTS,
            applied: false,
            details: 'incomplete escaping: unclosed interpolation detected',
          });
          continue;
        }
        if (escaped !== replacementContent) {
          console.log(
            chalk.yellow(`Auto-escaped unescaped backticks in "${prompt.name}"`)
          );
        }
        replacementContent = escaped;
      }

      // Replace the matched content with the interpolated content from the markdown file
      // Use a replacer function to avoid special replacement pattern interpretation (e.g., $$ -> $), see #237
      content = content.replace(pattern, () => replacementContent);

      // Store the hash of the applied prompt content
      const appliedHash = computeMD5Hash(prompt.content);
      let hashFailed = false;
      try {
        await setAppliedHash(promptId, appliedHash);
      } catch (error) {
        debug(`Failed to store hash for "${prompt.name}": ${error}`);
        hashFailed = true;
      }

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
      const applied = oldContent !== content;

      let details: string;
      if (charDiff > 0) {
        details = chalk.green(`${charDiff} fewer chars`);
      } else if (charDiff < 0) {
        details = chalk.red(`${Math.abs(charDiff)} more chars`);
      } else {
        details = 'unchanged';
      }

      if (hashFailed) {
        details += ' (hash storage failed)';
      }

      results.push({
        id: promptId,
        name: prompt.name,
        group: PatchGroup.SYSTEM_PROMPTS,
        applied,
        ...(hashFailed && { failed: true }),
        details,
      });
    } else {
      // Temporarily skip patching these prompts because they're markdown in the npm install but HTML in the native.
      if (
        !prompt.name.startsWith('Data:') &&
        prompt.name !== 'Skill: Build with Claude API'
      ) {
        console.log(
          chalk.yellow(
            `Could not find system prompt "${prompt.name}" in cli.js (using regex ${stringifyRegex(pattern)})`
          )
        );
      }

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
