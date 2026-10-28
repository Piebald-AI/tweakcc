#!/usr/bin/env node

const fs = require('fs');
const parser = require('@babel/parser');

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateInput(text, minLength = 500) {
  if (!text || typeof text !== 'string') return false;

  // ////////////////
  // What to include.
  // ////////////////

  // Context about Git status
  if (text.startsWith('This is the git status')) return true;

  // Include the system reminder accompanying every Read tool.
  if (text.includes('Whenever you read a file, you should consider whether it'))
    return true;

  // Another prompt smaller then 500 characters that should be included
  if (text.includes('IMPORTANT: Assist with authorized security testing'))
    return true;

  // ////////////////
  // What to exclude.
  // ////////////////

  // In one specific case, some of the TUI code shows up in the prompts files.  Exclude it.
  if (text.includes('.dim("Note:')) return false;

  // CLI help text for `claude mcp add` is not a prompt - it's user-facing documentation.
  if (text.startsWith('Add an MCP server to Claude Code.')) return false;

  // Skip the warning about keybindings when connecting to a remote server.
  if (text.includes('Cannot install keybindings from a remote')) return false;

  if (text.length < minLength) return false;

  const first10 = text.substring(0, 10);
  if (first10.startsWith('AGFzbQ') || /^[A-Z0-9+/=]{10}$/.test(first10)) {
    return false;
  }

  const sample = text.substring(0, 500);
  const words = sample.split(/\s+/).filter(w => w.length > 0);

  if (words.length === 0) return false;

  const uppercaseWords = words.filter(
    w => w === w.toUpperCase() && /[A-Z]/.test(w)
  );
  const uppercaseRatio = uppercaseWords.length / words.length;

  if (uppercaseRatio > 0.6) {
    return false;
  }

  const lowerText = text.toLowerCase();
  const hasYou = lowerText.includes('you');
  const hasAI = lowerText.includes('ai') || lowerText.includes('assistant');
  const hasInstruct =
    lowerText.includes('must') ||
    lowerText.includes('should') ||
    lowerText.includes('always');

  if (!hasYou && !hasAI && !hasInstruct) {
    return false;
  }

  const sentencePattern = /[.!?]\s+[A-Z\(]/;
  const hasSentences = sentencePattern.test(text);
  if (!hasSentences) {
    return false;
  }

  const avgWordLength =
    words.reduce((sum, w) => sum + w.length, 0) / words.length;

  if (avgWordLength > 15) {
    return false;
  }

  const spaceCount = (sample.match(/\s/g) || []).length;
  const spaceRatio = spaceCount / sample.length;

  if (spaceRatio < 0.1) {
    return false;
  }

  return true;
}

/**
 * Extracts candidate prompt strings from JavaScript source.
 *
 * `options` may be a number (minLength, for backward compatibility) or:
 *   - minLength: passed to validateInput by the default `accept`
 *   - source: use this code instead of reading `filepath`
 *   - accept(text): decide which literals to keep (default: validateInput)
 *   - subsetFilter: drop literals nested inside another kept one (default true)
 *   - rawStrings: keep string literals' source escapes instead of their value
 */
function extractStrings(filepath, options = 500) {
  const opts = typeof options === 'number' ? { minLength: options } : options;
  const minLength = opts.minLength ?? 500;
  const accept = opts.accept ?? (text => validateInput(text, minLength));
  const code = opts.source ?? fs.readFileSync(filepath, 'utf-8');

  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  const stringData = [];

  const traverse = node => {
    if (!node || typeof node !== 'object') return;

    // Extract string literals
    if (node.type === 'StringLiteral') {
      if (accept(node.value)) {
        stringData.push({
          name: '',
          id: '',
          description: '',
          pieces: [
            opts.rawStrings
              ? code.slice(node.start + 1, node.end - 1)
              : node.value,
          ],
          identifiers: [],
          identifierMap: {},
          start: node.start,
          end: node.end,
        });
      }
    }

    // Extract template literals
    if (node.type === 'TemplateLiteral') {
      const { expressions } = node;

      // Extract the entire template content directly from source (excluding backticks)
      const contentStart = node.start + 1; // After opening backtick
      const contentEnd = node.end - 1; // Before closing backtick
      const fullContent = code.substring(contentStart, contentEnd);

      // Validate before processing
      if (!accept(fullContent)) {
        return;
      }

      // Collect all identifiers with their positions
      const allIdentifiers = []; // Array of {name, start, end} sorted by position

      for (let i = 0; i < expressions.length; i++) {
        const expr = expressions[i];

        const traverseExpr = (exprNode, isTopLevel = true) => {
          if (!exprNode || typeof exprNode !== 'object') return;

          if (exprNode.type === 'Identifier' && isTopLevel) {
            allIdentifiers.push({
              name: exprNode.name,
              start: exprNode.start - contentStart,
              end: exprNode.end - contentStart,
            });
          }

          if (exprNode.type === 'CallExpression') {
            traverseExpr(exprNode.callee, true);
            if (exprNode.arguments) {
              exprNode.arguments.forEach(arg => traverseExpr(arg, true));
            }
            return;
          }

          if (exprNode.type === 'MemberExpression') {
            traverseExpr(exprNode.object, true);
            return;
          }

          if (exprNode.type === 'TemplateLiteral') {
            if (exprNode.expressions) {
              exprNode.expressions.forEach(nestedExpr =>
                traverseExpr(nestedExpr, true)
              );
            }
            return;
          }

          if (exprNode.type === 'ObjectExpression') {
            if (exprNode.properties) {
              exprNode.properties.forEach(prop => {
                if (prop.value) {
                  traverseExpr(prop.value, false);
                }
              });
            }
            return;
          }

          for (const key in exprNode) {
            if (key === 'loc' || key === 'start' || key === 'end') continue;
            const value = exprNode[key];
            if (Array.isArray(value)) {
              value.forEach(v => traverseExpr(v, true));
            } else if (value && typeof value === 'object') {
              traverseExpr(value, true);
            }
          }
        };

        traverseExpr(expr, true);
      }

      // Sort identifiers by position
      allIdentifiers.sort((a, b) => a.start - b.start);

      // Build pieces array by splitting around identifiers, keeping ${ and }
      const pieces = [];
      const identifierList = [];
      const identifierMap = {};

      let lastPos = 0;

      for (const id of allIdentifiers) {
        // Find the ${ before this identifier (search backwards from id.start)
        let beforeIdentifier = fullContent.substring(lastPos, id.start);

        // Find the } after this identifier (search forwards from id.end)
        // We need to find the matching closing brace for the interpolation
        let afterIdentifierStart = id.end;

        // Add the piece including everything up to and including just before the identifier
        pieces.push(beforeIdentifier);

        // Add identifier to the list
        identifierList.push(id.name);

        // Add to map if not already there
        if (!identifierMap[id.name]) {
          identifierMap[id.name] = '';
        }

        lastPos = id.end;
      }

      // Add the final piece after the last identifier
      pieces.push(fullContent.substring(lastPos));

      // Label encode the identifiers
      const uniqueVars = [...new Set(identifierList)];
      const varToLabel = {};
      uniqueVars.forEach((varName, idx) => {
        varToLabel[varName] = idx;
      });

      const labelEncodedIdentifiers = identifierList.map(
        varName => varToLabel[varName]
      );
      const labelEncodedMap = {};
      Object.keys(varToLabel).forEach(varName => {
        labelEncodedMap[varToLabel[varName]] = '';
      });

      stringData.push({
        name: '',
        id: '',
        description: '',
        pieces,
        identifiers: labelEncodedIdentifiers,
        identifierMap: labelEncodedMap,
        start: node.start,
        end: node.end,
      });
    }

    // Recursively traverse
    for (const key in node) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;

      const value = node[key];
      if (Array.isArray(value)) {
        value.forEach(traverse);
      } else if (value && typeof value === 'object') {
        traverse(value);
      }
    }
  };

  traverse(ast);

  if (opts.subsetFilter === false) return { prompts: stringData };

  // Filter out strings that are subsets of other strings
  // Step 1: Sort by start index (ascending), then by end index (descending)
  // This puts earliest strings first, and among strings with same start, longest first
  stringData.sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    return b.end - a.end;
  });

  // Step 2: Track seen ranges and filter out subsets
  const seenRanges = [];
  const filteredData = [];

  for (const item of stringData) {
    const isSubset = seenRanges.some(
      range => item.start >= range.start && item.end <= range.end
    );

    if (!isSubset) {
      filteredData.push(item);
      seenRanges.push({ start: item.start, end: item.end });
    }
  }

  return { prompts: filteredData };
}

