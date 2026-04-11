import { showDiff } from './index';
import { getRequireFuncName } from './helpers';

export const writeThemeDetection = (content: string): string | null => {
  if (content.includes('defaults read -g AppleInterfaceStyle')) {
    return content;
  }

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
