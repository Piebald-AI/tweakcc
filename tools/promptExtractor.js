#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const PARSER_PLUGINS = ['jsx', 'typescript', 'explicitResourceManagement'];

// ─── Pretty console output ───────────────────────────────────────────────────
// Presentation only. Every helper below is a pure formatter — it changes how
// things are printed, never what gets extracted, merged, or written to disk.
// Colour is auto-disabled for non-TTY output, NO_COLOR, and dumb terminals, so
// piped/redirected logs stay clean plain text while still reading nicely.
const USE_COLOR =
  (!!process.stdout.isTTY ||
    (!!process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0')) &&
  !process.env.NO_COLOR &&
  process.env.TERM !== 'dumb';

const style =
  (...codes) =>
  s =>
    USE_COLOR ? `\x1b[${codes.join(';')}m${s}\x1b[0m` : String(s);
const fg = n => style(38, 5, n); // 256-colour foreground
const bfg = n => style(1, 38, 5, n); // bold + 256-colour foreground

const c = {
  bold: style(1),
  dim: fg(245),
  italic: style(3),
  red: fg(167),
  green: fg(29),
  yellow: fg(166),
  blue: fg(33),
  magenta: fg(133),
  cyan: fg(30),
  gray: fg(244),
  boldCyan: bfg(44),
  boldGreen: bfg(29),
  boldYellow: bfg(166),
  boldRed: bfg(167),
  boldMagenta: bfg(133),
};

// Glyphs chosen to line up in a left gutter so the eye can scan by symbol.
const glyph = {
  info: c.dim('·'),
  ok: c.green('✓'),
  warn: c.yellow('▲'),
  skip: c.red('✗'),
  fuzzy: c.magenta('≈'),
  readd: c.cyan('↺'),
  fresh: c.boldGreen('✦'),
  arrow: c.dim('→'),
};

// A soft section header that breaks the run into scannable chunks.
function section(title) {
  console.log('');
  console.log(c.boldCyan(`▌ ${title}`));
}

// A "label   value" pair with the label in a fixed-width dim column.
function field(label, value) {
  console.log(`  ${c.dim(label.padEnd(9))} ${value}`);
}

// Compose a nested bullet line (returned, not printed, so callers can pick the
// stream — console.log for stdout, console.warn for stderr).
function bullet(g, text) {
  return `  ${g} ${text}`;
}

// Print a bullet line to stdout.
function item(g, text) {
  console.log(bullet(g, text));
}

// A deeper "label   value" detail row, used under a bullet.
function detail(label, value) {
  console.log(`      ${c.dim(label.padEnd(10))} ${value}`);
}

// Collapse whitespace and clip a string to a single tidy preview line.
function clip(text, max = 64) {
  const oneLine = String(text).replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine;
}

// Human-friendly counts: 4213 → "4.2k", 1500000 → "1.5M".
function compactNum(n) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}

function pct(ratio) {
  return `${(ratio * 100).toFixed(1)}%`;
}

// Skipped non-prompt fragments (HTML/JS) are noisy when listed one-per-line, so
// by default we just tally them and print a single summary. `--verbose` restores
// the per-fragment listing. VERBOSE is set from argv before extraction runs.
let VERBOSE = false;
const skipStats = new Map();

function recordSkip(kind, text) {
  skipStats.set(kind, (skipStats.get(kind) || 0) + 1);
  if (VERBOSE) {
    console.warn(
      bullet(
        glyph.skip,
        `${c.dim('skipped ' + kind)}  ${c.dim(compactNum(text.length) + ' chars')}  ${c.italic(clip(text, 60))}`
      )
    );
  }
}

// One-line roll-up of everything skipped, e.g.
// "21 non-prompt fragments (18 HTML template, 2 JS module, 1 JS script)".
function skipSummary() {
  let total = 0;
  for (const n of skipStats.values()) total += n;
  if (total === 0) return null;
  const parts = [...skipStats.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${n} ${kind}`);
  return `${total} non-prompt fragment${total === 1 ? '' : 's'} ${c.dim(`(${parts.join(', ')})`)}`;
}

// ─── Performance instrumentation ─────────────────────────────────────────────
// The merge step does O(newPrompts × oldPrompts) Damerau-Levenshtein passes over
// full prompt bodies, which is the suspected hot spot. This harness times the DL
// work and each merge pass so we can see exactly where the wall-clock goes.
// Enabled by default; set PROMPT_EXTRACTOR_PERF=0 to silence.
const PERF = process.env.PROMPT_EXTRACTOR_PERF !== '0';

// Hard ceiling on the Damerau-Levenshtein band width. The edit budget the
// threshold implies (maxLen × (1 − threshold)) scales with string length, so a
// pair of ~85k-char prompts at a 0.7 threshold opens a ~25k-wide band → tens of
// billions of cells and ~13s for ONE comparison. Capping the band keeps the DP
// at O(n × DL_MAX_BAND). Override with PROMPT_EXTRACTOR_MAX_BAND.
const DL_MAX_BAND = Number(process.env.PROMPT_EXTRACTOR_MAX_BAND || 4000);

// Per-comparison cell ceiling. A fixed band still leaves cost at O(n × band),
// so a band of 4000 on an 85k-char prompt is ~680M cells (~3.5s) for ONE pair.
// We additionally shrink the band so that n × (2·band) stays under this budget:
// effectiveBand = clamp(DL_CELL_BUDGET / n, DL_MIN_BAND, DL_MAX_BAND). This hard-
// bounds any single comparison. The trade-off: on very large, very divergent
// prompts the band may be too narrow to confirm a fuzzy match, so they fall
// through to "new" (with a hint) — exactly the bucket we want them in anyway,
// and the band-capped counter makes every such case visible.
// Override with PROMPT_EXTRACTOR_CELL_BUDGET / PROMPT_EXTRACTOR_MIN_BAND.
const DL_CELL_BUDGET = Number(
  process.env.PROMPT_EXTRACTOR_CELL_BUDGET || 8_000_000
);
const DL_MIN_BAND = Number(process.env.PROMPT_EXTRACTOR_MIN_BAND || 256);

const dlStats = {
  calls: 0, // total damerauLevenshteinSimilarity() invocations
  skippedByLength: 0, // returned 0 cheaply via length pre-check (no DP run)
  bandCapped: 0, // runs where the threshold's budget exceeded DL_MAX_BAND
  cellsComputed: 0, // band cells filled across all DP runs
  totalNs: 0n, // cumulative time inside the DP
  maxNs: 0n, // slowest single comparison
  maxPair: null, // [lenA, lenB] of that slowest comparison
};

function perfLog(...args) {
  if (PERF) console.log(c.gray(`  ┄ ${args.join(' ')}`));
}

function fmtMs(ns) {
  return `${(Number(ns) / 1e6).toFixed(1)}ms`;
}

function dlSnapshot() {
  return {
    calls: dlStats.calls,
    skippedByLength: dlStats.skippedByLength,
    bandCapped: dlStats.bandCapped,
    cellsComputed: dlStats.cellsComputed,
    totalNs: dlStats.totalNs,
  };
}

function dlReport(label, before) {
  if (!PERF) return;
  const calls = dlStats.calls - before.calls;
  const skipped = dlStats.skippedByLength - before.skippedByLength;
  const capped = dlStats.bandCapped - before.bandCapped;
  const cells = dlStats.cellsComputed - before.cellsComputed;
  const ns = dlStats.totalNs - before.totalNs;
  perfLog(
    `${label}: ${calls} DL comparisons (${skipped} skipped by length, ${calls - skipped} ran DP, ${capped} band-capped), ${cells.toLocaleString()} cells, ${fmtMs(ns)} in DP`
  );
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Compute Damerau-Levenshtein (Optimal String Alignment) distance between two
 * strings, with band optimization and early termination.
 *
 * Returns the edit distance, or Infinity if it exceeds maxDist.
 * Band optimization keeps this O(n * maxDist) instead of O(n * m).
 */
function damerauLevenshteinDistance(a, b, maxDist) {
  const lenA = a.length;
  const lenB = b.length;

  // Length difference is a lower bound on edit distance
  if (Math.abs(lenA - lenB) > maxDist) return Infinity;

  // Trivial cases
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  // Use three rolling rows: two back (for transpositions), one back, current.
  // Each row is the full width, but we only compute within the band.
  const width = lenB + 1;
  let prev2 = new Float64Array(width).fill(Infinity);
  let prev1 = new Float64Array(width).fill(Infinity);
  let curr = new Float64Array(width).fill(Infinity);

  // Row 0: base case — editing empty prefix of a into prefix of b
  for (let j = 0; j <= Math.min(maxDist, lenB); j++) {
    prev1[j] = j;
  }

  for (let i = 1; i <= lenA; i++) {
    curr.fill(Infinity);

    // Only compute j values within the band [i - maxDist, i + maxDist]
    const bandStart = Math.max(1, i - maxDist);
    const bandEnd = Math.min(lenB, i + maxDist);

    if (i <= maxDist) curr[0] = i;

    let rowMin = curr[0];

    if (bandEnd >= bandStart) dlStats.cellsComputed += bandEnd - bandStart + 1;

    for (let j = bandStart; j <= bandEnd; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      curr[j] = Math.min(
        prev1[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev1[j - 1] + cost // substitution
      );

      // Transposition of two adjacent characters
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prev2[j - 2] + 1);
      }

      rowMin = Math.min(rowMin, curr[j]);
    }

    // Early termination: every value in this row exceeds the budget
    if (rowMin > maxDist) return Infinity;

    // Rotate rows
    const tmp = prev2;
    prev2 = prev1;
    prev1 = curr;
    curr = tmp;
  }

  return prev1[lenB] <= maxDist ? prev1[lenB] : Infinity;
}

/**
 * Compute Damerau-Levenshtein similarity between two strings as a ratio in [0, 1].
 * Returns 0 immediately if the strings differ too much in length to possibly
 * meet the threshold, avoiding expensive computation.
 */
function damerauLevenshteinSimilarity(a, b, threshold = 0.9) {
  dlStats.calls++;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;

  // Edit budget the threshold implies. This grows with string length, so bound
  // it two ways: a hard band ceiling, and a per-comparison cell budget that
  // shrinks the band further on long strings so n × (2·band) stays affordable.
  const budget = Math.floor(maxLen * (1 - threshold));
  const cellBand = Math.floor(DL_CELL_BUDGET / (2 * Math.max(maxLen, 1)));
  const cap = Math.max(DL_MIN_BAND, Math.min(DL_MAX_BAND, cellBand));
  const maxDist = Math.min(budget, cap);
  if (PERF && budget > maxDist) dlStats.bandCapped++;

  // Cheap length pre-filter: if the lengths differ by more than the (capped)
  // edit budget the DP can't possibly succeed, so skip it.
  if (Math.abs(a.length - b.length) > maxDist) {
    dlStats.skippedByLength++;
    return 0;
  }

  const t0 = PERF ? process.hrtime.bigint() : 0n;
  const dist = damerauLevenshteinDistance(a, b, maxDist);
  if (PERF) {
    const elapsed = process.hrtime.bigint() - t0;
    dlStats.totalNs += elapsed;
    if (elapsed > dlStats.maxNs) {
      dlStats.maxNs = elapsed;
      dlStats.maxPair = [a.length, b.length];
    }
  }

  if (dist === Infinity) return 0;
  return 1 - dist / maxLen;
}

/**
 * Decode JavaScript \uXXXX, \u{...}, and \xHH non-ASCII escape sequences to
 * literal characters, while preserving all other source-level escapes
 * (\\, \", \n, \t, etc. stay as they appeared in source).
 *
 * The archive format intentionally stores most escapes source-level so
 * buildSearchRegexFromPieces() in systemPromptSync.ts can match them
 * directly in cli.js source. Non-ASCII chars, though, used to appear as
 * literal UTF-8 bytes in the pre-native cli.js; Bun's compile step
 * re-encodes every non-ASCII char as \uXXXX (or \xHH for Latin-1) in the
 * embedded JS. Decoding these back to literal chars keeps the archive
 * canonical across compile chains, keeps diffs between CC versions
 * meaningful, and lets escapeNonAsciiForRegex() in systemPromptSync.ts
 * build the (?:→|\u2192) alternation it already knows how to build.
 *
 * Must scan left-to-right so that the 7 source chars `\\u2192` (literal
 * backslash + 'u2192', which are NOT a Unicode escape) stay intact, rather
 * than being mis-decoded as the 6 chars `\u2192`.
 */
function decodeUnicodeEscapes(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      // \\  — escaped backslash, preserve both chars as an atomic unit
      if (s[i + 1] === '\\') {
        out += '\\\\';
        i++;
        continue;
      }
      // \u{XXXXX} — code-point escape
      if (s[i + 1] === 'u' && s[i + 2] === '{') {
        const end = s.indexOf('}', i + 3);
        if (end !== -1) {
          const hex = s.slice(i + 3, end);
          if (/^[0-9a-fA-F]+$/.test(hex)) {
            const cp = parseInt(hex, 16);
            if (cp <= 0x10ffff) {
              out += String.fromCodePoint(cp);
              i = end;
              continue;
            }
          }
        }
      }
      // \uXXXX — 4-digit Unicode escape. Surrogate halves naturally combine
      // in the output JS string when a high/low pair appears back-to-back.
      if (s[i + 1] === 'u' && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) {
        const cp = parseInt(s.slice(i + 2, i + 6), 16);
        out += String.fromCodePoint(cp);
        i += 5;
        continue;
      }
      // \xHH — 2-digit Latin-1 escape. Bun emits these for chars ≤ 0xFF.
      if (s[i + 1] === 'x' && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 2, i + 4))) {
        const cp = parseInt(s.slice(i + 2, i + 4), 16);
        out += String.fromCodePoint(cp);
        i += 3;
        continue;
      }
    }
    out += s[i];
  }
  return out;
}

function validateInput(text, minLength = 500) {
  if (!text || typeof text !== 'string') return false;

  // Internal settings-schema documentation. Keep these before explicit includes
  // so prompt-like prose cannot bypass them. The access-token entry is nested
  // under GatewayOidc rather than the normal desktop longDescription registry.
  if (text.startsWith('@internal Per-OS variant of policyHelper')) return false;
  if (
    text.startsWith(
      "In **access-token** mode the token's audience must be your gateway."
    )
  ) {
    return false;
  }

  // Bundled evaluation UI and Data Visualization skill resources can contain
  // prompt-like prose, so exclude these exact non-model-facing artifacts before
  // the explicit include rules.
  if (
    text.startsWith('<details class="section legend">') &&
    text.includes('<summary>How to read this report</summary>') &&
    text.includes("A run's score is the weighted fraction of its graders")
  ) {
    recordSkip('HTML template', text);
    return false;
  }
  if (
    text.startsWith('# Color formula') &&
    text.includes('Every chart color does exactly one of four jobs') &&
    text.includes('palette is legal only if it passes six checks')
  ) {
    recordSkip('skill reference', text);
    return false;
  }
  if (
    text.includes(
      'Validate a categorical chart palette against the computable data-viz checks'
    ) &&
    text.includes('OKLab ΔE') &&
    (text.includes('node validate_palette.js') ||
      text.includes('python validate_palette.py'))
  ) {
    recordSkip('validator source', text);
    return false;
  }

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

  // Short system reminders and tool descriptions that should be included (under 500 chars but important)
  const shortPromptPatterns = [
    // Agent guidance
    'subagent_type: "fork" creates a fork',
    // Tool descriptions
    'Writes a file to the local filesystem',
    // Bash tool description (since 2.1.53, built dynamically via array.join instead of a single template literal)
    'Executes a given bash command and returns its output',
    'working directory persists between commands',
    'IMPORTANT: Avoid using this tool to run',
    'better to use the built-in tools',
    'File search: Use',
    'Content search: Use',
    'Read files: Use',
    'Edit files: Use',
    'Write files: Use',
    'Output text directly (NOT echo/printf)',
    'commands are independent and can run in parallel',
    'commands depend on each other and must run sequentially',
    "only when you need to run commands sequentially but don't care",
    'DO NOT use newlines to separate commands',
    'Prefer to create a new commit rather than amending',
    'Before running destructive operations',
    'Never skip hooks (--no-verify)',
    'Do not sleep between commands that can run immediately',
    'simply run your command using',
    'Do not retry failing commands in a sleep loop',
    'background task you started with',
    'If you must poll an external process',
    'If you must sleep, keep the duration short',
    'verify the parent directory exists',
    'Always quote file paths that contain spaces',
    'Try to maintain your current working directory',
    'You may specify an optional timeout',
    'Write a clear, concise description of what your command does',
    // Bash sandbox note (j2z function) - also broken into array.join
    'You should always default to running commands within the sandbox',
    'explicitly asks you to bypass sandbox',
    'A specific command just failed',
    'Evidence of sandbox-caused failures',
    'Operation not permitted',
    'Access denied to specific paths',
    'Network connection failures to non-whitelisted',
    'Unix socket connection errors',
    'When you see evidence of sandbox-caused',
    'Immediately retry with',
    'Briefly explain what sandbox restriction',
    'This will prompt the user for permission',
    'Treat each command you execute',
    'Do not suggest adding sensitive paths',
    'All commands MUST run in sandbox mode',
    'Commands cannot run outside the sandbox',
    'If a command fails due to sandbox restrictions',
    'For temporary files, always use',
    // Tone and style (nu9/QxA function) - broken into array.join
    'Your output to the user should be concise and polished',
    'Only use emojis if the user explicitly requests it',
    'Your responses should be short and concise',
    'When referencing specific functions or pieces of code',
    'Do not use a colon before tool calls',
    // Tool usage policy (lu9 function) - broken into array.join
    'To read files use',
    'To edit files use',
    'To create files use',
    'To search for files use',
    'To search the content of files',
    'Reserve using the',
    'For broader codebase exploration',
    'Break down and manage your work',
    'Subagents are valuable for parallelizing',
    'For simple, directed codebase searches',
    'is shorthand for users to invoke',
    // Doing tasks (du9/mxA function) - broken into array.join
    'user will primarily request you to perform',
    'You are highly capable and often',
    'For exploratory questions',
    'Prefer editing existing files to creating new ones',
    'do not propose changes to code',
    'Do not create files unless',
    'Avoid giving time estimates',
    'If your approach is blocked',
    'Be careful not to introduce security',
    'Avoid over-engineering',
    'Avoid backwards-compatibility',
    'add features, refactor code',
    "Don't add features, refactor",
    'add error handling, fallbacks',
    'create helpers, utilities',
    'Default to writing no comments',
    'well-named identifiers already do that',
    'golden path and edge cases',
    'If the user asks for help or wants to give feedback',
    // Agent prompts
    'You are evaluating a hook in Claude Code',
    '## Exited Delegate Mode',
    '## Exited Plan Mode',
    '<new-diagnostics>',
    'file exists but is shorter than the provided offset',
    'file exists but the contents are empty',
    'hook stopped continuation:',
    'hook success:',
    'hook additional context:',
    'hook blocking error from command',
    'output style is active',
    'A plan file exists from plan mode at',
    'The following skills were invoked',
    "The task tools haven't been used recently",
    "The TodoWrite tool hasn't been used recently",
    'The user has expressed a desire to invoke the agent',
    'todo list is currently empty',
    'This session is being continued from another machine',
    'You can check its output using the TaskOutput tool',
    'You have completed implementing the plan',
    'Your todo list has changed',
    'Token usage:',
    'USD budget:',
    'Your response was cut off because it exceeded the output token limit',
    'The user opened the file',
    'The user selected the lines',
    '<mcp-resource server=',
    'was modified, either by the user or by a linter',
    'was read before the last conversation was summarized',
    'was too large and has been truncated',
    'Contents of ${', // Memory file contents
    'What NOT to save in memory',
    // /rename slash command auto-generate prompt
    'Generate a short kebab-case name',
    // Newer-CC prompts (cross-referenced against tweakcc-fixed on 2.1.172)
    // Agent/system prompts
    '# Agent Teammate Communication',
    'You are an interactive agent that helps users',
    '# Autonomous loop tick (dynamic pacing)',
    '# Focus mode',
    '# Language\nAlways respond in',
    'Read, search, and investigate freely — looking is not acting',
    "You've inherited the conversation context above from a parent agent",
    // /insights at-a-glance summary
    'See _Impressive Things You Did_',
    // /helpme daemon section
    'The background daemon manages',
    // CronCreate durability section
    'By default (durable: false) the job lives only',
    // Settings skill
    '## Settings File Locations',
    'Use this skill to configure the Claude Code harness via settings.json',
    // Plan mode / Ultraplan
    '## What Happens in Plan Mode',
    'Your plan has been submitted to the team lead for approval',
    "I'm sending this plan to Ultraplan",
    // Code-review skill phases, angles, and dimensions
    'removed-behavior auditor',
    'cross-file tracer',
    'language-pitfall specialist',
    'wrapper/proxy correctness',
    'Flag wasted work the diff introduces',
    'Sweep for gaps',
    'Verify (1-vote, 3-state)',
    'Verify (1-vote, recall-biased)',
    'Run `git diff @{upstream}...HEAD`',
    'Return findings as a JSON array of at most',
    'If the user asks about "ultrareview"',
    // Tool descriptions
    'Find elements on the page using natural language',
    'Render an HTML or Markdown file to an Artifact',
    'Render a clickable role-picker chip row',
    'Use this tool to list all tasks in the task list',
    'Use this tool to retrieve a task by its ID from the task list',
    'Use this tool to update a task in the task list',
    // claude-code-guide agent description
    'Use this agent when the user asks questions ("Can Claude',
    // Build-with-Claude-API TypeScript batches doc
    'Message Batches API — TypeScript',
    // Sub-500-char prompts surfaced by a minLength=250 survey of 2.1.172,
    // manually triaged (memory system, loop ticks, MCP/Web tools, plan mode,
    // peer messages, chrome browser + computer-use tools, misc fragments).
    'Before any browser action, you MUST call',
    'Execute JavaScript code in the context of the current page. The code r',
    'The JavaScript code to execute. Evaluated in the page context with REP',
    'Get an accessibility tree representation of elements on the page. By d',
    'Extract raw text content from the page, prioritizing article content.',
    'Get context information about the current MCP tab group. Returns all t',
    'Read browser console messages (console.log, console.error, console.war',
    'Read HTTP network requests (XHR, Fetch, documents, images, etc.) from',
    'Execute a shortcut or workflow by running it in a new sidepanel window',
    'Send a connection request to every Chrome browser with the extension i',
    '" tool did not respond in time. The Chrome extension is connected but',
    '" tool call failed because the Chrome extension disconnected mid-opera',
    "Reserve this for decisions where the user's answer changes what you do",
    "<how_to_use>When your work should be informed by the user's profile or",
    '<when_to_save>Any time the user corrects your approach ("no not that",',
    '<body_structure>Lead with the rule itself, then a **Why:** line (the r',
    '<description>Information that you learn about ongoing work, goals, ini',
    '<when_to_save>When you learn who is doing what, why, or by when. These',
    '<body_structure>Lead with the fact or decision, then a **Why:** line (',
    'Each memory file should contain one paragraph about a single fact that',
    'Memory files should be treated as immutable. You should never edit a m',
    'Memory is one of several persistence mechanisms available to you as yo',
    '- When to use or update a plan instead of memory: If you are about',
    '- When to use or update tasks instead of memory: When you need to brea',
    'Tool results may include additional',
    '**Step 2** — add a pointer to that file',
    'IMPORTANT: This is NOT from your user — it came from an',
    'Fetches a URL, converts the page to markdown, and answers',
    'IMPORTANT: WebFetch WILL FAIL for authenticated or private URLs. Befor',
    "when the loop can't move further without the user, or when something",
    'Run the autonomous check using the loop instructions established earli',
    '# /loop tick — loop.md tasks',
    '# /loop tick — loop.md tasks (dynamic pacing)',
    '# /loop tick — loop.md absent (dynamic pacing)',
    'is the wake signal and this is only the fallback heartbeat. If you we',
    'Send a message the user will read verbatim. Use this for content they',
    'Search the web. Returns result blocks with titles and URLs. US-only.',
    'CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.',
    'Lists available resources from configured MCP servers.',
    'List available resources from configured MCP servers.',
    '[OUTPUT TRUNCATED - exceeded',
    '- For analysis or summarization that requires reading the full content',
    '- If you receive truncation warnings when reading the file ("[N lines',
    '- Before producing ANY summary or analysis, you MUST explicitly descri',
    'granted at tier "read" (visible in screenshots only; no clicks or typi',
    'only; NO typing, key presses, right-click, modifier-clicks, or drag-dr',
    'blocked by policy for computer use. Requests',
    'Request user permission to control a set of applications for this sess',
    'Take a higher-resolution screenshot of a specific region of the last f',
    'Type text into whatever currently has keyboard focus. The frontmost ap',
    'Press and hold a key or key combination for the specified duration, th',
    'Press the left mouse button at the current cursor position and leave i',
    'Release the left mouse button at the current cursor position. The fron',
    'e.g. click a field, type into it, press Return. Actions execute sequen',
    'The user stepped away and is coming back. Recap in under 40 words, 1-2',
    ', heredocs, or similar to write or edit a file that an Edit/Write/Mult',
    'Review the classification process and follow it carefully, making sure',
    'Read-only search agent for broad fan-out searches — when answering mea',
    'In plan mode, you should:',
    'User has approved your plan. You can now start coding. Start with upda',
    'You are running in an isolated git worktree at',
    'NOTE: You are running inside a workflow script. Your final text respon',
    'NOTE: You are running inside a workflow script. You MUST return your f',
    'Create and update a task list for the current session. The list is ren',
    'Update the todo list for the current session. To be used proactively',
    'General-purpose agent for researching complex questions, searching',
    '**Do not spawn agents unless the user asks.** Each spawn starts cold',
    'Launch a new agent to handle complex, multi-step tasks. Each agent typ',
    "Do not duplicate this agent's work — avoid working with the same files",
    'In brief mode, plain assistant text is hidden from the user — only',
    'Optional attachments for the user to see alongside your message. Each',
    'Check that each change is implemented at the right depth, not as a fra',
    'Cleanup and altitude candidates use the same',
    '- **CONFIRMED** — can name the inputs/state that trigger it and the wr',
    'parameter to run the command in the background. Only use this if you',
    'PowerShell edition: PowerShell 7+ (pwsh)',
    'PowerShell edition: unknown — assume Windows PowerShell 5.1 for compat',
    'Performs exact string replacement in a file.',
    'minimal — usually 1-3 lines, only enough to be unique in the file. In',
    'Write a short summary label describing what these tool calls accomplis',
    'A session-scoped Stop hook is now active with condition: "',
    'for paths inside the memory directory only, and',
    'You have a limited turn budget.',
    'You MUST only use content from the last ~',
    '**Tool constraints for this run:** Shell access is restricted to read-',
    '**Browser Automation**: Chrome browser tools are available via the "cl',
    'Bias toward working without stopping for clarifying questions — when y',
    'The following deferred tools are now available via',
    'The following MCP servers are still connecting — their tools (typicall',
    'The coordinator sent a message while you were working:',
    '). This PDF is too large to read all at once. You MUST use',
    'Ultracode is on: optimize for the most exhaustive, correct answer — no',
    '(created in this session). Check state with',
    "5. After creating/updating the PR, check if the user's CLAUDE.md menti",
    'For each issue: briefly explain what the fix will do, then ask me to c',
    'Brief mode is now enabled. Use',
    'Summarize this portion of a Claude Code session transcript. Focus on:',
    "Analyze this Claude Code usage data and describe the user's interactio",
    "Analyze this Claude Code usage data and identify what's working well f",
    'Analyze this Claude Code usage data and find a memorable moment.',
    'You are evaluating a hook condition in Claude Code. Judge whether',
    "[Earlier conversation truncated to fit the hook evaluator's context wi",
    'The conversation transcript is available at:',
    'When a task has been agreed, the approval covers it end to end — in-sc',
    "Users may configure 'hooks', shell commands that execute in response t",
    'Tools are executed in a user-selected permission mode. When you attemp',
    'without a subagent_type creates a fork, which runs in the background',
    'The most recent Claude models are Fable 5 and the Claude 4.X family. M',
    'Asking the user a clarifying question has a cost: it interrupts them,',
    'When you have enough information to act, act. Do not re-derive facts',
    "You are an agent for Claude Code, Anthropic's official CLI for Claude.",
    "As you answer the user's questions, you can use the following context:",
    'Browser extension is not connected. Please ensure the Claude browser e',
    'Automates your Chrome browser to interact with web pages - clicking el',
    'Review the current diff for correctness bugs and reuse/simplification/',
    'Create a new Cowork plugin from scratch, or customize an installed plu',
    'Only if you did NOT show the cloud-offer',
    'Your FIRST action must be a single',
    "**Provider context:** This session is not using Anthropic's first-part",
    // Model-gated tool-description variants. CC serves a shorter arm to the
    // newest models via a GY-gated `return GY(H)?CONCISE:VERBOSE` branch; those
    // concise arms are all sub-500 chars and otherwise drop under the length
    // floor, while their verbose siblings clear it and mask the gap. The
    // verbose Glob also shrank below the floor and regressed out entirely
    // (tool-description-glob, captured since 2.0.14), so re-anchor it here too.
    'Fast file pattern matching tool that works with any codebase size', // Glob (verbose, regressed out)
    'Fast file pattern matching. Supports glob patterns', // Glob (compact)
    'Content search built on ripgrep', // Grep (compact)
    'Reads a file from the local filesystem.', // Read (compact); verbose sibling already clears the floor
  ];
  if (shortPromptPatterns.some(pattern => text.includes(pattern))) return true;

  // ////////////////
  // What to exclude.
  // ////////////////

  // HTML templates (e.g. the Insights report) are not prompts.
  const trimmed = text.trimStart();
  const isHtml =
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    (/(<div\s+class=)/.test(text) && /<style>|onclick=|<h[1-6]\s/.test(text));
  if (isHtml) {
    recordSkip('HTML template', text);
    return false;
  }

  // In one specific case, some of the TUI code shows up in the prompts files.  Exclude it.
  if (text.includes('.dim("Note:')) return false;

  // CLI help text for `claude mcp add` is not a prompt - it's user-facing documentation.
  if (text.startsWith('Add an MCP server to Claude Code.')) return false;

  // Plugin init's generated channel server scaffold is CLI template output, not a prompt.
  if (
    text.startsWith('#!/usr/bin/env bun') &&
    text.includes('stdio MCP server implementing the channel contract') &&
    text.includes("experimental: { 'claude/channel': {} }")
  ) {
    return false;
  }

  // JavaScript source files bundled as data payloads (e.g. design-sync converter
  // scripts shipped inside the binary and written to disk at runtime). These are
  // executable Node.js code, not text sent to the model.
  if (trimmed.startsWith('#!/usr/bin/env node')) {
    recordSkip('JS script', text);
    return false;
  }
  // ES modules without shebangs: start with // comments and have import statements.
  // Scan the whole text for the import, not just a fixed prefix window: these
  // modules can open with a long banner comment block (the design-sync converter
  // scripts run 20+ comment lines, ~1.2k chars) that pushes the first import past
  // any small slice, letting the module leak through as a "prompt". The leading
  // `//` gate already makes false positives vanishingly unlikely.
  if (
    /^\/\/[^\n]*\n/.test(trimmed) &&
    /\bimport\s+\{[^}]+\}\s+from\s+['"]/.test(text)
  ) {
    recordSkip('JS module', text);
    return false;
  }

  // Workflow script templates are generated scaffold output, not prompts.
  if (trimmed.startsWith('export const meta = {')) return false;

  // Workflow VM hardening and boundary clone source blobs are executable code,
  // not model-facing prompt text.
  if (
    text.includes("Object.defineProperty(Error, 'prepareStackTrace'") &&
    text.includes('delete globalThis[g]') &&
    text.includes('JSC debug/shell globals')
  ) {
    return false;
  }
  if (
    text.includes('Module-private symbol tagging the boundary-cap error') &&
    text.includes(
      'array length is not a safe integer across the workflow VM boundary'
    )
  ) {
    return false;
  }
  if (
    text.includes(
      'Closure-private registry of clone-created boundary-cap errors'
    ) &&
    text.includes('parent-VM (attacker-reachable) values as childArgs')
  ) {
    return false;
  }
  if (
    text.includes(
      'Closure-private registry of walker-created boundary-cap errors'
    ) &&
    text.includes('attacker-controlled')
  ) {
    return false;
  }
  if (
    text.includes(
      'Capture intrinsics in closure NOW (literal-eval time, pre-user-code)'
    ) &&
    text.includes('ReplayCacheExhausted')
  ) {
    return false;
  }

  // Settings-schema descriptions are user-facing validation/help copy, not prompts.
  if (
    text.includes(
      'rejects the --plugin-dir, --plugin-url, --agents, and non-sdk --mcp-config CLI flags at startup'
    ) &&
    text.includes('Only honored from managed settings')
  ) {
    return false;
  }

  // Telemetry event descriptions are schema documentation, not model-facing prompts.
  if (
    text.startsWith(
      'Emitted when the model ends the stream with stop_reason "refusal"'
    ) &&
    text.includes('model_refusal_fallback covers the retry case')
  ) {
    return false;
  }

  // Skip the warning about keybindings when connecting to a remote server.
  if (text.includes('Cannot install keybindings from a remote')) return false;

  // Remote Control prompts and CLI help text are user-facing docs, not prompts.
  if (text.includes('\nRemote Control - Connect your')) return false;
  if (text.includes('\nRemote Control - Control local sessions')) return false;

  // more trash
  if (text.includes('The user wants to clarify these questions')) return false;

  // Event-field documentation for the bridge worker-teardown event (CC-2656) is
  // descriptive data/copy about an internal event stream, not model-facing prompt text.
  if (text.includes('Emitted by the bridge on opt-in graceful worker teardown'))
    return false;

  // Generated browser runtime for chart artifacts is executable UI code, not a prompt.
  if (
    trimmed.startsWith('(function () {') &&
    text.includes(
      'document.querySelector(\'script[type="application/json"][data-chart-runtime]\')'
    ) &&
    text.includes("document.getElementById('primary-chart')")
  ) {
    return false;
  }

  // This is a standalone fragment duplicated inside the PR explainer skill.
  if (
    text.startsWith(
      'Wherever the answers end up in the sections below, the page must answer all\nfive of these questions:'
    )
  ) {
    return false;
  }

  // Staged-call RPC schema documentation is internal API copy, not model-facing prompt text.
  if (
    (text.startsWith(
      '@internal Fate of a queued command (slash command or queued user prompt).'
    ) &&
      text.includes('cancelled-over-completed is deliberate dup-over-loss')) ||
    (text.startsWith(
      'Tool arguments. When input_files/output_files are declared,'
    ) &&
      text.includes('staging error_code=tool_error')) ||
    (text.startsWith(
      'RFC3339 deadline, REQUIRED when output_files are declared'
    ) &&
      text.includes('staging error_code=expired')) ||
    (text.startsWith('STAGED calls (input_files/output_files declared)') &&
      text.includes(
        'subtype:error is emitted only when the call could not be attempted at all'
      )) ||
    (text.startsWith(
      'Present exactly when the request used any staged-call field'
    ) &&
      text.includes('if_match outputs surface output_conflict'))
  ) {
    return false;
  }

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
 * Resolve the static string variants of a prompt-bearing expression.
 *
 * Claude Code frequently builds a tool description from several short literals.
 * Those literals are patch coordinates, so they must remain separate extraction
 * records, but we need to judge them as the complete runtime description rather
 * than dropping every constituent that happens to be under the length floor.
 */
function resolveStaticStringExpression(
  node,
  bindings,
  functions,
  seen = new Set()
) {
  if (!node || seen.has(node)) return null;
  const nextSeen = new Set(seen).add(node);

  if (node.type === 'StringLiteral') {
    return { variants: [node.value], leaves: [node], assembled: false };
  }

  if (node.type === 'TemplateLiteral') {
    const variants = [''];
    const leaves = [node];
    for (let i = 0; i < node.quasis.length; i++) {
      const text = node.quasis[i].value.cooked ?? node.quasis[i].value.raw;
      for (let j = 0; j < variants.length; j++) variants[j] += text;
      if (i >= node.expressions.length) continue;
      const resolved = resolveStaticStringExpression(
        node.expressions[i],
        bindings,
        functions,
        nextSeen
      );
      const values = resolved?.variants || ['${EXPRESSION}'];
      const prefixes = [...variants];
      variants.length = 0;
      for (const prefix of prefixes) {
        for (const value of values) variants.push(prefix + value);
      }
      // Interpolation values help reconstruct runtime length, but their
      // declarations are not sibling prompt fragments. Only the containing
      // template literal is a patch coordinate; propagating these leaves turns
      // constants such as "Bash" into standalone extracted prompts.
    }
    return { variants, leaves, assembled: node.expressions.length > 0 };
  }

  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = resolveStaticStringExpression(
      node.left,
      bindings,
      functions,
      nextSeen
    );
    const right = resolveStaticStringExpression(
      node.right,
      bindings,
      functions,
      nextSeen
    );
    if (!left || !right) return null;
    return {
      variants: left.variants.flatMap(a => right.variants.map(b => a + b)),
      leaves: [...left.leaves, ...right.leaves],
      assembled: true,
    };
  }

  if (node.type === 'ConditionalExpression') {
    const consequent = resolveStaticStringExpression(
      node.consequent,
      bindings,
      functions,
      nextSeen
    );
    const alternate = resolveStaticStringExpression(
      node.alternate,
      bindings,
      functions,
      nextSeen
    );
    if (!consequent || !alternate) return null;
    return {
      variants: [...consequent.variants, ...alternate.variants],
      leaves: [...consequent.leaves, ...alternate.leaves],
      assembled: true,
    };
  }

  if (node.type === 'Identifier') {
    const value = bindings.resolve(node, node.name);
    if (!value) return null;
    return resolveStaticStringExpression(value, bindings, functions, nextSeen);
  }

  if (
    node.type === 'CallExpression' &&
    node.arguments.length === 0 &&
    node.callee.type === 'Identifier'
  ) {
    const returned = functions.resolve(node.callee, node.callee.name);
    if (!returned) return null;
    return resolveStaticStringExpression(
      returned,
      bindings,
      functions,
      nextSeen
    );
  }

  return null;
}

function collectStaticStringBindings(ast) {
  const nodeScopes = new WeakMap();
  const rootScope = { parent: null, bindings: new Map(), functions: new Map() };
  const functionTypes = new Set([
    'FunctionDeclaration',
    'FunctionExpression',
    'ArrowFunctionExpression',
    'ObjectMethod',
    'ClassMethod',
  ]);

  const register = (map, name, value) => {
    if (!map.has(name)) map.set(name, value);
    else if (map.get(name) !== value) map.set(name, null);
  };

  const visit = (node, scope) => {
    if (!node || typeof node !== 'object') return;
    nodeScopes.set(node, scope);

    if (
      node.type === 'FunctionDeclaration' &&
      node.id?.type === 'Identifier' &&
      node.body?.body
    ) {
      const returns = node.body.body.filter(
        statement => statement.type === 'ReturnStatement'
      );
      if (returns.length === 1 && returns[0].argument) {
        register(scope.functions, node.id.name, returns[0].argument);
      }
    }

    const childScope = functionTypes.has(node.type)
      ? { parent: scope, bindings: new Map(), functions: new Map() }
      : scope;

    if (
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      node.init
    ) {
      register(scope.bindings, node.id.name, node.init);
    }

    for (const key in node) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(item => visit(item, childScope));
      else if (value && typeof value === 'object') visit(value, childScope);
    }
  };

  const resolver = kind => ({
    resolve(node, name) {
      let scope = nodeScopes.get(node);
      while (scope) {
        const map = scope[kind];
        if (map.has(name)) return map.get(name);
        scope = scope.parent;
      }
      return null;
    },
  });

  visit(ast, rootScope);
  return {
    bindings: resolver('bindings'),
    functions: resolver('functions'),
  };
}

function findSettingsDescriptionLiterals(ast) {
  const literals = new Set();

  const containsLongDescriptionMember = node => {
    const pending = [node];
    const seen = new Set();
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current || typeof current !== 'object' || seen.has(current))
        continue;
      seen.add(current);
      if (
        current.type === 'MemberExpression' ||
        current.type === 'OptionalMemberExpression'
      ) {
        const propertyName = current.computed
          ? current.property?.type === 'StringLiteral'
            ? current.property.value
            : null
          : current.property?.type === 'Identifier'
            ? current.property.name
            : null;
        if (propertyName === 'longDescription') return true;
      }
      for (const key in current) {
        if (key === 'loc' || key === 'start' || key === 'end') continue;
        const value = current[key];
        if (Array.isArray(value)) pending.push(...value);
        else if (value && typeof value === 'object') pending.push(value);
      }
    }
    return false;
  };

  const collectLiterals = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'StringLiteral' || node.type === 'TemplateLiteral') {
      literals.add(node);
      return;
    }
    for (const key in node) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(collectLiterals);
      else if (value && typeof value === 'object') collectLiterals(value);
    }
  };

  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'CallExpression' &&
      containsLongDescriptionMember(node.callee)
    ) {
      node.arguments.forEach(collectLiterals);
      return;
    }
    for (const key in node) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };

  visit(ast);
  return literals;
}