function mergeWithExisting(newData, oldData, currentVersion) {
  if (!oldData || !oldData.prompts) {
    // No old data, add current version to all new prompts
    return {
      prompts: newData.prompts.map(item => ({
        ...item,
        version: currentVersion,
      })),
    };
  }

  // Helper to reconstruct content from pieces and identifiers
  const reconstructContent = item => {
    return item.pieces.join(''); // Don't actually insert the vairables.
  };

  const newPrompts = newData.prompts.map((newItem, idx) => {
    const newContent = reconstructContent(newItem);

    // Try to find a matching old item by content and label-encoded identifiers
    const matchingOld = oldData.prompts.find(oldItem => {
      const oldContent = reconstructContent(oldItem);
      if (newContent !== oldContent) return false;

      // Also compare label-encoded identifiers
      if (newItem.identifiers.length !== oldItem.identifiers.length)
        return false;
      return (
        JSON.stringify(newItem.identifiers) ===
        JSON.stringify(oldItem.identifiers)
      );
    });

    // If we found a match, copy over the metadata
    if (matchingOld) {
      // Prompt matches exactly
      // If old prompt has no version, use current version; otherwise use old version
      return {
        ...newItem,
        name: matchingOld.name,
        id: matchingOld.id || slugify(matchingOld.name),
        description: matchingOld.description,
        identifierMap: matchingOld.identifierMap,
        version: matchingOld.version || currentVersion,
      };
    }

    // No exact match found - check if there's a prompt with same metadata but different content
    const similarOld = oldData.prompts.find(oldItem => {
      // Check if names match (not placeholder) as a heuristic for "same prompt, different content"
      return oldItem.name !== '' && oldItem.name === newItem.name;
    });

    if (similarOld && similarOld.version) {
      // Old prompt exists with a version and content changed - use current version
      console.log(
        `Content changed for "${newItem.name}", updating version from ${similarOld.version} to ${currentVersion}`
      );
      return {
        ...newItem,
        id: similarOld.id || slugify(similarOld.name),
        version: currentVersion,
      };
    }

    // Check if there's any old prompt without a version (we should add current version)
    const oldWithoutVersion = oldData.prompts.find(oldItem => !oldItem.version);

    // New prompt or old prompt didn't have version - add current version
    console.log(
      `No match for item ${idx}: ${JSON.stringify(newContent.slice(0, 100))}`
    );
    console.log();
    return {
      ...newItem,
      id: slugify(newItem.name),
      version: currentVersion,
    };
  });

  return { prompts: newPrompts };
}

