#!/usr/bin/env node
/**
 * Patch Claude Code CLI (v2.1.5) to force Winter theme + render winter clawd logo.
 *
 * Usage:
 *   node patch_winter_215.js /path/to/cli.js
 *
 * It edits the file in-place and writes a .bak backup next to it.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const TARGET_VERSION = '2.1.5';
const MARKER = '__WINTER_THEME_PATCH_2_1_5__';

/**
 * Prints error message and exits with given code.
 * @param {string} msg - Error message to display.
 * @param {number} [code=1] - Exit code.
 */
function die(msg, code = 1) {
  console.error(`[winter-patch] ${msg}`);
  process.exit(code);
}

/**
 * Reads file contents as UTF-8 string.
 * @param {string} p - File path.
 * @returns {string} File contents.
 */
function readFile(p) {
  return fs.readFileSync(p, 'utf8');
}

/**
 * Writes string to file as UTF-8.
 * @param {string} p - File path.
 * @param {string} s - Content to write.
 */
function writeFile(p, s) {
  fs.writeFileSync(p, s, 'utf8');
}

/**
 * Checks if source contains the target version marker.
 * @param {string} src - Source code to check.
 * @returns {boolean} True if version marker found.
 */
function hasVersion(src) {
  return src.includes(`// Version: ${TARGET_VERSION}`) || src.includes(`VERSION:"${TARGET_VERSION}"`);
}

/**
 * Applies regex replacement once and returns result with change status.
 * @param {string} src - Source code.
 * @param {RegExp} re - Regex pattern.
 * @param {Function} replacer - Replacement function.
 * @param {string} label - Label for this patch step.
 * @returns {{src: string, changed: boolean, label: string}} Result object.
 */
function applyRegexOnce(src, re, replacer, label) {
  const before = src;
  src = src.replace(re, replacer);
  if (src === before) return { src, changed: false, label };
  return { src, changed: true, label };
}

/**
 * Patches the theme hook to always return "winter" theme.
 * @param {string} src - Source code.
 * @returns {{src: string, changed: boolean, label: string}} Result object.
 */
function patchForceWinterInThemeHook(src) {
  // Force theme everywhere by patching the tiny theme hook:
  // function XX(){let{currentTheme:A,setTheme:Q}=YY.useContext(ZZ);return[A,Q]}
  if (src.includes('return["winter"') || src.includes("return['winter'")) {
    return { src, changed: false, label: 'force-winter-hook' };
  }

  // Dynamic pattern: capture function name and setter variable
  const re = /function\s+([$\w]+)\s*\(\s*\)\s*\{\s*let\s*\{\s*currentTheme\s*:\s*([$\w]+)\s*,\s*setTheme\s*:\s*([$\w]+)\s*\}\s*=\s*([$\w]+)\.useContext\s*\(\s*([$\w]+)\s*\)\s*;\s*return\s*\[\s*([$\w]+)\s*,\s*([$\w]+)\s*\]\s*;?\s*\}/;
  const match = src.match(re);
  if (!match) {
    // Try lenient fallback (bounded to avoid ReDoS)
    const lenientRe = /function\s+([$\w]+)\s*\(\s*\)\s*\{[^}]{0,500}currentTheme[^}]{0,500}setTheme[^}]{0,500}return\s*\[\s*([$\w]+)\s*,\s*([$\w]+)\s*\]\s*;?\s*\}/;
    const lenientMatch = src.match(lenientRe);
    if (!lenientMatch) {
      return { src, changed: false, label: 'force-winter-hook' };
    }
    const [fullMatch, funcName, , setterVar] = lenientMatch;
    const newFunc = fullMatch.replace(
      /return\s*\[\s*([$\w]+)\s*,\s*([$\w]+)\s*\]/,
      `return["winter",${setterVar}]`
    );
    const newSrc = src.replace(fullMatch, newFunc);
    return { src: newSrc, changed: newSrc !== src, label: 'force-winter-hook' };
  }

  const [fullMatch, funcName, , setterVar] = match;
  const newFunc = fullMatch.replace(
    /return\s*\[\s*([$\w]+)\s*,\s*([$\w]+)\s*\]/,
    `return["winter",${setterVar}]`
  );
  const newSrc = src.replace(fullMatch, newFunc);
  return { src: newSrc, changed: newSrc !== src, label: 'force-winter-hook' };
}