function findAssembledDescriptionLeaves(
  ast,
  bindings,
  functions,
  code,
  minLength
) {
  const leaves = new Set();

  const leafText = leaf => {
    if (leaf.type === 'StringLiteral') return leaf.value;
    if (leaf.type === 'TemplateLiteral') {
      return decodeUnicodeEscapes(code.substring(leaf.start + 1, leaf.end - 1));
    }
    return '';
  };

  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (
      (node.type === 'ObjectProperty' || node.type === 'ObjectMethod') &&
      !node.computed
    ) {
      const key = node.key?.name ?? node.key?.value;
      if (key === 'description') {
        let value = node.value;
        if (node.type === 'ObjectMethod') {
          const returns = node.body.body.filter(
            statement => statement.type === 'ReturnStatement'
          );
          value = returns.length === 1 ? returns[0].argument : null;
        }
        const resolved = resolveStaticStringExpression(
          value,
          bindings,
          functions
        );
        if (
          resolved?.assembled &&
          resolved.variants.some(value => value.length >= minLength) &&
          resolved.leaves.some(leaf => validateInput(leafText(leaf), minLength))
        ) {
          for (const leaf of resolved.leaves) {
            if (leafText(leaf).trim().length > 0) leaves.add(leaf);
          }
        }
      }
    }
    for (const key in node) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };

  visit(ast);
  return leaves;
}