// ---------------------------------------------------------------------------
// Seeded extraction
//
// The heuristic in validateInput is lossy (short or unusually worded prompts
// fail it), and a single pass cannot know which prompts are new. Claude Code
// changes few prompts per release, so the previous prompts file is the best
// guide: every prompt it lists is looked up among ALL literals of the new
// build (no heuristic), exactly first and then by a stable prefix/suffix for
// edited prompts. Only literals no prior prompt claimed go through the
// heuristic, and those are the genuinely new prompts.
// ---------------------------------------------------------------------------

/**
 * Comparison key for a prompt's cooked text: interpolations, short minified
 * names, version stamps and whitespace runs are collapsed.
 */
function promptKey(pieces) {
  return (
    pieces
      .join('\u0000')
      .replace(/<<CCVERSION>>|<<BUILD_TIME>>/g, '')
      .replace(/\d+\.\d+\.\d+/g, '')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, '')
      .replace(/\$\{[^}]*\}/g, '\u0001')
      // Minified names inside interpolated code change between builds.
      .replace(/(?<![\w$])[A-Za-z_$][\w$]?(?=[.,)\]};?:&|]|\?\.)/g, '\u0002')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Bun writes non-ASCII characters as \uXXXX escapes; the published prompts
 * hold the characters themselves (tweakcc re-escapes them when it patches).
 */
