import { showDiff } from './index';
import { Theme } from '../types';

/**
 * Winter Theme Patch for Claude Code - Final Minimalist & Robust Version.
 * Optimized for performance and structural logic.
 */

const ICE_BLUE = 'rgb(173,216,230)';
const R = (v: string, t: string, ...els: string[]) =>
  `${v}.createElement(${t},null,${els.map(e => (e.startsWith(`${v}.`) ? e : `${v}.createElement(${t},${e})`)).join(',')})`;

const L1 = (v: string, t: string) =>
  R(
    v,
    t,
    '{color:"text"}," *"',
    `{color:"${ICE_BLUE}"}," ▐"`,
    `{color:"${ICE_BLUE}",backgroundColor:"clawd_background"},"▛███▜"`,
    `{color:"${ICE_BLUE}"},"▌"`,
    '{color:"text"}," *"'
  );
const L2 = (v: string, t: string) =>
  R(
    v,
    t,
    '{color:"text"},"*"',
    `{color:"${ICE_BLUE}"}," ▝▜"`,
    `{color:"${ICE_BLUE}",backgroundColor:"clawd_background"},"█████"`,
    `{color:"${ICE_BLUE}"},"▛▘"`,
    '{color:"text"}," *"'
  );
const L3 = (v: string, t: string) =>
  R(
    v,
    t,
    '{color:"text"}," * "',
    `{color:"${ICE_BLUE}"}," ▘▘ ▝▝"`,
    '{color:"text"},"  *"'
  );

function patchClawdLogos(src: string): {
  src: string;
  changed: boolean;
  count: number;
} {
  if (!src.includes('clawd_body')) return { src, changed: false, count: 0 };
  let newSrc = src,
    count = 0,
    pos = 0;
  const q = `["']`,
    s = `\\s*`,
    c = `,${s}`,
    v = `[$\\w]+`,
    b = `\\{${s}`;
  // Identifies Row 1 & 2: nested null container with 3 clawd-themed children
  const p12 = new RegExp(
    String.raw`(${v})\.createElement\((${v})${c}null${c}\1\.createElement\(\2${s},${s}${b}color:${q}clawd_body${q}${s}\}${c}${q}([^"']*)${q}\)${c}\1\.createElement\(\2${s},${s}${b}(?:color:${q}clawd_body${q}${c}backgroundColor:${q}clawd_background${q}|backgroundColor:${q}clawd_background${q}${c}color:${q}clawd_body${q})${s}\}${c}${q}[^"']*${q}\)${c}\1\.createElement\(\2${s},${s}${b}color:${q}clawd_body${q}${s}\}${c}${q}[^"']*${q}\)\)`
  );
  const p3 = new RegExp(
    String.raw`(${v})\.createElement\((${v})${c}${b}color:${q}clawd_body${q}${s}\}${c}${q}\s*${q}${c}${q}[^"']*${q}${c}${q}\s*${q}\)`
  );

  while ((pos = newSrc.indexOf('clawd_body', pos)) !== -1) {
    const start = Math.max(0, pos - 400),
      slice = newSrc.substring(start, Math.min(newSrc.length, pos + 400));
    let m = p12.exec(slice);
    if (m) {
      const isR1 = /\\u2590|▐/.test(m[3]),
        isR2 = /\\u259D|\\u259B|▝|▛/.test(m[3]);
      const rep = isR1 ? L1(m[1], m[2]) : isR2 ? L2(m[1], m[2]) : null;
      if (rep) {
        newSrc =
          newSrc.substring(0, start + m.index) +
          rep +
          newSrc.substring(start + m.index + m[0].length);
        count++;
        pos = start + m.index + rep.length;
        continue;
      }
    }
    if ((m = p3.exec(slice))) {
      const rep = L3(m[1], m[2]);
      newSrc =
        newSrc.substring(0, start + m.index) +
        rep +
        newSrc.substring(start + m.index + m[0].length);
      count++;
      pos = start + m.index + rep.length;
      continue;
    }
    pos += 10;
  }
  if (count > 0) showDiff(src, newSrc, `winter logo (${count} rows)`, 0, 0);
  return { src: newSrc, changed: count > 0, count };
}