function extractStrings(filepath, minLength = 500) {
  const code = fs.readFileSync(filepath, 'utf-8');
  const parseCode = code
    .replace(/\bawait using\b/g, 'const      ')
    .replace(/\busing\b/g, 'const');

  const ast = parser.parse(parseCode, {
    sourceType: 'module',
    plugins: PARSER_PLUGINS,
  });

  const stringData = [];
  const settingsDescriptionLiterals = findSettingsDescriptionLiterals(ast);
  const { bindings, functions } = collectStaticStringBindings(ast);
  const assembledDescriptionLeaves = findAssembledDescriptionLeaves(
    ast,
    bindings,
    functions,
    code,
    minLength
  );

  const traverse = node => {
    if (!node || typeof node !== 'object') return;

    // Extract string literals from raw source, but only preserve the escapes
    // that must remain source-level for later raw cli.js matching.
    if (node.type === 'StringLiteral') {
      const rawValue = code.substring(node.start + 1, node.end - 1);
      const archiveValue = decodeUnicodeEscapes(
        rawValue
          .replace(/\\r\\n/g, '\n')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
      );

      if (settingsDescriptionLiterals.has(node)) {
        recordSkip('settings description', archiveValue);
      } else if (
        validateInput(archiveValue, minLength) ||
        assembledDescriptionLeaves.has(node)
      ) {
        stringData.push({
          name: '',
          id: '',
          description: '',
          pieces: [archiveValue],
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

      // Validate against the DECODED content, not raw source. Bun compiles
      // non-ASCII into \uXXXX / \xHH escapes, so a box-drawing run like
      // `────────────────────────────` ends up as `\u2500\u2500\u2500...` —
      // one giant no-space "word" that trips the avgWordLength and
      // spaceRatio heuristics and sinks legitimate prompts (e.g. the
      // "Learning mode (insights)" banner). The raw form is still used
      // below for piece-splitting because identifier offsets key off it.
      if (settingsDescriptionLiterals.has(node)) {
        recordSkip('settings description', decodeUnicodeEscapes(fullContent));
        return;
      }
      if (
        !validateInput(decodeUnicodeEscapes(fullContent), minLength) &&
        !assembledDescriptionLeaves.has(node)
      ) {
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

        // Add the piece including everything up to and including just before
        // the identifier. Decode per-piece (not whole fullContent) so that
        // identifier offsets — which index into raw source — stay valid.
        pieces.push(decodeUnicodeEscapes(beforeIdentifier));

        // Add identifier to the list
        identifierList.push(id.name);

        // Add to map if not already there
        if (!identifierMap[id.name]) {
          identifierMap[id.name] = '';
        }

        lastPos = id.end;
      }

      // Add the final piece after the last identifier
      pieces.push(decodeUnicodeEscapes(fullContent.substring(lastPos)));

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

  // Step 3: Deduplicate by content — the same string can appear at multiple
  // source positions (e.g. once in a function and once in a variable assignment).
  const seenContent = new Set();
  const deduped = filteredData.filter(item => {
    const key = item.pieces.join('') + '\0' + JSON.stringify(item.identifiers);
    if (seenContent.has(key)) return false;
    seenContent.add(key);
    return true;
  });

  return { prompts: deduped };
}

function compareVersions(a, b) {
  const aParts = String(a || '')
    .split('.')
    .map(Number);
  const bParts = String(b || '')
    .split('.')
    .map(Number);
  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i++) {
    const diff = (aParts[i] || 0) - (bParts[i] || 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

function findHistoricalPromptFiles(outputFile, currentVersion) {
  if (!outputFile || !currentVersion) return [];

  const outputDir = path.dirname(path.resolve(outputFile));
  let entries;
  try {
    entries = fs.readdirSync(outputDir);
  } catch {
    return [];
  }

  return entries
    .map(filename => {
      const match = filename.match(/^prompts-([\d.]+)\.json$/);
      if (!match) return null;
      const version = match[1];
      if (compareVersions(version, currentVersion) >= 0) return null;
      return { path: path.join(outputDir, filename), version };
    })
    .filter(Boolean)
    .sort((a, b) => compareVersions(b.version, a.version));
}

function normalizedLineSet(text) {
  return new Set(
    text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length >= 10)
  );
}

function headingAnchorSimilarity(a, b) {
  const firstMeaningfulLine = text =>
    text
      .split('\n')
      .map(line => line.trim())
      .find(line => line.length > 0) || '';
  const aFirst = firstMeaningfulLine(a);
  const bFirst = firstMeaningfulLine(b);

  if (aFirst.length < 10 || aFirst !== bFirst) return 0;

  const aSecond =
    a
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)[1] || '';
  const bSecond =
    b
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)[1] || '';
  if (aSecond && bSecond && aSecond === bSecond) return 0.75;

  return 0;
}

function lineOverlapSimilarity(a, b) {
  const aLines = normalizedLineSet(a);
  const bLines = normalizedLineSet(b);
  if (aLines.size === 0 || bLines.size === 0) return 0;

  let overlap = 0;
  for (const line of aLines) {
    if (bLines.has(line)) overlap++;
  }

  // A single shared line is almost always incidental boilerplate (a common
  // heading, a code-fence caption, a license/URL line) rather than evidence the
  // two prompts are related. Counting it produces nonsense scores like 1/34 =
  // 2.9% between wholly unrelated docs, which then trips the interactive prompt.
  // Require at least two overlapping lines before reporting any similarity.
  if (overlap < 2) return 0;

  return overlap / Math.min(aLines.size, bLines.size);
}

function loadHistoricalRemovedPromptCandidates(
  outputFile,
  currentVersion,
  oldData
) {
  if (!oldData || !Array.isArray(oldData.prompts)) return [];

  const activeKeys = new Set(
    oldData.prompts
      .filter(prompt => prompt.name)
      .map(
        prompt =>
          prompt.pieces.join('') +
          '\0' +
          JSON.stringify(prompt.identifiers || [])
      )
  );
  const seenIds = new Set();
  const candidates = [];

  for (const file of findHistoricalPromptFiles(outputFile, currentVersion)) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file.path, 'utf-8'));
    } catch (err) {
      console.warn(
        bullet(
          glyph.warn,
          `${c.dim('could not read historical file')} ${file.path} ${c.dim(`(${err.message})`)}`
        )
      );
      continue;
    }

    for (const prompt of data.prompts || []) {
      if (!prompt.name) continue;
      const id = prompt.id || slugify(prompt.name);
      const key =
        prompt.pieces.join('') +
        '\0' +
        JSON.stringify(prompt.identifiers || []);
      if (activeKeys.has(key) || seenIds.has(id)) {
        continue;
      }
      seenIds.add(id);
      candidates.push({ prompt, version: data.version || file.version });
    }
  }

  return candidates;
}

