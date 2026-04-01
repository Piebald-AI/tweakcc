// Please see the note about writing patches in ./index
//
// Reactive Theme Switching — auto dark/light based on OS appearance
//
// Patches two things in the ThemeProvider:
//
// 1. The empty useEffect — replaced with a loader that requires ~/.tweakcc/tw.js,
//    which sets up platform-native watchers (macOS plist, Linux gdbus, Windows
//    registry, SSH/tmux OSC 11 via TerminalQuerier).
//
// 2. The COLORFGBG detect function — replaced with cross-platform detection
//    (macOS `defaults read`, Linux `gdbus call`, Windows `reg query`) for
//    better startup accuracy. Falls back to COLORFGBG.
//
// The useEffect across CC versions:
//   v2.1.86: zA.useEffect(()=>{},[j,J]);
//   v2.1.87: KG.useEffect(()=>{},[f,w]);
//   v2.1.89: UG.useEffect(()=>{},[w,f]);
//
// The COLORFGBG detect function across CC versions:
//   v2.1.86: function _k5(){let q=process.env.COLORFGBG;...
//   v2.1.87: function MR4(){let H=process.env.COLORFGBG;...
//   v2.1.89: function uG4(){let H=process.env.COLORFGBG;...

import { escapeIdent, showDiff } from './index';
import { CONFIG_DIR } from '../config';

export interface ReactiveThemeConfig {
  darkThemeId: string;
  lightThemeId: string;
}

// ======================================================================

/**
 * Find the ThemeProvider function boundary by looking for the characteristic
 * {themeSetting:X,...,currentTheme:Y} object shape in a useMemo call.
 */
function findThemeProviderRegion(content: string): {
  start: number;
  end: number;
} | null {
  const marker = /\{themeSetting:[$\w]+,/;
  const match = content.match(marker);
  if (!match || match.index == null) return null;

  // Walk backwards to find the function start (look for `function NAME(`)
  const searchStart = Math.max(0, match.index - 3000);
  const before = content.slice(searchStart, match.index);
  const funcMatch = before.match(
    /function [$\w]+\(\{children:[$\w]+,initialState:[$\w]+[^}]*\}\)\{/g
  );
  if (!funcMatch) return null;

  // Use the last match (closest to our marker)
  const lastFunc = funcMatch[funcMatch.length - 1];
  const funcStart = before.lastIndexOf(lastFunc);
  if (funcStart === -1) return null;

  const start = searchStart + funcStart;

  // Walk forward to find the end — look for the closing `}` of the function
  // by finding the return statement with createElement(CTX.Provider,...)
  const after = content.slice(match.index, match.index + 2000);
  const returnMatch = after.match(
    /return [$\w]+\.default\.createElement\([$\w]+\.Provider,\{value:[$\w]+\},[$\w]+\)\}/
  );
  if (!returnMatch || returnMatch.index == null) return null;

  const end = match.index + returnMatch.index + returnMatch[0].length;
  return { start, end };
}

// ======================================================================

/**
 * Find and patch the empty useEffect in the ThemeProvider.
 *
 * Replaces: REACT.useEffect(()=>{},[dep1,dep2?])
 * With:     REACT.useEffect(()=>{try{if(dep1=="auto"){...require tw.js...}}catch{}},[dep1,dep2?])
 */
function patchThemeProviderUseEffect(
  content: string,
  config: ReactiveThemeConfig
): string | null {
  const region = findThemeProviderRegion(content);
  if (!region) {
    console.error(
      'patch: reactiveTheme: failed to find ThemeProvider function'
    );
    return null;
  }

  const regionContent = content.slice(region.start, region.end);

  // Check if already patched
  if (regionContent.includes('/tw.js")')) {
    return content;
  }

  // Find the empty useEffect within the ThemeProvider
  const useEffectPattern =
    /([$\w]+)\.useEffect\(\(\)=>\{\},\[([$\w]+)(?:,([$\w]+))?\]\)/;
  const useEffectMatch = regionContent.match(useEffectPattern);
  if (!useEffectMatch || useEffectMatch.index == null) {
    console.error(
      'patch: reactiveTheme: failed to find empty useEffect in ThemeProvider'
    );
    return null;
  }

  const reactVar = useEffectMatch[1];
  const dep1 = useEffectMatch[2]; // theme setting variable
  const dep2 = useEffectMatch[3]; // internal_querier (optional)
  const deps = dep2 ? `${dep1},${dep2}` : dep1;

  // Find the setState function — the setter from the 3rd useState in ThemeProvider.
  // The 3rd useState is the one whose initializer checks for "auto":
  //   [z,A]=UG.useState(()=>(_??K)==="auto"?rUH():"dark")
  // We match the whole pattern including nested parens and capture the setter.
  const setStatePattern = new RegExp(
    `\\[([$\\w]+),([$\\w]+)\\]=${escapeIdent(reactVar)}\\.useState\\(\\(\\)=>\\([^)]+\\)==="?auto"?\\?[$\\w]+\\(\\):"dark"\\)`
  );
  const setStateMatch = regionContent.match(setStatePattern);
  if (!setStateMatch) {
    console.error(
      'patch: reactiveTheme: failed to find setState for resolved theme'
    );
    return null;
  }

  const setStateVar = setStateMatch[2];

  // Build replacement — inject CONFIG_DIR as a resolved string literal at
  // apply time so the runtime path respects TWEAKCC_CONFIG_DIR / XDG overrides.
  const querierArg = dep2 ? `,${dep2}` : '';
  const escapedConfigDir = CONFIG_DIR.replace(/\\/g, '\\\\');
  const twJsPath = escapedConfigDir + '/tw.js';
  const replacement =
    `${reactVar}.useEffect(()=>{try{if(${dep1}=="auto"){` +
    `return require("${twJsPath}")` +
    `(${setStateVar}${querierArg},"${config.darkThemeId}","${config.lightThemeId}","${escapedConfigDir}")` +
    `}}catch{}},[${deps}])`;

  const absStart = region.start + useEffectMatch.index;
  const absEnd = absStart + useEffectMatch[0].length;

  const newContent =
    content.slice(0, absStart) + replacement + content.slice(absEnd);

  showDiff(content, newContent, replacement, absStart, absEnd);

  return newContent;
}

// ======================================================================

/**
 * Write reactive theme patch to the Claude Code JS content.
 *
 * Patches the ThemeProvider's empty useEffect to load tw.js for reactive
 * theme watching. The COLORFGBG detect function patch is in a separate
 * always-applied patch (themeDetection.ts).
 */
export const writeReactiveTheme = (
  oldFile: string,
  config: ReactiveThemeConfig
): string | null => {
  return patchThemeProviderUseEffect(oldFile, config);
};
