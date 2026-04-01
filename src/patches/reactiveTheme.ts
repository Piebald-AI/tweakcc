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
import { getRequireFuncName } from './helpers';
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
 * Find and patch the COLORFGBG detect function with cross-platform detection.
 *
 * Replaces the function body that reads process.env.COLORFGBG with one that
 * tries platform-native detection first (macOS defaults, Linux gdbus, Windows
 * registry) and falls back to COLORFGBG.
 */
function patchDetectFunction(content: string): string | null {
  // Match the entire COLORFGBG detection function
  const detectPattern =
    /function ([$\w]+)\(\)\{let [$\w]+=process\.env\.COLORFGBG;if\(![$\w]+\)return;[\s\S]*?return [$\w]+<=6\|\|[$\w]+===8\?"dark":"light"\}/;
  const match = content.match(detectPattern);

  if (!match || match.index == null) {
    // Not a fatal error — older versions may use different detection
    console.error(
      'patch: reactiveTheme: failed to find COLORFGBG detect function (non-fatal)'
    );
    return content;
  }

  const funcName = match[1];

  // Check if already patched
  if (content.includes('defaults read -g AppleInterfaceStyle')) {
    return content;
  }

  const requireFunc = getRequireFuncName(content);

  // Build cross-platform detect replacement
  const replacement =
    `function ${funcName}(){try{` +
    `var _cp=${requireFunc}("child_process");` +
    `if(process.platform==="darwin"){` +
    `try{_cp.execSync("defaults read -g AppleInterfaceStyle",{stdio:"pipe"});return"dark"}catch{return"light"}}` +
    `if(process.platform==="linux"){try{` +
    `var _o=(""+_cp.execSync("gdbus call --session --dest org.freedesktop.portal.Desktop ` +
    `--object-path /org/freedesktop/portal/desktop ` +
    `--method org.freedesktop.portal.Settings.Read ` +
    `org.freedesktop.appearance color-scheme",{stdio:"pipe",timeout:3e3}));` +
    `var _m=_o.match(/uint32\\s+(\\d)/);` +
    `if(_m)return _m[1]==="1"?"dark":"light"}catch{}}` +
    `if(process.platform==="win32"){try{` +
    `var _w=(""+_cp.execSync('reg query "HKCU\\\\SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Themes\\\\Personalize" /v AppsUseLightTheme',{stdio:"pipe",timeout:3e3}));` +
    `return _w.includes("0x0")?"dark":"light"}catch{}}` +
    `var _e=process.env.COLORFGBG;if(_e){` +
    `var _p=_e.split(";"),_v=_p[_p.length-1];` +
    `if(_v){var _n=Number(_v);if(Number.isInteger(_n)&&_n>=0&&_n<=15)return _n<=6||_n===8?"dark":"light"}}` +
    `return"dark"}catch{return"dark"}}`;

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newContent =
    content.slice(0, startIndex) + replacement + content.slice(endIndex);

  showDiff(content, newContent, replacement, startIndex, endIndex);

  return newContent;
}

// ======================================================================

/**
 * Write reactive theme patches to the Claude Code JS content.
 *
 * Applies two sub-patches:
 * 1. ThemeProvider useEffect — loads tw.js for reactive watching
 * 2. COLORFGBG detect function — cross-platform startup detection
 */
export const writeReactiveTheme = (
  oldFile: string,
  config: ReactiveThemeConfig
): string | null => {
  // Patch 1: useEffect (required)
  const afterUseEffect = patchThemeProviderUseEffect(oldFile, config);
  if (afterUseEffect === null) {
    return null;
  }

  // Patch 2: detect function (best-effort — non-fatal if not found)
  const afterDetect = patchDetectFunction(afterUseEffect);
  if (afterDetect === null) {
    return afterUseEffect;
  }

  return afterDetect;
};