function mergeWithExisting(newData, oldData, currentVersion, options = {}) {
  if (!oldData || !oldData.prompts) {
    // No old data, add current version to all new prompts
    return {
      prompts: newData.prompts.map(item => ({
        ...item,
        version: currentVersion,
      })),
    };
  }

  // Prompt pieces include both user-visible template quasis and the JavaScript
  // source around nested interpolation identifiers. Formatting the bundle only
  // changes the latter, but a blanket whitespace normalization would also hide
  // real edits to prompt prose. Parse each piece as a template literal and use
  // Babel's normalized AST only when deciding whether two source shapes are
  // semantically equivalent; keep the newly extracted pieces for patching.
  const reconstructContent = item => {
    return item.pieces.join(''); // Don't actually insert the variables.
  };

  const canonicalizeTemplatePieces = item => {
    try {
      // Identifiers divide the source at arbitrary points inside expressions.
      // Reinsert stable synthetic bindings so Babel can parse the whole template
      // and compare structure without depending on minifier formatting.
      let source = item.pieces[0] || '';
      for (let i = 0; i < item.identifiers.length; i++) {
        source += `__PROMPT_IDENTIFIER_${item.identifiers[i]}__`;
        source += item.pieces[i + 1] || '';
      }
      const expression = parser.parseExpression(`\`${source}\``, {
        plugins: PARSER_PLUGINS,
      });
      return JSON.stringify(expression, (key, value) => {
        if (
          key === 'start' ||
          key === 'end' ||
          key === 'loc' ||
          key === 'extra' ||
          key === 'errors' ||
          key === 'comments'
        ) {
          return undefined;
        }
        return value;
      });
    } catch {
      return null;
    }
  };

  const sourceShapeEquivalent = (newItem, oldItem) => {
    if (
      newItem.identifiers.length === 0 ||
      JSON.stringify(newItem.identifiers) !==
        JSON.stringify(oldItem.identifiers) ||
      newItem.pieces.length !== oldItem.pieces.length
    ) {
      return false;
    }

    const newCanonical = canonicalizeTemplatePieces(newItem);
    const oldCanonical = canonicalizeTemplatePieces(oldItem);
    return !!newCanonical && newCanonical === oldCanonical;
  };

  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;
  const askYesNo = question => {
    if (!isInteractive) return false;

    let ttyFd = null;
    const inputFd = (() => {
      try {
        ttyFd = fs.openSync('/dev/tty', 'r+');
        return ttyFd;
      } catch {
        return 0;
      }
    })();
    const outputFd = ttyFd || 1;

    try {
      fs.writeSync(outputFd, `${question} [y/N] `);
      const chunks = [];
      const buffer = Buffer.alloc(1);

      while (true) {
        const bytesRead = fs.readSync(inputFd, buffer, 0, 1, null);
        if (bytesRead === 0) break;
        const char = buffer.toString('utf8', 0, bytesRead);
        if (char === '\n' || char === '\r') break;
        chunks.push(char);
      }

      const answer = chunks.join('').trim().toLowerCase();
      return answer === 'y' || answer === 'yes';
    } catch (err) {
      const message = err && err.message ? ` (${err.message})` : '';
      console.warn(
        '\n' +
          bullet(
            glyph.warn,
            `${c.dim('could not read answer; leaving prompt as new')}${c.dim(message)}`
          )
      );
      return false;
    } finally {
      if (ttyFd !== null) fs.closeSync(ttyFd);
    }
  };

  const mergeIdentifierMapByContext = (newItem, matchingOld) => {
    const mergedIdentifierMap = { ...newItem.identifierMap };

    const fingerprint = (pieces, identifiers, idx) => {
      const pos = identifiers.indexOf(idx);
      if (pos === -1) return null;
      const before = (pieces[pos] || '').slice(-60);
      const after = (pieces[pos + 1] || '').slice(0, 60);
      return before + '\0' + after;
    };

    const oldFpToName = {};
    for (const key of Object.keys(matchingOld.identifierMap)) {
      const name = matchingOld.identifierMap[key];
      if (!name) continue;
      const fp = fingerprint(
        matchingOld.pieces,
        matchingOld.identifiers,
        Number(key)
      );
      if (fp) oldFpToName[fp] = name;
    }

    for (const key of Object.keys(mergedIdentifierMap)) {
      const fp = fingerprint(newItem.pieces, newItem.identifiers, Number(key));
      if (fp && oldFpToName[fp]) {
        mergedIdentifierMap[key] = oldFpToName[fp];
      } else if (
        !mergedIdentifierMap[key] &&
        matchingOld.identifierMap &&
        matchingOld.identifierMap[key]
      ) {
        mergedIdentifierMap[key] = matchingOld.identifierMap[key];
      }
    }

    return mergedIdentifierMap;
  };

  const applyOldMetadata = (newItem, matchingOld) => ({
    ...newItem,
    name: matchingOld.name,
    id: matchingOld.id || slugify(matchingOld.name),
    description: matchingOld.description,
    identifierMap: mergeIdentifierMapByContext(newItem, matchingOld),
    version: currentVersion,
  });

  const applyHistoricalCandidateMetadata = (newItem, historical, score) => {
    const historicalPrompt = historical.prompt;
    const historicalId = historicalPrompt.id || slugify(historicalPrompt.name);
    return {
      ...newItem,
      name:
        `REVIEW REQUIRED: possible historical prompt re-add (${pct(score)}) — ` +
        historicalPrompt.name,
      id: `review-historical-readd-${historicalId}`,
      description:
        `REVIEW REQUIRED: promptExtractor detected this as a possible historical ` +
        `re-add of "${historicalPrompt.name}" (${historicalId}), last seen in ` +
        `v${historical.version}, with ${pct(score)} similarity. Do not publish ` +
        `this placeholder metadata as final prompt metadata. A human or agent ` +
        `should inspect the prompt, decide whether it truly inherits the ` +
        `historical identity, then replace this name/id/description with the ` +
        `correct final metadata before releasing.`,
      identifierMap: mergeIdentifierMapByContext(newItem, historicalPrompt),
      version: currentVersion,
    };
  };

  const applyOldCandidateMetadata = (newItem, matchingOld, score) => {
    const oldId = matchingOld.id || slugify(matchingOld.name);
    return {
      ...newItem,
      name:
        `REVIEW REQUIRED: possible old metadata match (${pct(score)}) — ` +
        matchingOld.name,
      id: `review-old-metadata-match-${oldId}`,
      description:
        `REVIEW REQUIRED: promptExtractor detected this as a possible match ` +
        `for existing prompt metadata "${matchingOld.name}" (${oldId}) with ` +
        `${pct(score)} similarity. Do not publish this placeholder metadata as ` +
        `final prompt metadata. A human or agent should inspect the prompt, ` +
        `decide whether it truly inherits the old identity, then replace this ` +
        `name/id/description with the correct final metadata before releasing.`,
      identifierMap: mergeIdentifierMapByContext(newItem, matchingOld),
      version: currentVersion,
    };
  };

  const SIMILARITY_THRESHOLD = 0.7;
  const HISTORICAL_SIMILARITY_THRESHOLD = 0.7;
  const HISTORICAL_HINT_THRESHOLD = 0.4;

  // Pre-compute old contents for reuse
  const oldContents = oldData.prompts.map(reconstructContent);
  const historicalRemovedCandidates = loadHistoricalRemovedPromptCandidates(
    options.outputFile,
    currentVersion,
    oldData
  ).map(candidate => ({
    ...candidate,
    content: reconstructContent(candidate.prompt),
  }));
  const claimedHistoricalIds = new Set();

  // Track which old prompts have been claimed (by exact or fuzzy match)
  const claimedOld = new Set();

  section('Merging with previous extraction');
  const namedOldCount = oldData.prompts.filter(p => p.name).length;
  item(
    glyph.info,
    `${c.bold(newData.prompts.length)} extracted  ${c.dim('·')}  ` +
      `${c.bold(oldData.prompts.length)} existing ${c.dim(`(${namedOldCount} named)`)}  ${c.dim('·')}  ` +
      `${c.bold(historicalRemovedCandidates.length)} historical candidates`
  );
  const mergeT0 = process.hrtime.bigint();

  // Pass 1: Exact matches (content + identifiers must be identical)
  const results = new Array(newData.prompts.length).fill(null);
  const pass1Before = dlSnapshot();
  const pass1T0 = process.hrtime.bigint();

  for (let idx = 0; idx < newData.prompts.length; idx++) {
    const newItem = newData.prompts[idx];
    const newContent = reconstructContent(newItem);

    const oldIdx = oldData.prompts.findIndex((oldItem, oi) => {
      if (claimedOld.has(oi)) return false;
      if (oldContents[oi] !== newContent) return false;
      if (newItem.identifiers.length !== oldItem.identifiers.length)
        return false;
      return (
        JSON.stringify(newItem.identifiers) ===
        JSON.stringify(oldItem.identifiers)
      );
    });

    if (oldIdx !== -1) {
      const matchingOld = oldData.prompts[oldIdx];
      claimedOld.add(oldIdx);
      results[idx] = {
        ...newItem,
        name: matchingOld.name,
        id: matchingOld.id || slugify(matchingOld.name),
        description: matchingOld.description,
        identifierMap: matchingOld.identifierMap,
        version: matchingOld.version || currentVersion,
      };
    }
  }

  // Pass 1b: Match templates whose JavaScript expression formatting changed.
  // This preserves the old semantic version while retaining the new raw-source
  // pieces required by the patch locator.
  let sourceShapeMatches = 0;
  for (let idx = 0; idx < newData.prompts.length; idx++) {
    if (results[idx] !== null) continue;
    const newItem = newData.prompts[idx];
    const oldIdx = oldData.prompts.findIndex((oldItem, oi) => {
      if (claimedOld.has(oi) || !oldItem.name) return false;
      return sourceShapeEquivalent(newItem, oldItem);
    });

    if (oldIdx === -1) continue;
    const matchingOld = oldData.prompts[oldIdx];
    claimedOld.add(oldIdx);
    sourceShapeMatches++;
    results[idx] = {
      ...newItem,
      name: matchingOld.name,
      id: matchingOld.id || slugify(matchingOld.name),
      description: matchingOld.description,
      identifierMap: mergeIdentifierMapByContext(newItem, matchingOld),
      version: matchingOld.version || currentVersion,
    };
  }
  if (sourceShapeMatches > 0) {
    perfLog(
      `pass 1b (source-shape equivalent): ${sourceShapeMatches} prompt${sourceShapeMatches === 1 ? '' : 's'} kept their prior version`
    );
  }

  // Pass 2: Fuzzy match remaining prompts using Damerau-Levenshtein similarity.
  // Collect all (newIdx, oldIdx, similarity) pairs above threshold, then assign
  // greedily best-first so two new prompts don't fight over the same old one.
  if (PERF) {
    perfLog(
      `pass 1 (exact match) done in ${fmtMs(process.hrtime.bigint() - pass1T0)}`
    );
    dlReport('pass 1', pass1Before);
  }
  const unmatchedAfterPass1 = results.filter(r => r === null).length;
  perfLog(
    `pass 2 (fuzzy) starting: ${unmatchedAfterPass1} prompts still unmatched`
  );
  const pass2Before = dlSnapshot();
  const pass2T0 = process.hrtime.bigint();
  const candidates = [];

  for (let idx = 0; idx < newData.prompts.length; idx++) {
    if (results[idx] !== null) continue; // already matched exactly
    const newContent = reconstructContent(newData.prompts[idx]);

    for (let oi = 0; oi < oldData.prompts.length; oi++) {
      if (claimedOld.has(oi)) continue;
      // Only fuzzy-match named old prompts — unnamed ones have no metadata to carry
      if (!oldData.prompts[oi].name) continue;

      const sim = damerauLevenshteinSimilarity(
        newContent,
        oldContents[oi],
        SIMILARITY_THRESHOLD
      );
      if (sim >= SIMILARITY_THRESHOLD) {
        candidates.push({ newIdx: idx, oldIdx: oi, sim });
      }
    }
  }

  // Sort by similarity descending — best matches get assigned first
  candidates.sort((a, b) => b.sim - a.sim);

  for (const { newIdx, oldIdx, sim } of candidates) {
    if (results[newIdx] !== null) continue; // new prompt already claimed
    if (claimedOld.has(oldIdx)) continue; // old prompt already claimed

    const newItem = newData.prompts[newIdx];
    const matchingOld = oldData.prompts[oldIdx];
    claimedOld.add(oldIdx);

    console.log(
      bullet(
        glyph.fuzzy,
        `${c.dim('fuzzy match')}  ${c.bold(matchingOld.name)}  ` +
          `${c.magenta(pct(sim))} ${glyph.arrow} ${c.dim('v' + currentVersion)}`
      )
    );

    results[newIdx] = applyOldMetadata(newItem, matchingOld);
  }

  // Pass 3: Anything still unmatched is a genuinely new prompt.
  // For each, find the closest old prompt (even below threshold) as a hint.
  if (PERF) {
    perfLog(
      `pass 2 (fuzzy) done in ${fmtMs(process.hrtime.bigint() - pass2T0)}: ${candidates.length} candidate pairs above threshold`
    );
    dlReport('pass 2', pass2Before);
  }
  const unmatchedAfterPass2 = results.filter(r => r === null).length;
  perfLog(
    `pass 3 (closest-match hint) starting: ${unmatchedAfterPass2} prompts still unmatched`
  );
  const pass3Before = dlSnapshot();
  const pass3T0 = process.hrtime.bigint();
  for (let idx = 0; idx < newData.prompts.length; idx++) {
    if (results[idx] !== null) continue;
    const newItem = newData.prompts[idx];
    const newContent = reconstructContent(newItem);

    let bestSim = 0;
    let bestOldIdx = -1;
    for (let oi = 0; oi < oldData.prompts.length; oi++) {
      if (claimedOld.has(oi)) continue;
      if (!oldData.prompts[oi].name) continue;
      const sim = damerauLevenshteinSimilarity(
        newContent,
        oldContents[oi],
        0.4 // low threshold just to find the closest candidate
      );
      if (sim > bestSim) {
        bestSim = sim;
        bestOldIdx = oi;
      }
    }

    const bestMatch = bestOldIdx === -1 ? null : oldData.prompts[bestOldIdx];

    let bestHistorical = null;
    let bestHistoricalSim = 0;
    for (const candidate of historicalRemovedCandidates) {
      const candidateId = candidate.prompt.id || slugify(candidate.prompt.name);
      if (claimedHistoricalIds.has(candidateId)) continue;

      let sim;
      if (
        candidate.content === newContent &&
        JSON.stringify(candidate.prompt.identifiers || []) ===
          JSON.stringify(newItem.identifiers || [])
      ) {
        sim = 1;
      } else {
        sim = Math.max(
          damerauLevenshteinSimilarity(
            newContent,
            candidate.content,
            HISTORICAL_HINT_THRESHOLD
          ),
          lineOverlapSimilarity(newContent, candidate.content),
          headingAnchorSimilarity(newContent, candidate.content)
        );
      }

      if (sim > bestHistoricalSim) {
        bestHistoricalSim = sim;
        bestHistorical = candidate;
      }
    }

    if (
      bestHistorical &&
      bestHistoricalSim >= HISTORICAL_SIMILARITY_THRESHOLD
    ) {
      const historicalId =
        bestHistorical.prompt.id || slugify(bestHistorical.prompt.name);
      claimedHistoricalIds.add(historicalId);
      const matchType =
        bestHistoricalSim === 1 ? 're-added' : 're-added (changed)';
      console.log(
        bullet(
          glyph.readd,
          `${c.dim(matchType)}  ${c.bold(bestHistorical.prompt.name)}  ` +
            `${c.cyan('v' + bestHistorical.version)} ${c.cyan(pct(bestHistoricalSim))} ` +
            `${glyph.arrow} ${c.dim('v' + currentVersion)}`
        )
      );
      results[idx] = applyOldMetadata(newItem, bestHistorical.prompt);
      continue;
    }

    item(
      glyph.fresh,
      `${c.bold('new prompt')} ${c.dim('#' + idx)}  ${c.italic(clip(newContent, 60))}`
    );
    if (bestHistorical && bestHistoricalSim >= HISTORICAL_HINT_THRESHOLD) {
      console.log(
        `      ${glyph.readd} ${c.cyan('historical re-add candidate')}`
      );
      detail('name', `${c.bold(bestHistorical.prompt.name)}`);
      detail('last seen', `v${bestHistorical.version}`);
      detail('score', c.cyan(pct(bestHistoricalSim)));
      detail(
        'id',
        bestHistorical.prompt.id || slugify(bestHistorical.prompt.name)
      );

      const historicalId =
        bestHistorical.prompt.id || slugify(bestHistorical.prompt.name);
      claimedHistoricalIds.add(historicalId);
      results[idx] = applyHistoricalCandidateMetadata(
        newItem,
        bestHistorical,
        bestHistoricalSim
      );
      console.log(
        `      ${glyph.warn} ${c.boldYellow('wrote review-required historical candidate metadata')}`
      );
      continue;
    }

    if (bestMatch && bestSim >= HISTORICAL_HINT_THRESHOLD) {
      console.log(`      ${glyph.fuzzy} ${c.magenta('closest match')}`);
      detail('name', `${c.bold(bestMatch.name)}`);
      detail('score', c.magenta(pct(bestSim)));
      detail('id', bestMatch.id || slugify(bestMatch.name));

      claimedOld.add(bestOldIdx);
      results[idx] = applyOldCandidateMetadata(newItem, bestMatch, bestSim);
      console.log(
        `      ${glyph.warn} ${c.boldYellow('wrote review-required old metadata match')}`
      );
      continue;
    }

    results[idx] = {
      ...newItem,
      id: slugify(newItem.name),
      version: currentVersion,
    };
  }

  if (PERF) {
    perfLog(
      `pass 3 (closest-match hint) done in ${fmtMs(process.hrtime.bigint() - pass3T0)}`
    );
    dlReport('pass 3', pass3Before);
    perfLog(
      `merge total wall time: ${fmtMs(process.hrtime.bigint() - mergeT0)}`
    );
    perfLog(
      `DL grand total: ${dlStats.calls} comparisons, ${dlStats.skippedByLength} skipped by length, ` +
        `${dlStats.bandCapped} band-capped (>${DL_MAX_BAND}), ` +
        `${dlStats.cellsComputed.toLocaleString()} cells, ${fmtMs(dlStats.totalNs)} in DP` +
        (dlStats.maxPair
          ? `; slowest single comparison ${fmtMs(dlStats.maxNs)} on lengths ${dlStats.maxPair[0]}×${dlStats.maxPair[1]}`
          : '')
    );
  }

  return { prompts: results };
}

