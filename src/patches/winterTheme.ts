// Please see the note about writing patches in ./index

import { showDiff } from './index';
import { Theme } from '../types';

/**
 * Winter Theme Patch for Claude Code
 *
 * Patches applied:
 * 1. Forces theme to "winter" via theme hook
 * 2. Adds case"winter" to theme switch
 * 3. Replaces Clawd logo with snowflake-decorated version
 * 4. Removes top padding from horizontal layout
 * 5. Fixes logo container height (5 -> 3 rows)
 * 6. Adds ice_blue color to palettes
 */

/**
 * Finds the position after the closing parenthesis of a balanced expression.
 * Handles string literals (single, double, backtick) and escape sequences.
 * Returns -1 if no balanced closing is found.
 */
function findClosingParen(src: string, startIdx: number): number {
  let i = src.indexOf('(', startIdx);
  if (i === -1) return -1;

  let depth = 0;
  let inStr: string | null = null;
  let esc = false;

  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === inStr) {
        inStr = null;
      }
    } else {
      if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch;
      } else if (ch === '(') {
        depth++;
      } else if (ch === ')') {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }
  }
  return -1;
}

/** Adds ice_blue color to RGB and ANSI palettes. */
function patchAddIceBlueToPalettes(src: string): {
  src: string;
  changed: boolean;
} {
  let changed = false;
  let newSrc = src;

  // RGB palettes - add ice_blue after clawd_background
  // Match "clawd_background":"rgb(0,0,0)" or clawd_background:"rgb(0,0,0)" not followed by ice_blue
  const reRgb =
    /"?clawd_background"?\s*:\s*"rgb\(0,0,0\)"(?!\s*,\s*"?ice_blue)/g;
  const out1 = newSrc.replace(reRgb, m => `${m},"ice_blue":"rgb(173,216,230)"`);
  if (out1 !== newSrc) {
    newSrc = out1;
    changed = true;
  }

  // ANSI palettes - add ice_blue after clawd_background
  const reAnsi =
    /"?clawd_background"?\s*:\s*"ansi:black"(?!\s*,\s*"?ice_blue)/g;
  const out2 = newSrc.replace(reAnsi, m => `${m},"ice_blue":"ansi:cyanBright"`);
  if (out2 !== newSrc) {
    newSrc = out2;
    changed = true;
  }

  if (changed) {
    showDiff(src, newSrc, 'ice_blue color added to palettes', 0, 0);
  }

  return { src: newSrc, changed };
}

/** Replaces a single logo block with snowflake-decorated version. */
function replaceLogoWithSnowflakes(src: string): {
  src: string;
  changed: boolean;
} {
  const logoArtPattern = /▛███▜/g;
  let match;
  let bestMatch: {
    reactVar: string;
    containerVar: string;
    textVar: string;
    idx: number;
  } | null = null;

  while ((match = logoArtPattern.exec(src)) !== null) {
    const searchStart = Math.max(0, match.index - 500);
    const beforeLogo = src.slice(searchStart, match.index);

    const returnPattern =
      /return\s+([$\w]+)\.createElement\(([$\w]+),\s*\{\s*flexDirection\s*:\s*"column"\s*\}/g;
    let returnMatch;
    let lastReturn = null;

    while ((returnMatch = returnPattern.exec(beforeLogo)) !== null) {
      lastReturn = returnMatch;
    }

    if (lastReturn) {
      const reactVar = lastReturn[1];
      const containerVar = lastReturn[2];
      const returnIdx = searchStart + (lastReturn.index || 0);

      // Skip logos already patched with snowflakes
      const lookAhead = src.slice(returnIdx, returnIdx + 2000);
      const hasSnowflakes =
        lookAhead.includes('color:"text"}," *"') ||
        lookAhead.includes("color:'text'},' *'") ||
        lookAhead.includes('color:"ice_blue"}," *"') ||
        lookAhead.includes("color:'ice_blue'},' *'") ||
        lookAhead.includes('color:"cyan_FOR_SUBAGENTS_ONLY"') ||
        lookAhead.includes("color:'cyan_FOR_SUBAGENTS_ONLY'");
      if (hasSnowflakes) {
        continue;
      }

      const logoArea = src.slice(match.index - 200, match.index + 200);
      const textMatch = logoArea.match(
        new RegExp(`${reactVar}\\.createElement\\(([$\\w]+),\\s*null`)
      );
      const textVar = textMatch ? textMatch[1] : 'C';

      bestMatch = { reactVar, containerVar, textVar, idx: returnIdx };
      break;
    }
  }

  if (!bestMatch) {
    return { src, changed: false };
  }

  const { reactVar, containerVar, textVar, idx } = bestMatch;

  // Find the end of the return statement
  const closingParen = findClosingParen(src, idx);
  if (closingParen === -1) {
    console.warn(
      'patch: winterTheme: could not find end of logo return statement'
    );
    return { src, changed: false };
  }

  // Find semicolon or closing brace after the parenthesis
  const semi = src.indexOf(';', closingParen);
  const closing = src.indexOf('}', closingParen);
  const end =
    semi !== -1 && (closing === -1 || semi < closing) ? semi : closingParen + 1;

  // Build the replacement with snowflakes
  // Use text color (white) for stars, ice_blue for logo
  const replacement =
    `return ${reactVar}.createElement(${containerVar},{flexDirection:"column"},` +
    // Row 1: * ▐▛███▜▌ *
    `${reactVar}.createElement(${textVar},null,` +
    `${reactVar}.createElement(${textVar},{color:"text"}," *"),` +
    `${reactVar}.createElement(${textVar},{color:"ice_blue"}," ▐"),` +
    `${reactVar}.createElement(${textVar},{color:"ice_blue",backgroundColor:"clawd_background"},"▛███▜"),` +
    `${reactVar}.createElement(${textVar},{color:"ice_blue"},"▌"),` +
    `${reactVar}.createElement(${textVar},{color:"text"}," *")` +
    `),` +
    // Row 2: * ▝▜▛███▜▛▘ *
    `${reactVar}.createElement(${textVar},null,` +
    `${reactVar}.createElement(${textVar},{color:"text"},"*"),` +
    `${reactVar}.createElement(${textVar},{color:"ice_blue"}," ▝▜"),` +
    `${reactVar}.createElement(${textVar},{color:"ice_blue",backgroundColor:"clawd_background"},"█████"),` +
    `${reactVar}.createElement(${textVar},{color:"ice_blue"},"▛▘"),` +
    `${reactVar}.createElement(${textVar},{color:"text"}," *")` +
    `),` +
    // Row 3:  *   ▘▘ ▝▝   *
    `${reactVar}.createElement(${textVar},null,` +
    `${reactVar}.createElement(${textVar},{color:"text"}," * "),` +
    `${reactVar}.createElement(${textVar},{color:"ice_blue"}," ▘▘ ▝▝  "),` +
    `${reactVar}.createElement(${textVar},{color:"text"},"*")` +
    `)` +
    `)`;

  const newSrc = src.slice(0, idx) + replacement + src.slice(end);
  return { src: newSrc, changed: true };
}

/** Replaces clawd_body color with ice_blue and adds snowflakes to all logos. */
function patchClawdLogos(src: string): {
  src: string;
  changed: boolean;
  count: number;
} {
  // Check if already patched (use indexOf + bounded slice to avoid ReDoS)
  const iceBlueIdx = src.indexOf('color:"ice_blue"');
  const hasIceBlueInLogo =
    iceBlueIdx !== -1 &&
    (src.slice(iceBlueIdx, iceBlueIdx + 100).includes('▛███▜') ||
      src.slice(iceBlueIdx, iceBlueIdx + 100).includes('\\u259B'));

  if (hasIceBlueInLogo) {
    return { src, changed: false, count: 0 };
  }

  // Support both direct unicode and escaped forms
  const clawdPatterns = ['▛███▜', '\\u259B\\u2588\\u2588\\u2588\\u259C'];
  let clawdPattern = '▛███▜';
  for (const pattern of clawdPatterns) {
    if (src.includes(pattern)) {
      clawdPattern = pattern;
      break;
    }
  }

  let newSrc = src;
  let count = 0;

  // Collect positions from original src, process in reverse to avoid shifts
  let searchPos = 0;
  const logoPositions: number[] = [];
  while (true) {
    const clawdIndex = src.indexOf(clawdPattern, searchPos);
    if (clawdIndex === -1) break;
    logoPositions.push(clawdIndex);
    searchPos = clawdIndex + clawdPattern.length;
  }

  for (let i = logoPositions.length - 1; i >= 0; i--) {
    const clawdIndex = logoPositions[i];
    const regionStart = Math.max(0, clawdIndex - 1500);
    const regionEnd = Math.min(newSrc.length, clawdIndex + 1500);
    const region = newSrc.slice(regionStart, regionEnd);

    const hasClawdBody = /color:\s*"clawd_body"/.test(region);
    const hasIceBlue = /color:\s*"ice_blue"/.test(region);

    if (hasClawdBody) {
      const modifiedRegion = region.replace(
        /color:\s*"clawd_body"/g,
        'color: "ice_blue"'
      );
      newSrc =
        newSrc.slice(0, regionStart) + modifiedRegion + newSrc.slice(regionEnd);
      count++;
      showDiff(
        src,
        newSrc,
        'winter logo color (clawd_body -> ice_blue)',
        regionStart,
        regionEnd
      );
    } else if (hasIceBlue) {
      count++;
    }
  }

  // Add snowflakes to all logos
  if (count > 0) {
    let snowflakeCount = 0;
    let tempSrc = newSrc;

    while (snowflakeCount < 5) {
      const logoReplacement = replaceLogoWithSnowflakes(tempSrc);
      if (!logoReplacement.changed) break;
      tempSrc = logoReplacement.src;
      snowflakeCount++;
    }

    if (snowflakeCount > 0) {
      newSrc = tempSrc;
      console.log(
        `patch: winterTheme: Replaced ${snowflakeCount} logo(s) with snowflakes version`
      );
    }
  }

  return {
    src: newSrc,
    changed: count > 0,
    count,
  };
}

/** Patches theme hook to always return "winter" theme. */
function patchForceWinterTheme(src: string): {
  src: string;
  changed: boolean;
} {
  if (src.includes('return["winter"') || src.includes("return['winter'")) {
    return { src, changed: false };
  }

  const themeHookPattern =
    /function\s+([$\w]+)\s*\(\s*\)\s*\{\s*let\s*\{\s*currentTheme\s*:\s*([$\w]+)\s*,\s*setTheme\s*:\s*([$\w]+)\s*\}\s*=\s*([$\w]+)\.useContext\s*\(\s*([$\w]+)\s*\)\s*;\s*return\s*\[\s*([$\w]+)\s*,\s*([$\w]+)\s*\]\s*;?\s*\}/;

  const match = src.match(themeHookPattern);
  if (!match) {
    // Try a more lenient pattern (bounded to avoid ReDoS)
    const lenientPattern =
      /function\s+([$\w]+)\s*\(\s*\)\s*\{[^}]{0,500}currentTheme[^}]{0,500}setTheme[^}]{0,500}return\s*\[\s*([$\w]+)\s*,\s*([$\w]+)\s*\]\s*;?\s*\}/;
    const lenientMatch = src.match(lenientPattern);

    if (!lenientMatch) {
      console.warn(
        'patch: winterTheme: could not find theme hook to force winter theme'
      );
      return { src, changed: false };
    }

    // Replace the return statement in the lenient match
    const [fullMatch, , , setterVar] = lenientMatch;
    const newFunc = fullMatch.replace(
      /return\s*\[\s*([$\w]+)\s*,\s*([$\w]+)\s*\]/,
      `return["winter",${setterVar}]`
    );

    const newSrc = src.replace(fullMatch, newFunc);
    if (newSrc !== src) {
      showDiff(
        src,
        newSrc,
        'force winter theme hook',
        lenientMatch.index || 0,
        (lenientMatch.index || 0) + fullMatch.length
      );
      return { src: newSrc, changed: true };
    }

    return { src, changed: false };
  }

  const [fullMatch, , , setterVar] = match;
  const newFunc = fullMatch.replace(
    /return\s*\[\s*([$\w]+)\s*,\s*([$\w]+)\s*\]/,
    `return["winter",${setterVar}]`
  );

  const newSrc = src.replace(fullMatch, newFunc);
  if (newSrc !== src) {
    showDiff(
      src,
      newSrc,
      'force winter theme hook',
      match.index || 0,
      (match.index || 0) + fullMatch.length
    );
    return { src: newSrc, changed: true };
  }

  return { src, changed: false };
}

