import chalk from 'chalk';
import { debug, stringifyRegex, verbose } from '../utils';
import { showDiff, PatchResult, PatchGroup } from './index';
import {
  loadSystemPromptsWithRegex,
  reconstructContentFromPieces,
  escapeDepthZeroBackticks,
  escapeNonAsciiChars,
  interpolationReferences,
} from '../systemPromptSync';
import { setAppliedHash, computeMD5Hash } from '../systemPromptHashIndex';

/**
 * Result of applying system prompts
 */
export interface SystemPromptsResult {
  /** The patched source (first source when several were given). */
  newContent: string;
  /** Every patched source, in the order given. */
  newContents: string[];
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
 * Detects identifiers a prompt's interpolated replacement would introduce into a
 * live `${...}` interpolation that the original matched bundle text never
 * referenced, and that are not JavaScript globals.
 *
 * Such a name is a runtime ReferenceError when Claude Code builds the prompt.
 * `node --check` cannot see it (it parses fine), and Claude Code then fails
 * every turn: the input looks blocked and nothing is sent (#872, `oops is not
 * defined`). It arises from a typo in an edited interpolation, or from a stale
 * prompt .md whose interpolation identifier was renamed upstream without a
 * per-prompt version bump (#899): applyIdentifierMapping leaves the old
 * human-name unmapped (#900).
 *
 * Callers must invoke this only for backtick-delimited prompts, where `${...}`
 * is real interpolation; in quoted/JSON string literals `${...}` is inert text.
 * Only interpolation code is compared, so a name that also appears in the
 * prompt's prose (e.g. a "## TOOLS" heading) does not mask a genuinely drifted
 * `${TOOLS}` interpolation.
 */
const findIntroducedInterpolationIdentifiers = (
  replacement: string,
  originalMatch: string
): string[] => {
  const inMatch = interpolationReferences(originalMatch);
  return [...interpolationReferences(replacement)].filter(
    name => !inMatch.has(name) && !(name in globalThis)
  );
};

/**
 * Prepares a prompt's markdown for a quoted string literal by doubling the
 * backslashes that are the user's literal text.
 *
 * The markdown shows `\\`, and any `\"` or `\'` that sits inside an
 * interpolation, in JavaScript source form, because that is how a template
 * literal prompt needs them written back (#870). They mean the same in a quoted
 * prompt, so those pairs are kept as they are: doubling them too shipped
 * `use A\\Client` to Claude Code where the bundle had `use A\Client`, for
 * every quoted prompt the user had edited (#922).
 */
const escapeLiteralBackslashes = (str: string): string =>
  str.replace(/\\([\\"'])|\\/g, (pair, escaped?: string) =>
    escaped ? pair : '\\\\'
  );

/**
 * Whether `body` compiles as a string literal with the given delimiter. The
 * Function constructor only compiles its body; nothing is executed.
 */
const literalParses = (delimiter: string, body: string): boolean => {
  try {
    new Function(`return ${delimiter}${body}${delimiter}`);
    return true;
  } catch {
    return false;
  }
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
 * @param input - The current content of cli.js, or every JavaScript module of
 *   a code-split native build (each prompt is patched in the module that
 *   contains it)
 * @param version - The Claude Code version
 * @param escapeNonAscii - Whether to escape non-ASCII characters (auto-detected if not specified)
 * @param patchFilter - Optional list of patch/prompt IDs to apply (if provided, only matching prompts are applied)
 * @param textSourceIndices - Indices of sources that are Bun text-loader
 *   (.md) modules rather than JavaScript; prompts are written into them
 *   verbatim, without string-literal or `\uXXXX` escaping
 * @returns SystemPromptsResult with modified content and per-prompt results
 */
export const applySystemPrompts = async (
  input: string | readonly string[],
  version: string,
  escapeNonAscii?: boolean,
  patchFilter?: string[] | null,
  textSourceIndices: ReadonlySet<number> = new Set()
): Promise<SystemPromptsResult> => {
  const contents = typeof input === 'string' ? [input] : [...input];
  const allSource = contents.length === 1 ? contents[0] : contents.join('\n');

  // Auto-detect if we should escape non-ASCII characters based on cli.js content
  const shouldEscapeNonAscii =
    escapeNonAscii ?? detectUnicodeEscaping(allSource);

  if (shouldEscapeNonAscii) {
    debug(
      'Detected Unicode escaping in cli.js - will escape non-ASCII characters in prompts'
    );
  }

  // Extract BUILD_TIME from cli.js content
  const buildTime = extractBuildTime(allSource);
  if (buildTime) {
    debug(`Extracted BUILD_TIME from cli.js: ${buildTime}`);
  }

  // Load system prompts and generate regexes
  const systemPrompts = await loadSystemPromptsWithRegex(version, buildTime);
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
    // 's' = dotAll; 'i' for hex-case differences in unicode escapes; 'g' because
    // cli.js sometimes repeats the same prompt text in more than one code path
    // (e.g. Claude Code's full-mode vs. compact-mode prompt arrays, see #678) and
    // every occurrence needs to be patched, not just the first. Guard regex
    // construction + match: an oversized pattern (e.g. the Model Migration Guide) can
    // overflow V8's regex stack on Node <=22 and abort the whole --apply (#753).
    let pattern: RegExp;
    // Code-split native builds pass every module, and a prompt can be repeated
    // across modules just as it is within one bundle (e.g. 2.1.295's Bash sleep
    // guidance in both the Bash and PowerShell tool modules): patch every
    // occurrence in every module that contains it.
    const found: { index: number; matches: RegExpMatchArray[] }[] = [];
    try {
      pattern = new RegExp(regex, 'gsi');
      contents.forEach((source, index) => {
        const matches = [...source.matchAll(pattern)];
        if (matches.length > 0) found.push({ index, matches });
      });
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

    if (found.length > 0) {
      const firstMatch = found[0].matches[0];
      const matchIndex = firstMatch.index!;

      // cli.js sometimes repeats the exact same prompt text at more than one
      // location (e.g. Claude Code's full-mode vs. compact-mode "Doing tasks"
      // arrays, see #678). Each occurrence is interpolated and validated
      // independently below because the minified variable names captured at
      // each site — and therefore the delimiter/escaping rules that apply —
      // can differ between occurrences even though the surrounding prompt
      // text is identical.
      const replacements: string[][] = found.map(() => []);
      let abortDetails: string | undefined;

      // reconstructContentFromPieces produced the .md body in the first place,
      // so an untouched file still equals it and there is nothing to apply.
      // Re-encoding it anyway is not safe: the .md is a hybrid of decoded
      // quotes and raw JavaScript escapes (#921/#922), so the escaping passes
      // below are not its inverse — they double a backslash that was already
      // literal prompt text and ship `use A\\Client` where cli.js had
      // `use A\Client`. Writing each occurrence back exactly as found is both
      // correct and the only form guaranteed to survive the round trip.
      // Compared trimmed because the markdown round trip is only trim-stable:
      // gray-matter normalises the trailing newline, and applyOriginalWhitespace
      // already treats the edges as serialization rather than content.
      const originalBaselineContent = reconstructContentFromPieces(
        pieces,
        identifiers,
        identifierMap
      ).trim();
      const isUncustomized = prompt.content.trim() === originalBaselineContent;

      const occurrences = found.flatMap(({ index, matches }, f) =>
        matches.map(m => ({
          f,
          content: contents[index],
          plainText: textSourceIndices.has(index),
          m,
        }))
      );
      for (const { f, content, plainText, m } of occurrences) {
        // Each occurrence keeps its own text: cli.js can repeat a prompt with
        // different minified variables at each site (#678).
        if (isUncustomized) {
          replacements[f].push(m[0]);
          continue;
        }

        const interpolatedContent = getInterpolatedContent(m);

        // An embedded .md module holds the prompt as plain text: there is no
        // string literal to escape for, and no Latin-1 module to encode
        // non-ASCII for, so the text is written exactly as the user wrote it.
        if (plainText) {
          replacements[f].push(interpolatedContent);
          continue;
        }

        // Check the delimiter character before this match to determine string type
        const mIndex = m.index!;
        const delimiter = mIndex > 0 ? content[mIndex - 1] : '';

        // For backtick-delimited prompts, `${...}` is live interpolation. A name
        // the bundle never defines there (a typo in an edit, or a stale .md
        // whose identifier was renamed upstream, #899) would throw
        // ReferenceError at runtime, which node --check cannot catch and which
        // leaves Claude Code unable to answer (#872, #900). Skip the prompt
        // rather than corrupt cli.js. Quoted/JSON prompts are inert here and are
        // left to the escaping paths below.
        if (delimiter === '`') {
          const introduced = findIntroducedInterpolationIdentifiers(
            interpolatedContent,
            m[0]
          );
          if (introduced.length > 0) {
            console.log(
              chalk.yellow(
                `Skipped "${prompt.name}": its \${...} references ${introduced.join(
                  ', '
                )}, which Claude Code does not define there. Fix the name in the prompt's .md; if you did not edit it, the file is stale (delete it and re-run --apply).`
              )
            );
            abortDetails = `undefined identifier: ${introduced.join(', ')}`;
            break;
          }
        }

        let replacementContent = interpolatedContent;

        if (delimiter === '"' || delimiter === "'") {
          replacementContent = escapeLiteralBackslashes(replacementContent);
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
            abortDetails =
              'incomplete escaping: unclosed interpolation detected';
            break;
          }
          if (escaped !== replacementContent) {
            console.log(
              chalk.yellow(
                `Auto-escaped unescaped backticks in "${prompt.name}"`
              )
            );
          }
          replacementContent = escaped;
        }

        // Encode non-ASCII LAST, for Bun native executables whose embedded module
        // is Latin-1 (#853). This emits JS syntax (`\uXXXX`), so it has to run
        // after the passes above that escape the prompt's own literal
        // backslashes: doing it earlier lets the #664 doubling turn `—` into
        // `\\u2014`, a literal backslash plus "u2014" instead of an em dash (#920).
        if (shouldEscapeNonAscii) {
          replacementContent = escapeNonAsciiChars(replacementContent);
        }

        // An edit can still be invalid JavaScript inside a template literal,
        // e.g. `${a b}`. The module parse gate would then refuse the whole
        // apply; checking the literal here names the prompt and skips only it.
        if (
          ['"', "'", '`'].includes(delimiter) &&
          !literalParses(delimiter, replacementContent) &&
          literalParses(delimiter, m[0])
        ) {
          console.log(
            chalk.red(
              `Skipped "${prompt.name}": the edited prompt is not valid JavaScript where Claude Code embeds it; check its \${...} expressions`
            )
          );
          abortDetails = 'edited prompt does not parse';
          break;
        }

        replacements[f].push(replacementContent);
      }

      if (abortDetails) {
        results.push({
          id: promptId,
          name: prompt.name,
          group: PatchGroup.SYSTEM_PROMPTS,
          applied: false,
          details: abortDetails,
        });
        continue;
      }

      // Calculate character counts for this prompt (both with human-readable placeholders)
      // Note: trim() to match how markdown files are parsed and how whitespace is applied
      const originalLength = originalBaselineContent.length;
      const newLength = prompt.content.trim().length;

      const oldContents = found.map(({ index }) => contents[index]);
      const matchLength = firstMatch[0].length;

      // Replace every occurrence with its own interpolated content — not the
      // same string reused for all of them — using a replacer function both to
      // consume `replacements` in match order and to avoid special replacement
      // pattern interpretation (e.g., $$ -> $), see #237.
      found.forEach(({ index }, f) => {
        let replacementIndex = 0;
        contents[index] = contents[index].replace(
          pattern,
          () => replacements[f][replacementIndex++]
        );
      });

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
        oldContents[0],
        contents[found[0].index],
        replacements[0][0],
        matchIndex,
        matchIndex + matchLength
      );

      // Track this prompt's result
      const charDiff = originalLength - newLength;
      const applied = found.some(
        ({ index }, f) => contents[index] !== oldContents[f]
      );

      let details: string;
      if (charDiff > 0) {
        details = chalk.green(`${charDiff} fewer chars`);
      } else if (charDiff < 0) {
        details = chalk.red(`${Math.abs(charDiff)} more chars`);
      } else {
        details = 'unchanged';
      }

      if (occurrences.length > 1) {
        details += ` (${occurrences.length} occurrences)`;
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
        // The full regex can be tens of kilobytes; print it only in verbose
        // mode so one missing prompt cannot bury the rest of the output.
        console.log(
          chalk.yellow(
            `Could not find system prompt "${prompt.name}" in Claude Code's source (run with --verbose to see the pattern)`
          )
        );
        verbose(`  Pattern: ${stringifyRegex(pattern)}`);
      }

      verbose(`\n  Debug info for ${prompt.name}:`);
      verbose(
        `  Regex pattern (first 200 chars): ${regex.substring(0, 200).replace(/\n/g, '\\n')}...`
      );
      verbose(`  Trying to match pattern in cli.js...`);
      try {
        const partial = new RegExp(regex.substring(0, 100));
        const testMatch = contents.some(source => partial.test(source));
        verbose(
          `  Partial match result: ${testMatch ? 'found partial' : 'no match'}`
        );
      } catch {
        verbose(`  Partial match failed (regex truncation issue)`);
      }
    }
  }

  return {
    newContent: contents[0],
    newContents: contents,
    results,
  };
};