// ─── Agent metadata extraction ──────────────────────────────────────────────
//
// Built-in agents in cli.js are defined as object literals with properties like
// agentType, model, disallowedTools, whenToUse, tools, permissionMode, color,
// criticalSystemReminder_EXPERIMENTAL, etc.  These are the runtime configuration
// that controls how each sub-agent behaves — distinct from the system prompt text.
//
// This section extracts that metadata and attaches it to the matching prompt
// entries so it can flow through the pipeline into frontmatter.

const KNOWN_TOOL_NAMES = [
  // 'Agent' is the display name of the Task tool since CC 2.1.113, which
  // renamed the variable binding so the source now has `vK="Agent"` with
  // `dh="Task"` held separately. Keep both — old versions bind "Task" to the
  // tool-ref variable, new versions bind "Agent".
  'Task',
  'Agent',
  'Artifact',
  'ExitPlanMode',
  'Edit',
  'Write',
  'NotebookEdit',
  'Glob',
  'Grep',
  'Read',
  'Bash',
  'WebFetch',
  'WebSearch',
  'EnterPlanMode',
  'AskUserQuestion',
  'TodoWrite',
  'Sleep',
  'Computer',
  'Skill',
  'SendMessage',
  'SendMessageTool',
  'SendUserMessage',
  'LSP',
  'CronCreate',
  'CronDelete',
  'CronList',
  'Monitor',
  'ScheduleWakeup',
  'TaskCreate',
  'TaskGet',
  'TaskList',
  'TaskStop',
  'TaskUpdate',
  'PowerShell',
  'PushNotification',
  'RemoteTrigger',
  'REPL',
  'SendUserFile',
  'ShareOnboardingGuide',
  'EnterWorktree',
  'ExitWorktree',
  'ToolSearch',
  'TeamCreate',
  'TeamDelete',
  'Workflow',
];