/**
 * Adds case"winter" to the theme switch statement.
 * @param {string} src - Source code.
 * @returns {{src: string, changed: boolean, label: string}} Result object.
 */
function patchThemeSwitchToAcceptWinter(src) {
  if (src.includes('case"winter"')) return { src, changed: false, label: 'theme-switch' };

  // Insert case"winter":return <same-as-default>;
  const re = /switch\s*\(\s*([A-Za-z0-9_$]+)\s*\)\s*\{\s*case\s*"light"\s*:\s*return\s*([A-Za-z0-9_$]+)\s*;\s*case\s*"light-ansi"\s*:\s*return\s*([A-Za-z0-9_$]+)\s*;\s*case\s*"dark-ansi"\s*:\s*return\s*([A-Za-z0-9_$]+)\s*;\s*case\s*"light-daltonized"\s*:\s*return\s*([A-Za-z0-9_$]+)\s*;\s*case\s*"dark-daltonized"\s*:\s*return\s*([A-Za-z0-9_$]+)\s*;\s*default\s*:\s*return\s*([A-Za-z0-9_$]+)\s*\}\s*\}/;
  return applyRegexOnce(
    src,
    re,
    (m, themeVar, light, lightAnsi, darkAnsi, lightDal, darkDal, def) =>
      `switch(${themeVar}){case"light":return ${light};case"light-ansi":return ${lightAnsi};case"dark-ansi":return ${darkAnsi};case"light-daltonized":return ${lightDal};case"dark-daltonized":return ${darkDal};case"winter":return ${def};default:return ${def}}}`,
    'theme-switch'
  );
}

/**
 * Inserts "Winter mode" option into the theme picker dropdown.
 * @param {string} src - Source code.
 * @returns {{src: string, changed: boolean, label: string}} Result object.
 */