function decodeUnicodeEscapes(text, { nonAsciiOnly = false } = {}) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = text[i + 1];
    if (next === '\\') {
      // An escaped backslash: the next character is literal text.
      out += '\\\\';
      i++;
      continue;
    }
    let m;
    if (
      next === 'u' &&
      (m = /^\{([0-9a-fA-F]{1,6})\}/.exec(text.slice(i + 2)))
    ) {
      const cp = parseInt(m[1], 16);
      if (!nonAsciiOnly || cp > 0x7f) {
        out += String.fromCodePoint(cp);
        i += 1 + m[0].length;
        continue;
      }
    }
    if (next === 'u' && (m = /^[0-9a-fA-F]{4}/.exec(text.slice(i + 2)))) {
      const cp = parseInt(m[0], 16);
      if (!nonAsciiOnly || cp > 0x7f) {
        out += String.fromCharCode(cp);
        i += 5;
        continue;
      }
    }
    if (next === 'x' && (m = /^[0-9a-fA-F]{2}/.exec(text.slice(i + 2)))) {
      const cp = parseInt(m[0], 16);
      if (!nonAsciiOnly || cp > 0x7f) {
        out += String.fromCharCode(cp);
        i += 3;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** The value a JS string body denotes: all escapes resolved (comparison only). */
function cookEscapes(text) {
  const simple = {
    n: '\n',
    t: '\t',
    r: '\r',
    b: '\b',
    f: '\f',
    v: '\v',
    0: '\0',
  };
  return decodeUnicodeEscapes(text).replace(
    /\\([\s\S])/g,
    (_, c) => simple[c] ?? (c === '\n' ? '' : c)
  );
}

/** Every string/template literal of at least 20 characters, with its module. */
function collectLiterals(sources) {
  const candidates = [];
  for (const [module, source] of sources) {
    let found;
    try {
      found = extractStrings(module, {
        source,
        accept: text => text.length >= 20,
        subsetFilter: false,
        rawStrings: true,
      }).prompts;
    } catch {
      continue; // unparseable module: nothing to extract
    }
    for (const c of found) {
      // JS literals keep their source escapes, which the prompt matcher needs,
      // except non-ASCII ones (it accepts the characters either way). A text
      // module (`var __t = <JSON string>;`) is matched as the file's own text,
      // so its literal is fully cooked.
      const textModule = source.startsWith('var __t = ');
      const pieces = c.pieces.map(piece =>
        textModule
          ? cookEscapes(piece)
          : decodeUnicodeEscapes(piece, { nonAsciiOnly: true })
      );
      candidates.push({
        ...c,
        pieces,
        module,
        key: promptKey(pieces.map(cookEscapes)),
      });
    }
  }
  return candidates;
}

// Length of the opening/closing text that identifies an edited prompt.
const ANCHOR = 60;

/**
 * @param sources Map<string, string> of module name to JavaScript source
 *   (text modules can be passed as `var __t = <JSON string>;`)
 * @param seed previous prompts file ({ prompts: [...] }) or null
 * @param previousSources optional Map of the previous build's modules. A
 *   literal that already existed there but is not in `seed` was excluded on
 *   purpose, so it is not reported as new.
 * @returns {{ prompts, stats }} prompts in the published shape, without
 *   version stamping (mergeWithExisting does that)
 */
function seededExtract(
  sources,
  seed,
  { minLength = 500, previousSources } = {}
) {
  const candidates = collectLiterals(sources);
  const existedBefore = new Set(
    previousSources ? collectLiterals(previousSources).map(c => c.key) : []
  );

  const byKey = new Map();
  for (const c of candidates) if (!byKey.has(c.key)) byKey.set(c.key, c);

  const used = new Set();
  const take = (seedPrompt, c, how) => {
    used.add(c);
    return {
      name: seedPrompt.name,
      id: seedPrompt.id,
      description: seedPrompt.description,
      pieces: c.pieces,
      identifiers: c.identifiers,
      identifierMap: Object.fromEntries(
        Object.keys(c.identifierMap).map(k => [
          k,
          seedPrompt.identifierMap?.[k] ?? '',
        ])
      ),
      _how: how,
    };
  };

  const seedKey = new Map(
    (seed?.prompts ?? []).map(p => [p, promptKey(p.pieces.map(cookEscapes))])
  );
  const out = [];
  const pending = [];
  for (const p of seed?.prompts ?? []) {
    const c = byKey.get(seedKey.get(p));
    if (c && !used.has(c)) {
      // Same prompt. Keep the published text unless the build's differs
      // (e.g. renamed minified locals), in which case the build wins.
      const plain = pieces =>
        cookEscapes(pieces.join('')).replace(
          /<<CCVERSION>>|<<BUILD_TIME>>|\d+\.\d+\.\d+/g,
          ''
        );
      const same = plain(c.pieces) === plain(p.pieces);
      const t = take(p, c, 'exact');
      out.push(
        same
          ? {
              ...t,
              pieces: p.pieces,
              identifiers: p.identifiers,
              identifierMap: p.identifierMap,
            }
          : t
      );
    } else pending.push(p);
  }

  // Edited prompts: same opening or closing text, closest length wins.
  let removed = 0;
  const unmatched = [];
  for (const p of pending) {
    const key = seedKey.get(p);
    if (key.length < ANCHOR * 2) {
      removed++;
      continue;
    }
    const head = key.slice(0, ANCHOR),
      tail = key.slice(-ANCHOR);
    let best = null;
    for (const c of candidates) {
      if (used.has(c) || c.key.length < ANCHOR) continue;
      if (!c.key.startsWith(head) && !c.key.endsWith(tail)) continue;
      if (
        !best ||
        Math.abs(c.key.length - key.length) <
          Math.abs(best.key.length - key.length)
      )
        best = c;
    }
    if (best) out.push(take(p, best, 'edited'));
    else unmatched.push(p);
  }

  // Edits that touched both ends: pair by shared wording, best pair first.
  const shingles = text => {
    const w = text.toLowerCase().split(/\W+/).filter(Boolean),
      s = new Set();
    for (let i = 0; i + 2 < w.length; i++)
      s.add(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]);
    return s;
  };
  const similarity = (a, b) => {
    let both = 0;
    for (const x of a) if (b.has(x)) both++;
    return both / Math.max(1, Math.min(a.size, b.size));
  };
  const pool = candidates.filter(c => !used.has(c) && c.key.length >= 200);
  const pairs = [];
  for (const p of unmatched) {
    const key = seedKey.get(p);
    const ps = shingles(key);
    if (ps.size < 10) continue;
    for (const c of pool) {
      const len = c.key.length / key.length;
      if (len < 0.5 || len > 2) continue;
      const score = similarity(ps, (c.sh ??= shingles(c.key)));
      if (score >= 0.6) pairs.push({ p, c, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const paired = new Set();
  for (const { p, c } of pairs) {
    if (paired.has(p) || used.has(c)) continue;
    paired.add(p);
    out.push(take(p, c, 'edited'));
  }
  removed += unmatched.filter(p => !paired.has(p)).length;

  // New prompts: unclaimed literals that pass the heuristic, largest first,
  // skipping any nested in a literal already taken.
  // Prompts cluster: a new prompt almost always sits in a module (or text
  // asset) that already holds known ones. Elsewhere only clear-cut prompts
  // (the heuristic at its default length) count, which keeps UI and doc
  // strings out.
  const promptModules = new Set([...used].map(t => t.module));
  const isNew = c =>
    promptModules.has(c.module)
      ? validateInput(c.pieces.join(''), minLength)
      : validateInput(c.pieces.join(''), Math.max(minLength, 2000));
  const fresh = candidates
    .filter(c => !used.has(c) && !existedBefore.has(c.key) && isNew(c))
    .sort((a, b) => b.end - b.start - (a.end - a.start));
  const seen = new Set();
  for (const c of fresh) {
    const inside = [...used].some(
      t => t.module === c.module && c.start >= t.start && c.end <= t.end
    );
    if (seen.has(c.key) || inside) continue;
    seen.add(c.key);
    used.add(c);
    // Named from its opening words; a maintainer gives it a real name later.
    const words = c.key
      .replace(/[^\w\s-]/g, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 8)
      .join(' ');
    out.push({
      name: `New prompt: ${words}`,
      id: `new-prompt-${slugify(words)}`,
      description: '',
      pieces: c.pieces,
      identifiers: c.identifiers,
      identifierMap: c.identifierMap,
      _how: 'new',
    });
  }

  const count = how => out.filter(p => p._how === how).length;
  const stats = {
    exact: count('exact'),
    edited: count('edited'),
    new: count('new'),
    removed,
  };
  return { prompts: out.map(({ _how, ...p }) => p), stats };
}

module.exports = extractStrings;
module.exports.extractStrings = extractStrings;
module.exports.seededExtract = seededExtract;
module.exports.promptKey = promptKey;

// CLI
if (require.main === module) {
  // Seeded mode (code-split native builds):
  //   node promptExtractor.js --modules <modules.json> [--seed <prev-prompts.json>]
  //     [--previous <prev-modules.json>] --version <x.y.z> [output-file]
  // modules.json maps each module name to its JavaScript source; text modules
  // are passed as `var __t = <JSON string>;`. tools/dumpModules.mts writes it.
  const flag = name => {
    const at = process.argv.indexOf(name);
    return at === -1 ? undefined : process.argv[at + 1];
  };
  const modulesFile = flag('--modules');
  const positional = process.argv
    .slice(2)
    .filter(
      (arg, i, all) => !arg.startsWith('--') && !all[i - 1]?.startsWith('--')
    );
  const filepath = modulesFile ?? positional[0];

  if (!filepath) {
    console.error(
      'Usage: node promptExtractor.js <path-to-cli.js> [output-file]\n' +
        '       node promptExtractor.js --modules <modules.json> [--seed <prompts.json>] [--previous <modules.json>] --version <x.y.z> [output-file]'
    );
    process.exit(1);
  }

  const outputFile =
    (modulesFile ? positional[0] : positional[1]) || 'prompts.json';

  // Try to read existing output file
  let existingData = null;
  if (fs.existsSync(outputFile)) {
    try {
      const existingContent = fs.readFileSync(outputFile, 'utf-8');
      existingData = JSON.parse(existingContent);
      console.log(
        `Found existing output file with ${existingData.prompts?.length || 0} prompts`
      );
    } catch (err) {
      console.warn(
        `Warning: Could not parse existing output file: ${err.message}`
      );
    }
  }

  // Look for package.json alongside the input file
  const path = require('path');
  const inputDir = path.dirname(path.resolve(filepath));
  const packageJsonPath = path.join(inputDir, 'package.json');

  let version = flag('--version') ?? null;
  if (modulesFile && !version) {
    console.error('--version <x.y.z> is required with --modules');
    process.exit(1);
  }
  if (!version && fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      version = packageJson.version;
      console.log(`Found package.json with version ${version}`);
    } catch (err) {
      console.warn(`Warning: Could not parse package.json: ${err.message}`);
    }
  }

  // Helper functions to replace version strings with placeholder
  const replaceVersionInString = (str, versionStr) => {
    if (!versionStr) return str;
    // Escape dots for regex
    const escapedVersion = versionStr.replace(/\./g, '\\.');
    // Replace version with placeholder
    return str.replace(new RegExp(escapedVersion, 'g'), '<<CCVERSION>>');
  };

  // Helper function to replace BUILD_TIME timestamps with placeholder
  // BUILD_TIME is an ISO 8601 timestamp like "2025-12-09T19:43:43Z"
  const replaceBuildTimeInString = str => {
    // Match ISO 8601 timestamps in the format YYYY-MM-DDTHH:MM:SSZ
    // Only match when preceded by BUILD_TIME:" to avoid false positives
    return str.replace(
      /BUILD_TIME:"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)"/g,
      'BUILD_TIME:"<<BUILD_TIME>>"'
    );
  };

  const replaceVersionInPrompts = (data, versionStr) => {
    return {
      ...data,
      prompts: data.prompts.map(prompt => ({
        ...prompt,
        pieces: prompt.pieces.map(piece => {
          let result = piece;
          // Replace BUILD_TIME first (always)
          result = replaceBuildTimeInString(result);
          // Then replace version if provided
          if (versionStr) {
            result = replaceVersionInString(result, versionStr);
          }
          return result;
        }),
      })),
    };
  };

  let result;
  if (modulesFile) {
    const readModules = file =>
      new Map(Object.entries(JSON.parse(fs.readFileSync(file, 'utf-8'))));
    const seedFile = flag('--seed');
    const seed = seedFile
      ? JSON.parse(fs.readFileSync(seedFile, 'utf-8'))
      : existingData;
    const previousFile = flag('--previous');
    const { prompts, stats } = seededExtract(readModules(modulesFile), seed, {
      previousSources: previousFile ? readModules(previousFile) : undefined,
    });
    console.log(
      `Seeded extraction: ${stats.exact} unchanged, ${stats.edited} edited, ${stats.new} new, ${stats.removed} no longer present`
    );
    result = { prompts };
    // mergeWithExisting carries the seed's versions forward.
    existingData = seed;
  } else {
    result = extractStrings(filepath);
  }
  // Replace version in newly extracted strings BEFORE merging
  const versionReplacedResult = replaceVersionInPrompts(result, version);

  const mergedResult = mergeWithExisting(
    versionReplacedResult,
    existingData,
    version
  );

  // Sort prompts by lexicographic order of pieces joined together (without interpolated vars)
  mergedResult.prompts.sort((a, b) => {
    const contentA = a.pieces.join('');
    const contentB = b.pieces.join('');
    return contentA.localeCompare(contentB);
  });

  // Remove start/end fields before writing
  mergedResult.prompts = mergedResult.prompts.map(
    ({ start, end, ...rest }) => rest
  );

  // Add version as top-level field
  const outputData = {
    version,
    ...mergedResult,
  };

  fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));

  console.log(`Extracted ${mergedResult.prompts.length} strings`);
  console.log(`Written to ${outputFile}`);
}