const TOOL_NAME_PATTERN =
  /^(?:Agent|Ask|Bash|Browser|Computer|Cron|Edit|Enter|Exit|Glob|Grep|LSP|Monitor|Notebook|Power|Push|Read|Remote|REPL|Schedule|Search|Send|Share|Skill|Sleep|Task|Team|Teammate|Todo|Tool|Web|Workflow|Write)[A-Za-z0-9_]*$/;
const TOOL_REF_TOKEN_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const PLAUSIBLE_TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a map of minified variable names → tool name strings */
function buildToolNameMap(source) {
  const varMap = {};
  const toolNames = new Set(KNOWN_TOOL_NAMES);
  const assignmentRegex =
    /(?<![a-zA-Z0-9_$])([a-zA-Z_$][a-zA-Z0-9_$]{0,4})\s*=\s*["']([A-Za-z][A-Za-z0-9_]{2,})["']/g;
  let assignmentMatch;

  while ((assignmentMatch = assignmentRegex.exec(source)) !== null) {
    const [, varName, value] = assignmentMatch;
    if (toolNames.has(value) || TOOL_NAME_PATTERN.test(value)) {
      varMap[varName] = value;
      toolNames.add(value);
    }
  }

  return varMap;
}

/** Resolve a short minified variable name to its string value.
 *  Uses a non-identifier lookbehind instead of \b, because \b doesn't
 *  work correctly for variable names starting with $ (e.g. $08). */
function resolveVar(source, varName) {
  // (?<![a-zA-Z0-9_$]) prevents matching a suffix of a longer identifier
  const prefix = '(?<![a-zA-Z0-9_$])';
  const dq = new RegExp(`${prefix}${escapeRe(varName)}\\s*=\\s*"([^"]*)"`);
  const m1 = source.match(dq);
  if (m1) return m1[1];
  const sq = new RegExp(`${prefix}${escapeRe(varName)}\\s*=\\s*'([^']*)'`);
  const m2 = source.match(sq);
  if (m2) return m2[1];
  return null;
}

/** Resolve a variable reference or string literal to a tool name */
function resolveToolRef(token, toolNameMap, source) {
  const strMatch = token.match(/^["'](.+)["']$/);
  if (strMatch) return strMatch[1];
  if (toolNameMap[token]) return toolNameMap[token];

  if (source && TOOL_REF_TOKEN_PATTERN.test(token)) {
    const value = resolveVar(source, token);
    if (value && PLAUSIBLE_TOOL_NAME_PATTERN.test(value)) {
      toolNameMap[token] = value;
      return value;
    }
  }

  return token;
}

function canonicalizeMetadataTemplateVars(text, toolNameMap) {
  return text.replace(
    /\$\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}/g,
    (match, varName) => {
      if (toolNameMap[varName] === 'SendMessage')
        return '${SEND_MESSAGE_TOOL_NAME}';
      return match;
    }
  );
}

/** Extract a string-valued property from an object literal text */
function extractStringProp(objText, propName, toolNameMap = {}) {
  const dq = objText.match(
    new RegExp(`${escapeRe(propName)}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 's')
  );
  if (dq)
    return decodeUnicodeEscapes(
      dq[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
    );
  const sq = objText.match(
    new RegExp(`${escapeRe(propName)}:\\s*'((?:[^'\\\\]|\\\\.)*)'`, 's')
  );
  if (sq) return decodeUnicodeEscapes(sq[1].replace(/\\'/g, "'"));
  const tl = objText.match(
    new RegExp(`${escapeRe(propName)}:\\s*\`((?:[^\`\\\\]|\\\\.)*)\``, 's')
  );
  if (tl)
    return canonicalizeMetadataTemplateVars(
      decodeUnicodeEscapes(tl[1]),
      toolNameMap
    );
  return null;
}

function extractStringPropOrVar(objText, propName, toolNameMap, source) {
  const literal = extractStringProp(objText, propName, toolNameMap);
  if (literal) return literal;

  const ref = objText.match(
    new RegExp(`${escapeRe(propName)}:\\s*([a-zA-Z_$][a-zA-Z0-9_$]*)`)
  );
  if (!ref) return null;

  const value = resolveVar(source, ref[1]);
  return value ? decodeUnicodeEscapes(value) : null;
}

/** Find all built-in agent definition objects in the source */
function findBuiltInAgentObjects(source) {
  const results = [];
  const regex = /\bagentType:\s*(?:"([^"]+)"|([a-zA-Z_$][a-zA-Z0-9_$]*))/g;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const literalName = match[1];
    const varRef = match[2];
    const pos = match.index;

    // Walk backward to find the opening brace
    let depth = 0,
      objStart = pos;
    for (let i = pos; i >= Math.max(0, pos - 5000); i--) {
      if (source[i] === '}') depth++;
      if (source[i] === '{') {
        if (depth === 0) {
          objStart = i;
          break;
        }
        depth--;
      }
    }

    // Walk forward to find the matching closing brace
    depth = 0;
    let objEnd = objStart;
    for (let i = objStart; i < Math.min(source.length, objStart + 20000); i++) {
      if (source[i] === '{') depth++;
      if (source[i] === '}') {
        depth--;
        if (depth === 0) {
          objEnd = i + 1;
          break;
        }
      }
    }

    const objText = source.slice(objStart, objEnd);

    // Only keep objects with source:"built-in" (whitespace-agnostic for minified code)
    if (!/source:\s*"built-in"/.test(objText)) continue;

    // Resolve the agentType
    let agentType = literalName;
    if (!agentType && varRef) {
      agentType = resolveVar(source, varRef);
      if (!agentType) agentType = `(unresolved: ${varRef})`;
    }

    // Skip duplicates and structural agent types
    if (results.find(r => r.agentType === agentType)) continue;
    if (['main-session', 'teammate', 'subagent'].includes(agentType)) continue;

    results.push({
      agentType,
      objText,
      startIndex: objStart,
      endIndex: objEnd,
    });
  }

  return results;
}