function patchThemePickerOptions(src) {
  // Insert Winter option after Dark mode.
  if (src.includes('label:"Winter mode"') || src.includes("label:'Winter mode'")) {
    return { src, changed: false, label: 'theme-picker' };
  }

  const re = /options\s*:\s*\[\s*\{\s*label\s*:\s*("Dark mode"|'Dark mode')\s*,\s*value\s*:\s*("dark"|'dark')\s*\}\s*,/;
  return applyRegexOnce(
    src,
    re,
    (m) => `${m}{label:"Winter mode",value:"winter"},`,
    'theme-picker'
  );
}

/**
 * Adds "winter" to theme label map for settings display.
 * @param {string} src - Source code.
 * @returns {{src: string, changed: boolean, label: string}} Result object.
 */
function patchThemeLabelMap(src) {
  // Optional: make "winter" show a nice label in settings summary.
  if (src.includes('"winter":"Winter mode"') || src.includes("'winter':'Winter mode'")) {
    return { src, changed: false, label: 'theme-label-map' };
  }

  const re = /\{dark:"Dark mode",light:"Light mode",/;
  return applyRegexOnce(
    src,
    re,
    (m) => `${m}winter:"Winter mode",`,
    'theme-label-map'
  );
}

/**
 * Adds ice_blue color to RGB and ANSI palettes.
 * @param {string} src - Source code.
 * @returns {{src: string, changed: boolean, label: string}} Result object.
 */
function patchAddIceBlueToPalettes(src) {
  let changed = false;

  // RGB palettes
  const reRgb = /clawd_background\s*:\s*"rgb\(0,0,0\)"(?!\s*,\s*ice_blue\s*:)/g;
  const out1 = src.replace(reRgb, (m) => `${m},ice_blue:"rgb(173,216,230)"`);
  if (out1 !== src) { src = out1; changed = true; }

  // ANSI palettes
  const reAnsi = /clawd_background\s*:\s*"ansi:black"(?!\s*,\s*ice_blue\s*:)/g;
  const out2 = src.replace(reAnsi, (m) => `${m},ice_blue:"ansi:cyanBright"`);
  if (out2 !== src) { src = out2; changed = true; }

  return { src, changed, label: 'ice-blue' };
}

/**
 * Replaces a logo createElement block with winter-themed snowflake version.
 * Parses balanced parens to find block boundaries in minified/prettified code.
 * @param {string} src - Source code.
 * @param {string} createFnVar - React createElement variable name (e.g., 'I5', 'E9').
 * @returns {{src: string, changed: boolean, label: string}} Result object.
 */
function replaceCreateElementReturnBlock(src, createFnVar) {
  const anchor = `return ${createFnVar}.createElement(T,{flexDirection:"column"}`;
  let idx = src.indexOf(anchor);
  if (idx === -1) {
    // In prettified builds spacing may differ.
    const re = new RegExp(
      `return\\s+${escapeRegExp(createFnVar)}\\.createElement\\(\\s*([A-Za-z0-9_$]+)\\s*,\\s*\\{\\s*flexDirection\\s*:\\s*["']column["']\\s*\\}`,
      'm'
    );
    const m = re.exec(src);
    if (!m) return { src, changed: false, label: `logo-${createFnVar}` };
    idx = m.index;
  }

  // If it's already winterized (ice_blue in the block), skip.
  const lookAhead = src.slice(idx, idx + 2000);
  if (lookAhead.includes('color:"ice_blue"') || lookAhead.includes("color:'ice_blue'")) {
    return { src, changed: false, label: `logo-${createFnVar}` };
  }

  const start = idx;

  // Scan for the first '(' after "createElement"
  let i = src.indexOf('(', start);
  if (i === -1) return { src, changed: false, label: `logo-${createFnVar}` };

  let depth = 0;
  let inStr = null;
  let esc = false;
  let end = -1;

  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === inStr) { inStr = null; continue; }
      continue;
    } else {
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          const semi = src.indexOf(';', i);
          if (semi !== -1) { end = semi + 1; break; }
        }
      }
    }
  }

  if (end === -1) return { src, changed: false, label: `logo-${createFnVar}` };

  const oldBlock = src.slice(start, end);

  // Capture vars used in this block so replacement matches the file.
  const mOuter = new RegExp(
    `return\\s+${escapeRegExp(createFnVar)}\\.createElement\\(\\s*([A-Za-z0-9_$]+)\\s*,\\s*\\{\\s*flexDirection\\s*:\\s*["']column["']\\s*\\}`,
    'm'
  ).exec(oldBlock);
  const containerVar = mOuter ? mOuter[1] : 'T';

  const mText = new RegExp(
    `${escapeRegExp(createFnVar)}\\.createElement\\(\\s*([A-Za-z0-9_$]+)\\s*,\\s*null\\s*,`,
    'm'
  ).exec(oldBlock);
  const textVar = mText ? mText[1] : '$';

  const replacement =
    `return ${createFnVar}.createElement(${containerVar},{flexDirection:"column"},` +
    `${createFnVar}.createElement(${textVar},null,` +
      `${createFnVar}.createElement(${textVar},{color:"text"}," *"),` +
      `${createFnVar}.createElement(${textVar},{color:"ice_blue"}," ▐"),` +
      `${createFnVar}.createElement(${textVar},{color:"ice_blue",backgroundColor:"clawd_background"},"▛███▜"),` +
      `${createFnVar}.createElement(${textVar},{color:"ice_blue"},"▌"),` +
      `${createFnVar}.createElement(${textVar},{color:"text"}," *")` +
    `),` +
    `${createFnVar}.createElement(${textVar},null,` +
      `${createFnVar}.createElement(${textVar},{color:"text"},"*"),` +
      `${createFnVar}.createElement(${textVar},{color:"ice_blue"}," ▝▜"),` +
      `${createFnVar}.createElement(${textVar},{color:"ice_blue",backgroundColor:"clawd_background"},"█████"),` +
      `${createFnVar}.createElement(${textVar},{color:"ice_blue"},"▛▘"),` +
      `${createFnVar}.createElement(${textVar},{color:"text"}," *")` +
    `),` +
    `${createFnVar}.createElement(${textVar},null,` +
      `${createFnVar}.createElement(${textVar},{color:"text"}," * "),` +
      `${createFnVar}.createElement(${textVar},{color:"ice_blue"}," ▘▘ ▝▝","  "),` +
      `${createFnVar}.createElement(${textVar},{color:"text"},"*")` +
    `)` +
    `);`;

  const newSrc = src.slice(0, start) + replacement + src.slice(end);
  return { src: newSrc, changed: newSrc !== src, label: `logo-${createFnVar}` };
}

