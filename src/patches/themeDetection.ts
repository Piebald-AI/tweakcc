// Please see the note about writing patches in ./index
//
// Fix Theme Detection — cross-platform startup detection
//
// Claude Code's built-in "auto" theme detection reads process.env.COLORFGBG,
// which doesn't work on most terminals (macOS terminals don't set it, many
// Linux terminals don't either). This patch replaces the detection body with
// platform-native checks:
//
//   macOS:   `defaults read -g AppleInterfaceStyle` (instant)
//   Linux:   `gdbus call` on freedesktop appearance portal
//   Windows: `reg query` for AppsUseLightTheme
//   Fallback: COLORFGBG (preserved for terminals that set it)
//
// The detect function across CC versions:
//   v2.1.86: function _k5(){let q=process.env.COLORFGBG;...
//   v2.1.87: function MR4(){let H=process.env.COLORFGBG;...
//   v2.1.89: function uG4(){let H=process.env.COLORFGBG;...

import { showDiff } from './index';
import { getRequireFuncName } from './helpers';

/**
 * Patch the COLORFGBG detect function with cross-platform detection.
 *
 * Replaces the function body that reads process.env.COLORFGBG with one that
 * tries platform-native detection first (macOS defaults, Linux gdbus, Windows
 * registry) and falls back to COLORFGBG.
 */
export const writeThemeDetection = (content: string): string | null => {
  // Check if already patched
  if (content.includes('defaults read -g AppleInterfaceStyle')) {
    return content;
  }

  // Match the entire COLORFGBG detection function
  const detectPattern =
    /function ([$\w]+)\(\)\{let [$\w]+=process\.env\.COLORFGBG;if\(![$\w]+\)return;[\s\S]*?return [$\w]+<=6\|\|[$\w]+===8\?"dark":"light"\}/;
  const match = content.match(detectPattern);

  if (!match || match.index == null) {
    console.error(
      'patch: themeDetection: failed to find COLORFGBG detect function'
    );
    return null;
  }

  const funcName = match[1];

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
};