/** Extract metadata fields from a single agent object literal */
function extractAgentObjectMetadata(objText, toolNameMap, source) {
  const m = {};

  // model
  const model = objText.match(/\bmodel:\s*"([^"]+)"/);
  if (model) m.model = model[1];

  // color
  const color = objText.match(/\bcolor:\s*"([^"]+)"/);
  if (color) m.color = color[1];

  // permissionMode
  const perm = objText.match(/\bpermissionMode:\s*"([^"]+)"/);
  if (perm) m.permissionMode = perm[1];

  // maxTurns
  const mt = objText.match(/\bmaxTurns:\s*(\d+)/);
  if (mt) m.maxTurns = parseInt(mt[1]);

  // whenToUse — string literal
  m.whenToUse = extractStringPropOrVar(
    objText,
    'whenToUse',
    toolNameMap,
    source
  );

  // whenToUse — getter function (e.g. get whenToUse(){return bc9()})
  if (!m.whenToUse) {
    const getter = objText.match(
      /get whenToUse\(\)\s*\{[\s\S]*?return\s+([^;}\s]+)/
    );
    if (getter) {
      const callMatch = getter[0].match(/return\s+(\w+)\(\)/);
      if (callMatch) {
        // Find the function body and extract the LAST return value
        // (the default case, not an early conditional return)
        const fnBodyRegex = new RegExp(
          `function ${escapeRe(callMatch[1])}\\(\\)\\{([^}]*)}`
        );
        const fnBodyMatch = source.match(fnBodyRegex);
        let fnReturnVar = null;
        if (fnBodyMatch) {
          const returns = [
            ...fnBodyMatch[1].matchAll(/return\s+(\w+)(?:[;},\n]|$)/g),
          ];
          if (returns.length > 0) fnReturnVar = returns[returns.length - 1][1];
        }
        if (fnReturnVar) {
          const defaultVar = fnReturnVar;
          // Try single-quoted (use non-identifier lookbehind for $-prefixed vars)
          const prefix = '(?<![a-zA-Z0-9_$])';
          const sqm = source.match(
            new RegExp(
              `${prefix}${escapeRe(defaultVar)}\\s*=\\s*'((?:[^'\\\\]|\\\\.)*)'`,
              's'
            )
          );
          if (sqm)
            m.whenToUse = decodeUnicodeEscapes(sqm[1].replace(/\\'/g, "'"));
          if (!m.whenToUse) {
            const dqm = source.match(
              new RegExp(
                `${prefix}${escapeRe(defaultVar)}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`,
                's'
              )
            );
            if (dqm)
              m.whenToUse = decodeUnicodeEscapes(dqm[1].replace(/\\"/g, '"'));
          }
        }
      }
      m.whenToUseDynamic = true;
    }
  }

  // tools
  const toolsArr = objText.match(/\btools:\s*\[([^\]]*)\]/);
  if (toolsArr) {
    m.tools = toolsArr[1]
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => resolveToolRef(t, toolNameMap, source));
  }
  // tools referencing another agent object
  if (!toolsArr) {
    const toolsRef = objText.match(/\btools:\s*(\w+)\.tools\b/);
    if (toolsRef) m.toolsInheritedFrom = toolsRef[1];
  }

  // disallowedTools
  const dtArr = objText.match(/\bdisallowedTools:\s*\[([^\]]*)\]/);
  if (dtArr) {
    m.disallowedTools = dtArr[1]
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => resolveToolRef(t, toolNameMap, source));
  }

  // criticalSystemReminder_EXPERIMENTAL
  const crit = extractStringProp(
    objText,
    'criticalSystemReminder_EXPERIMENTAL',
    toolNameMap
  );
  if (crit) m.criticalSystemReminder = crit;

  return m;
}

/**
 * Match agent definitions to prompt entries by comparing the agent's system
 * prompt text against the reconstructed content of each prompt entry.
 *
 * Handles multiple getSystemPrompt patterns found in cli.js:
 *   1. getSystemPrompt: () => varName         (variable reference)
 *   2. getSystemPrompt:\n  () => `...`         (inline template literal)
 *   3. getSystemPrompt({ ... }) { ... }        (method with params)
 *   4. getSystemPrompt: () => ""               (empty — no prompt to match)
 */
const AGENT_PROMPT_ID_OVERRIDES = Object.freeze({
  Plan: 'agent-prompt-plan-mode-enhanced',
  'claude-code-guide': 'agent-prompt-claude-guide-agent',
  'web-fetch': 'agent-prompt-web-reading-specialist',
  fork: 'agent-prompt-worker-fork',
});