/** Adds case"winter" to the theme switch statement with winter colors. */
function patchAddWinterCaseToSwitch(src: string): {
  src: string;
  changed: boolean;
} {
  if (src.includes('case"winter"') || src.includes("case'winter'")) {
    return { src, changed: false };
  }

  const winterColors = JSON.stringify(WINTER_THEME_COLORS);
  const winterCase = `case"winter":return${winterColors};`;

  // Insert after case"dark-daltonized", case"monochrome", or before default
  // Use possessive-like pattern to avoid ReDoS: match up to 2000 chars max
  const darkDaltonizedPattern = /case"dark-daltonized":return\{[^}]{1,2000}\};/;
  const match = src.match(darkDaltonizedPattern);

  if (match && match.index !== undefined) {
    const insertPos = match.index + match[0].length;
    const newSrc = src.slice(0, insertPos) + winterCase + src.slice(insertPos);
    showDiff(src, newSrc, 'winter case added to switch', insertPos, insertPos);
    return { src: newSrc, changed: true };
  }

  const monochromePattern = /case"monochrome":return\{[^}]{1,2000}\};/;
  const monoMatch = src.match(monochromePattern);

  if (monoMatch && monoMatch.index !== undefined) {
    const insertPos = monoMatch.index + monoMatch[0].length;
    const newSrc = src.slice(0, insertPos) + winterCase + src.slice(insertPos);
    showDiff(src, newSrc, 'winter case added to switch', insertPos, insertPos);
    return { src: newSrc, changed: true };
  }

  const defaultPattern = /(\};)(default:return)/;
  const defaultMatch = src.match(defaultPattern);

  if (defaultMatch && defaultMatch.index !== undefined) {
    const insertPos = defaultMatch.index + defaultMatch[1].length;
    const newSrc = src.slice(0, insertPos) + winterCase + src.slice(insertPos);
    showDiff(
      src,
      newSrc,
      'winter case added before default',
      insertPos,
      insertPos
    );
    return { src: newSrc, changed: true };
  }

  console.warn(
    'patch: winterTheme: could not find place to insert winter case in switch'
  );
  return { src, changed: false };
}