/**
 * Escapes special regex characters in a string.
 * @param {string} s - String to escape.
 * @returns {string} Escaped string safe for use in RegExp.
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ensures the patch marker is present in source (idempotency check).
 * @param {string} src - Source code.
 * @returns {{src: string, changed: boolean, label: string}} Result object.
 */
function ensureMarker(src) {
  if (src.includes(MARKER)) return { src, changed: false, label: 'marker' };
  // Put marker near the top after shebang
  const re = /^#!.*\n/;
  return applyRegexOnce(src, re, (m) => `${m}// ${MARKER}\n`, 'marker');
}

/**
 * Main entry point. Reads CLI args, validates version, applies patches, writes output.
 */
function main() {
  const target = process.argv[2];
  if (!target) die('Pass path to cli.js (or latest.js) as the only argument.\nExample: node patch_winter_215.js ~/.local/share/claude/cli.js');

  if (!fs.existsSync(target)) die(`File not found: ${target}`);

  let src = readFile(target);

  if (!hasVersion(src)) {
    die(`Refusing to patch: target is not Claude Code v${TARGET_VERSION} (version marker not found).`);
  }

  const already = src.includes(MARKER);
  let changes = [];

  const steps = [
    ensureMarker,
    patchForceWinterInThemeHook,
    patchThemeSwitchToAcceptWinter,
    patchThemePickerOptions,
    patchThemeLabelMap,
    patchAddIceBlueToPalettes,
  ];

  for (const fn of steps) {
    const res = fn(src);
    src = res.src;
    if (res.changed) changes.push(res.label);
  }

  // Patch logo blocks - dynamically find React createElement variables near logo patterns
  // Fallback to known v2.1.5 aliases if dynamic detection fails
  const logoPattern = /return\s+([$\w]+)\.createElement\([^,]+,\s*\{\s*flexDirection\s*:\s*["']column["']/g;
  const reactVars = new Set();
  let logoMatch;
  while ((logoMatch = logoPattern.exec(src)) !== null) {
    reactVars.add(logoMatch[1]);
  }
  // Add known fallbacks for v2.1.5 if not found dynamically
  if (reactVars.size === 0) {
    reactVars.add('I5');
    reactVars.add('E9');
  }
  for (const createVar of reactVars) {
    const res = replaceCreateElementReturnBlock(src, createVar);
    src = res.src;
    if (res.changed) changes.push(res.label);
  }

  if (changes.length === 0) {
    console.error(`[winter-patch] No changes needed.${already ? ' (already patched)' : ''}`);
    process.exit(0);
  }

  const backup = `${target}.bak`;
  if (!fs.existsSync(backup)) {
    writeFile(backup, readFile(target));
  }

  writeFile(target, src);
  console.error(`[winter-patch] Patched ${path.basename(target)} (v${TARGET_VERSION}). Changes: ${changes.join(', ')}`);
  console.error(`[winter-patch] Backup: ${backup}`);
}

main();