function matchAgentToPromptEntry(agentObj, source, prompts) {
  const { objText } = agentObj;

  // Some built-in agents do not expose a directly matchable prompt string:
  // - Plan returns a dynamically assembled template.
  // - claude-code-guide wraps a dynamic prompt builder in a method body.
  // - web-fetch references a standalone prompt-builder function directly.
  // - fork has an empty getSystemPrompt; its model-facing text is the fork
  //   directive injected into the child conversation.
  // Keep these source-grounded associations explicit instead of guessing from
  // the first prompt whose name happens to contain the agent type.
  const overrideId = AGENT_PROMPT_ID_OVERRIDES[agentObj.agentType];
  if (overrideId) {
    return prompts.find(prompt => prompt.id === overrideId) || null;
  }

  let promptSnippet = null;

  // Pattern 1: getSystemPrompt: () => varName  (arrow returning a variable)
  const varRefMatch = objText.match(
    /getSystemPrompt:\s*\(?[^)]*\)?\s*=>\s*([a-zA-Z_$]\w+)\s*[,;}\n]/
  );
  if (varRefMatch) {
    const varName = varRefMatch[1];

    // Find where this variable is assigned — template literal
    const tlRegex = new RegExp(
      `\\b${escapeRe(varName)}\\s*=\\s*\`([\\s\\S]*?)\``
    );
    const tlMatch = source.match(tlRegex);
    if (tlMatch) {
      promptSnippet = tlMatch[1].slice(0, 200);
    }

    // Try string literal
    if (!promptSnippet) {
      const slRegex = new RegExp(
        `\\b${escapeRe(varName)}\\s*=\\s*"((?:[^"\\\\]|\\\\.){50,})"`
      );
      const slMatch = source.match(slRegex);
      if (slMatch) {
        promptSnippet = slMatch[1].slice(0, 200);
      }
    }
  }

  // Pattern 2: getSystemPrompt:\n  () => `...`  (inline template literal)
  if (!promptSnippet) {
    const inlineTLMatch = objText.match(
      /getSystemPrompt:\s*\(?[^)]*\)?\s*=>\s*`([\s\S]*?)`/
    );
    if (inlineTLMatch) {
      promptSnippet = inlineTLMatch[1].slice(0, 200);
    }
  }

  // Pattern 3: getSystemPrompt(...) { ... return varName; }  (method body)
  // Uses brace-depth tracking to correctly extract the full method body,
  // since the method may contain nested braces (if blocks, arrow functions, etc.)
  if (!promptSnippet) {
    const gsIdx = objText.indexOf('getSystemPrompt');
    if (gsIdx !== -1) {
      // Skip past the parameter list (...) to find the method body opening brace.
      // The parameter list may contain destructuring braces like { toolUseContext: A }
      // so we need to find the closing ) of the params first, then the next {.
      let parenStart = objText.indexOf('(', gsIdx);
      let bodyBracePos = -1;
      if (parenStart !== -1) {
        let parenDepth = 0;
        for (let i = parenStart; i < objText.length; i++) {
          if (objText[i] === '(') parenDepth++;
          if (objText[i] === ')') {
            parenDepth--;
            if (parenDepth === 0) {
              // Found closing paren — next { is the method body
              bodyBracePos = objText.indexOf('{', i + 1);
              break;
            }
          }
        }
      }
      const braceStart = bodyBracePos;
      if (braceStart !== -1) {
        // Track depth to find the matching closing brace
        let depth = 0,
          braceEnd = -1;
        for (let i = braceStart; i < objText.length; i++) {
          if (objText[i] === '{') depth++;
          if (objText[i] === '}') {
            depth--;
            if (depth === 0) {
              braceEnd = i;
              break;
            }
          }
        }
        if (braceEnd !== -1) {
          const body = objText.slice(braceStart + 1, braceEnd);
          const returnMatches = [
            ...body.matchAll(/return\s+([a-zA-Z_$]\w*)(?:[;},\n]|$)/g),
          ];
          if (returnMatches.length > 0) {
            const lastReturn = returnMatches[returnMatches.length - 1];
            let resolveTarget = lastReturn[1];

            // The return variable might be a local that references another variable
            // via a template literal like: O = `${mc9}\n${H}`
            // In that case, resolve the first referenced variable instead.
            const localAssign = body.match(
              new RegExp(
                `\\b${escapeRe(resolveTarget)}\\s*=\\s*\`\\$\\{(\\w+)\\}`
              )
            );
            if (localAssign) {
              resolveTarget = localAssign[1];
            }

            // Resolve the target variable in the broader source
            const tlRegex = new RegExp(
              `\\b${escapeRe(resolveTarget)}\\s*=\\s*\`([\\s\\S]*?)\``
            );
            const tlMatch = source.match(tlRegex);
            if (tlMatch) {
              promptSnippet = tlMatch[1].slice(0, 200);
            }
          }
        }
      }
    }
  }

  // An unresolved or empty getSystemPrompt is not enough evidence to attach
  // metadata. Guessing by agent-type substring previously attached Plan
  // metadata to a memory bullet and claude-code-guide metadata to the SDK
  // compaction prompt. Explicit associations belong in the override table.
  if (!promptSnippet) return null;

  // Clean the snippet (remove template interpolations for matching)
  const cleanSnippet = promptSnippet
    .replace(/\$\{[^}]+\}/g, '')
    .slice(0, 150)
    .trim();
  if (cleanSnippet.length < 20) return null;

  // Find the prompt entry whose content starts with the same text
  for (const prompt of prompts) {
    const content = prompt.pieces.join('');
    const cleanContent = content.slice(0, 150);
    if (
      cleanContent.includes(cleanSnippet.slice(0, 80)) ||
      cleanSnippet.includes(cleanContent.slice(0, 80))
    ) {
      return prompt;
    }
  }

  return null;
}

// ─── Metadata overrides (data-driven naming) ────────────────────────────────
// First-appearance prompts that carryover can't name yet (e.g. a newly surfaced
// sub-500 tool-description variant) get their metadata from data/metadata.json
// rather than a hand-edit. Applied to any still-unnamed prompt whose pieces[0]
// satisfies the entry's `match` (all substrings present) and `exclude` (none
// present) anchors. A missing or non-array metadata.json is a silent no-op.
function applyMetadataOverrides(prompts) {
  let entries;
  try {
    entries = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', 'data', 'metadata.json'),
        'utf-8'
      )
    );
  } catch {
    return 0;
  }
  if (!Array.isArray(entries)) return 0;
  let applied = 0;
  for (const prompt of prompts) {
    if (prompt.id) continue;
    const head = (prompt.pieces && prompt.pieces[0]) || '';
    const entry = entries.find(e => {
      const match = e.match || [];
      const exclude = e.exclude || [];
      return (
        match.length > 0 &&
        match.every(s => head.includes(s)) &&
        !exclude.some(s => head.includes(s))
      );
    });
    if (entry) {
      prompt.id = entry.id;
      prompt.name = entry.name;
      prompt.description = entry.description;
      applied++;
    }
  }
  return applied;
}

/**
 * Main agent metadata extraction function.
 * Finds all built-in agent definitions in cli.js source, extracts their
 * metadata, and attaches it to matching prompt entries.
 *
 * Returns the number of prompts that had metadata attached.
 */
function attachAgentMetadata(source, prompts) {
  const toolNameMap = buildToolNameMap(source);
  const agentObjects = findBuiltInAgentObjects(source);

  let attached = 0;

  for (const agentObj of agentObjects) {
    const metadata = extractAgentObjectMetadata(
      agentObj.objText,
      toolNameMap,
      source
    );
    metadata.agentType = agentObj.agentType;

    // Resolve toolsInheritedFrom: find which agent the variable points to,
    // then look up that agent's resolved tools list.
    if (metadata.toolsInheritedFrom) {
      const refVarName = metadata.toolsInheritedFrom;
      // Search source for `refVarName = { agentType: "..." ...` to find which agent it is
      const refRegex = new RegExp(
        `\\b${escapeRe(refVarName)}\\s*=\\s*\\{[\\s\\S]{0,500}?agentType:\\s*"([^"]+)"`
      );
      const refMatch = source.match(refRegex);
      const refAgentType = refMatch ? refMatch[1] : null;

      if (refAgentType) {
        const refAgent = agentObjects.find(a => a.agentType === refAgentType);
        if (refAgent) {
          const refMeta = extractAgentObjectMetadata(
            refAgent.objText,
            toolNameMap,
            source
          );
          if (refMeta.tools) {
            metadata.tools = refMeta.tools;
            metadata.toolsNote = `(same tools as ${refAgentType} agent)`;
          }
        }
      }
      delete metadata.toolsInheritedFrom;
    }

    const matchedPrompt = matchAgentToPromptEntry(agentObj, source, prompts);
    if (matchedPrompt) {
      matchedPrompt.agentMetadata = metadata;
      attached++;
      item(
        glyph.info,
        `${c.bold(agentObj.agentType)} ${glyph.arrow} ${c.dim(`"${matchedPrompt.name || matchedPrompt.id}"`)}`
      );
    } else {
      console.warn(
        bullet(
          glyph.warn,
          `${c.dim('no prompt matched for agent')} ${c.bold(agentObj.agentType)}`
        )
      );
    }
  }

  return attached;
}

// CLI
if (require.main === module) {
  // Pull flags out of argv so the positional args keep their meaning.
  const rawArgs = process.argv.slice(2);
  VERBOSE = rawArgs.includes('--verbose') || rawArgs.includes('-v');
  const args = rawArgs.filter(a => a !== '--verbose' && a !== '-v');

  // --sort mode: re-sort an existing prompts file by id and exit
  if (args[0] === '--sort') {
    const sortFile = args[1];
    if (!sortFile) {
      console.error(
        bullet(
          glyph.skip,
          'usage: node promptExtractor.js --sort <prompts-file>'
        )
      );
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(sortFile, 'utf-8'));
    data.prompts.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    fs.writeFileSync(sortFile, JSON.stringify(data, null, 2) + '\n');
    item(
      glyph.ok,
      `sorted ${c.bold(data.prompts.length)} prompts by id ${glyph.arrow} ${c.dim(sortFile)}`
    );
    process.exit(0);
  }

  const filepath = args[0];

  if (!filepath) {
    console.error(
      bullet(
        glyph.skip,
        'usage: node promptExtractor.js <path-to-cli.js> [output-file] [--verbose]'
      )
    );
    console.error(
      `        ${c.dim('node promptExtractor.js --sort <prompts-file>')}`
    );
    process.exit(1);
  }

  const outputFile = args[1] || 'prompts.json';

  console.log('');
  console.log(`${c.boldCyan('promptExtractor')}`);
  section('Input');
  field('source', filepath);

  // Try to read existing output file
  let existingData = null;
  if (fs.existsSync(outputFile)) {
    try {
      const existingContent = fs.readFileSync(outputFile, 'utf-8');
      existingData = JSON.parse(existingContent);
      field(
        'existing',
        `${outputFile} ${c.dim(`· ${existingData.prompts?.length || 0} prompts`)}`
      );
    } catch (err) {
      field('existing', c.yellow(`unreadable (${err.message})`));
    }
  } else {
    field('existing', c.dim('none'));
  }

  // Look for package.json alongside the input file
  const inputDir = path.dirname(path.resolve(filepath));
  const packageJsonPath = path.join(inputDir, 'package.json');

  let version = null;
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      version = packageJson.version;
      field('version', version);
    } catch (err) {
      field('version', c.yellow(`unreadable package.json (${err.message})`));
    }
  } else {
    field('version', c.dim('unknown'));
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

  section('Extracting strings');
  const extractT0 = process.hrtime.bigint();
  const result = extractStrings(filepath);
  item(
    glyph.ok,
    `${c.bold(result.prompts.length)} prompts parsed and filtered` +
      (PERF ? c.gray(`  (${fmtMs(process.hrtime.bigint() - extractT0)})`) : '')
  );
  const skips = skipSummary();
  if (skips) {
    item(
      glyph.skip,
      `${c.dim('skipped')} ${skips}` +
        (VERBOSE ? '' : c.dim('  · --verbose to list'))
    );
  }
  // Replace version in newly extracted strings BEFORE merging
  const versionReplacedResult = replaceVersionInPrompts(result, version);

  const mergeT0 = process.hrtime.bigint();
  const mergedResult = mergeWithExisting(
    versionReplacedResult,
    existingData,
    version,
    { outputFile }
  );
  perfLog(
    `mergeWithExisting: completed in ${fmtMs(process.hrtime.bigint() - mergeT0)}`
  );

  section('Metadata overrides');
  const overrideCount = applyMetadataOverrides(mergedResult.prompts);
  item(
    glyph.ok,
    `applied metadata to ${c.bold(overrideCount)} prompt${overrideCount === 1 ? '' : 's'} from metadata.json`
  );

  // Extract agent metadata from cli.js and attach to matching prompt entries
  section('Agent metadata');
  const cliSource = fs.readFileSync(filepath, 'utf-8');
  const agentT0 = process.hrtime.bigint();
  const attachedCount = attachAgentMetadata(cliSource, mergedResult.prompts);
  perfLog(
    `attachAgentMetadata: completed in ${fmtMs(process.hrtime.bigint() - agentT0)}`
  );
  item(glyph.ok, `attached metadata to ${c.bold(attachedCount)} agents`);

  // Sort prompts by id (stable across versions) so that diffs between versions
  // are meaningful — content changes won't shuffle unrelated prompts around.
  // Unnamed prompts (id='') sort to the top where they're easy to spot.
  mergedResult.prompts.sort((a, b) => a.id.localeCompare(b.id));

  // Remove internal fields before writing
  mergedResult.prompts = mergedResult.prompts.map(
    ({ start, end, ...rest }) => rest
  );

  // Add version as top-level field
  const outputData = {
    version,
    ...mergedResult,
  };

  fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2) + '\n');

  section('Done');
  item(
    glyph.ok,
    `${c.bold(mergedResult.prompts.length)} prompts ${glyph.arrow} ${c.dim(outputFile)}`
  );
  console.log('');
}

module.exports = extractStrings;
module.exports.__test = {
  attachAgentMetadata,
  matchAgentToPromptEntry,
  mergeWithExisting,
  resolveStaticStringExpression,
};