/** Applies all winter theme patches to cli.js content. */
export const writeWinterTheme = (oldFile: string): string | null => {
  let newFile = oldFile;
  let anyChanged = false;
  const appliedPatches: string[] = [];
  const failedPatches: string[] = [];

  // 1. Force winter theme in the theme hook
  const forceResult = patchForceWinterTheme(newFile);
  newFile = forceResult.src;
  if (forceResult.changed) {
    anyChanged = true;
    appliedPatches.push('force-winter-hook');
  } else {
    failedPatches.push('force-winter-hook');
  }

  // 2. Add case"winter" to theme switch statement
  const switchResult = patchAddWinterCaseToSwitch(newFile);
  newFile = switchResult.src;
  if (switchResult.changed) {
    anyChanged = true;
    appliedPatches.push('winter-switch-case');
  } else {
    failedPatches.push('winter-switch-case');
  }

  // 3. Replace Clawd logos with winter versions (BEFORE ice-blue patch to avoid position shifts)
  const logoResult = patchClawdLogos(newFile);
  newFile = logoResult.src;
  if (logoResult.changed) {
    anyChanged = true;
    appliedPatches.push(`logos(${logoResult.count})`);
  } else {
    failedPatches.push('logos');
  }

  // 4. Remove top padding from horizontal welcome screen layout
  const fullTopPaddingOld =
    'createElement(AB.Fragment,null,AB.createElement(T,null),AB.createElement(T,{flexDirection';
  const fullTopPaddingNew =
    'createElement(AB.Fragment,null,AB.createElement(T,{flexDirection';
  if (newFile.includes(fullTopPaddingOld)) {
    newFile = newFile.replace(fullTopPaddingOld, fullTopPaddingNew);
    anyChanged = true;
    appliedPatches.push('remove-top-padding-full');
    console.log(
      'patch: winterTheme: Removed top padding from cc2 (full welcome screen)'
    );
  }

  // 5. Fix logo container height to match 3-row snowflake logo (was height:5)
  const logoHeightOld =
    'height:5,flexDirection:"column",justifyContent:"flex-end"';
  const logoHeightNew =
    'height:3,flexDirection:"column",justifyContent:"flex-end"';
  if (newFile.includes(logoHeightOld)) {
    newFile = newFile.replaceAll(logoHeightOld, logoHeightNew);
    anyChanged = true;
    appliedPatches.push('fix-logo-height');
    console.log(
      'patch: winterTheme: Changed logo container height:5 to height:3'
    );
  }

  // 6. Add ice_blue color to palettes (needed for winter logo to render correctly)
  const iceBlueResult = patchAddIceBlueToPalettes(newFile);
  newFile = iceBlueResult.src;
  if (iceBlueResult.changed) {
    anyChanged = true;
    appliedPatches.push('ice-blue');
  } else {
    failedPatches.push('ice-blue');
  }

  if (!anyChanged) {
    console.warn(
      `patch: winterTheme: no changes were made. Failed patches: ${failedPatches.join(', ')}`
    );
    console.warn(
      'patch: winterTheme: This may mean the file is already patched, or patterns were not found.'
    );
    return null;
  }

  console.log(
    `patch: winterTheme: applied patches: ${appliedPatches.join(', ')}`
  );
  if (failedPatches.length > 0) {
    console.warn(
      `patch: winterTheme: some patches were skipped (already applied or pattern not found): ${failedPatches.join(', ')}`
    );
  }

  return newFile;
};