function patchForceWinterTheme(src: string): { src: string; changed: boolean } {
  const pivot = src.indexOf('currentTheme');
  if (pivot === -1) return { src, changed: false };
  const start = Math.max(0, pivot - 500),
    slice = src.substring(start, Math.min(src.length, pivot + 1000));
  const m = slice.match(
    /(?:function\s+[$\w]+\s*\(|(?:\b[$\w]+\s*=\s*)?\(?[$\w\s,]*\)?\s*=>\s*)\{[^}]*?currentTheme[^}]*?setTheme[^}]*?return\s*\[\s*[$\w]+\s*,\s*([$\w]+)\s*\]\s*;?\s*\}/
  );
  if (m && !m[0].includes('"winter"') && !m[0].includes("'winter'")) {
    const rep = m[0].replace(
      /return\s*\[\s*[$\w]+\s*,\s*([$\w]+)\s*\]/,
      `return["winter",$1]`
    );
    const newSrc =
      src.substring(0, start + m.index!) +
      rep +
      src.substring(start + m.index! + m[0].length);
    showDiff(src, newSrc, 'force winter', 0, 0);
    return { src: newSrc, changed: true };
  }
  return { src, changed: false };
}

function patchAddWinterCaseToSwitch(src: string): {
  src: string;
  changed: boolean;
} {
  if (src.includes('case"winter"')) return { src, changed: false };
  const pivot = src.indexOf('dark-daltonized');
  if (pivot === -1) return { src, changed: false };
  const start = Math.max(0, pivot - 50),
    slice = src.substring(start, Math.min(src.length, pivot + 300));
  const m = slice.match(/case\s*["']dark-daltonized["']\s*:\s*return[^;]+;/);
  if (m) {
    const res =
      src.slice(0, start + m.index! + m[0].length) +
      `case"winter":return${JSON.stringify(WINTER_THEME_COLORS)};` +
      src.slice(start + m.index! + m[0].length);
    showDiff(src, res, 'winter switch', 0, 0);
    return { src: res, changed: true };
  }
  return { src, changed: false };
}

function patchBypassAppleTerminal(src: string): {
  src: string;
  changed: boolean;
} {
  if (!src.includes('Apple_Terminal')) return { src, changed: false };
  const res = src.replace(
    /if\s*\(\s*[$\w]+\.terminal\s*===\s*["']Apple_Terminal["']\s*\)/g,
    'if(false)'
  );
  if (res !== src) showDiff(src, res, 'bypass terminal', 0, 0);
  return { src: res, changed: res !== src };
}

export const writeWinterTheme = (oldFile: string): string | null => {
  let newFile = oldFile;
  const applied: string[] = [];
  [
    { n: 'hook', f: patchForceWinterTheme },
    { n: 'switch', f: patchAddWinterCaseToSwitch },
    { n: 'logos', f: (s: string) => patchClawdLogos(s) },
    { n: 'bypass', f: patchBypassAppleTerminal },
  ].forEach(s => {
    const r = s.f(newFile);
    if (r.changed) {
      newFile = r.src;
      applied.push(s.n);
    }
  });
  if (applied.length === 0) return null;
  console.log(`patch: winterTheme: applied: ${applied.join(', ')}`);
  return newFile;
};

export const WINTER_THEME_COLORS: Theme['colors'] = {
  autoAccept: 'rgb(175,135,255)',
  bashBorder: ICE_BLUE,
  claude: ICE_BLUE,
  claudeShimmer: 'rgb(200,230,240)',
  claudeBlue_FOR_SYSTEM_SPINNER: 'rgb(147,165,255)',
  claudeBlueShimmer_FOR_SYSTEM_SPINNER: 'rgb(177,195,255)',
  permission: ICE_BLUE,
  permissionShimmer: 'rgb(200,230,240)',
  planMode: 'rgb(72,150,170)',
  ide: 'rgb(71,130,200)',
  promptBorder: 'rgb(136,136,136)',
  promptBorderShimmer: 'rgb(166,166,166)',
  text: 'rgb(255,255,255)',
  inverseText: 'rgb(0,0,0)',
  inactive: 'rgb(153,153,153)',
  subtle: 'rgb(80,80,80)',
  suggestion: ICE_BLUE,
  remember: ICE_BLUE,
  background: 'rgb(0,180,200)',
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
  clawd_body: ICE_BLUE,
  clawd_background: 'rgb(0,0,0)',
  userMessageBackground: 'rgb(55,55,55)',
  bashMessageBackgroundColor: 'rgb(65,60,65)',
  memoryBackgroundColor: 'rgb(55,65,70)',
  rate_limit_fill: ICE_BLUE,
  rate_limit_empty: 'rgb(80,83,112)',
};