/** Winter theme color palette (dark theme with ice-blue accents). */
export const WINTER_THEME_COLORS: Theme['colors'] = {
  autoAccept: 'rgb(175,135,255)',
  bashBorder: 'rgb(173,216,230)', // ice blue
  claude: 'rgb(173,216,230)', // ice blue
  claudeShimmer: 'rgb(200,230,240)',
  claudeBlue_FOR_SYSTEM_SPINNER: 'rgb(147,165,255)',
  claudeBlueShimmer_FOR_SYSTEM_SPINNER: 'rgb(177,195,255)',
  permission: 'rgb(173,216,230)', // ice blue
  permissionShimmer: 'rgb(200,230,240)',
  planMode: 'rgb(72,150,170)', // slightly bluer
  ide: 'rgb(71,130,200)',
  promptBorder: 'rgb(136,136,136)',
  promptBorderShimmer: 'rgb(166,166,166)',
  text: 'rgb(255,255,255)',
  inverseText: 'rgb(0,0,0)',
  inactive: 'rgb(153,153,153)',
  subtle: 'rgb(80,80,80)',
  suggestion: 'rgb(173,216,230)', // ice blue
  remember: 'rgb(173,216,230)', // ice blue
  background: 'rgb(0,180,200)', // cyan-ish
  success: 'rgb(78,186,101)',
  error: 'rgb(255,107,128)',
  warning: 'rgb(255,193,7)',
  warningShimmer: 'rgb(255,223,57)',
  diffAdded: 'rgb(34,92,43)',
  diffRemoved: 'rgb(122,41,54)',
  diffAddedDimmed: 'rgb(71,88,74)',
  diffRemovedDimmed: 'rgb(105,72,77)',
  diffAddedWord: 'rgb(56,166,96)',
  diffRemovedWord: 'rgb(179,89,107)',
  diffAddedWordDimmed: 'rgb(46,107,58)',
  diffRemovedWordDimmed: 'rgb(139,57,69)',
  red_FOR_SUBAGENTS_ONLY: 'rgb(220,38,38)',
  blue_FOR_SUBAGENTS_ONLY: 'rgb(37,99,235)',
  green_FOR_SUBAGENTS_ONLY: 'rgb(22,163,74)',
  yellow_FOR_SUBAGENTS_ONLY: 'rgb(202,138,4)',
  purple_FOR_SUBAGENTS_ONLY: 'rgb(147,51,234)',
  orange_FOR_SUBAGENTS_ONLY: 'rgb(234,88,12)',
  pink_FOR_SUBAGENTS_ONLY: 'rgb(219,39,119)',
  cyan_FOR_SUBAGENTS_ONLY: 'rgb(8,145,178)',
  professionalBlue: 'rgb(106,155,204)',
  rainbow_red: 'rgb(235,95,87)',
  rainbow_orange: 'rgb(245,139,87)',
  rainbow_yellow: 'rgb(250,195,95)',
  rainbow_green: 'rgb(145,200,130)',
  rainbow_blue: 'rgb(130,170,220)',
  rainbow_indigo: 'rgb(155,130,200)',
  rainbow_violet: 'rgb(200,130,180)',
  rainbow_red_shimmer: 'rgb(250,155,147)',
  rainbow_orange_shimmer: 'rgb(255,185,137)',
  rainbow_yellow_shimmer: 'rgb(255,225,155)',
  rainbow_green_shimmer: 'rgb(185,230,180)',
  rainbow_blue_shimmer: 'rgb(180,205,240)',
  rainbow_indigo_shimmer: 'rgb(195,180,230)',
  rainbow_violet_shimmer: 'rgb(230,180,210)',
  clawd_body: 'rgb(173,216,230)', // ice blue
  clawd_background: 'rgb(0,0,0)',
  userMessageBackground: 'rgb(55,55,55)',
  bashMessageBackgroundColor: 'rgb(65,60,65)',
  memoryBackgroundColor: 'rgb(55,65,70)',
  rate_limit_fill: 'rgb(173,216,230)', // ice blue
  rate_limit_empty: 'rgb(80,83,112)',
};
