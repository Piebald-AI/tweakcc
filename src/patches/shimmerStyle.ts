// Please see the note about writing patches in ./index
//
// Shimmer Style Patch - control the glimmer that sweeps across the spinner
// message while Claude is working ("Thinking…", "Reticulating…").
//
// CC 2.1.295 (the spinner hook and the shimmer renderer share one chunk):
//   Z=l==="requesting"?50:zn,gt=J(()=>ae(c),[c]),dt=gt+2*le,
//   ht=Math.floor(T/Z),Lt=t?-100:U?-100:l==="requesting"?ht%dt-le:gt+le-ht%dt,
//   At=t?0:l==="tool-use"?oo(T):0,...
//   ...
//   let kt=c-1,xt=c+1;if(kt>=T||xt<0){...}
//
// - `Z` is the time per shimmer step (50ms while requesting, 200ms otherwise).
// - `Lt` is the glimmer position; -100 parks it off-screen (reduced motion).
// - `At` is the tool-use flash, which blends in the shimmer color.
// - `kt..xt` is the highlighted window (3 cells); `le` is the padding the
//   sweep travels past each end of the message.

import { showDiff } from './index';

export interface ShimmerStyleOptions {
  enabled: boolean;
  stepMs: number | null;
  width: number | null;
}

export const isShimmerCustomized = (
  shimmer: ShimmerStyleOptions | undefined
): boolean =>
  !!shimmer &&
  (!shimmer.enabled || shimmer.stepMs !== null || shimmer.width !== null);

const replaceFirst = (
  file: string,
  pattern: RegExp,
  replace: (match: RegExpMatchArray) => string
): string | null => {
  const match = file.match(pattern);
  if (!match || match.index === undefined) return null;
  const replacement = replace(match);
  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;
  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);
  showDiff(file, newFile, replacement, startIndex, endIndex);
  return newFile;
};

export const writeShimmerStyle = (
  oldFile: string,
  { enabled, stepMs, width }: ShimmerStyleOptions
): string | null => {
  const stepMatch = oldFile.match(
    /([$\w]+)=([$\w]+)==="requesting"\?50:[$\w]+,/
  );
  if (!stepMatch) return null;
  const [stepDecl, stepVar, modeVar] = stepMatch;
  let file: string | null = oldFile;

  if (stepMs !== null) {
    file = replaceFirst(
      file,
      new RegExp(stepDecl.replace(/[$?.]/g, '\\$&')),
      () => `${stepVar}=${Math.max(1, Math.round(stepMs))},`
    );
    if (!file) return null;
  }

  if (!enabled) {
    // Force the reduced-motion branches: glimmer parked, no tool-use flash.
    file = replaceFirst(
      file,
      /([$\w]+)=([$\w]+)\?-100:[$\w]+\?-100:/,
      ([whole, glimmer]) => `${glimmer}=!0||${whole.slice(glimmer.length + 1)}`
    );
    if (!file) return null;
    file = replaceFirst(
      file,
      new RegExp(`,([$\\w]+)=[$\\w]+\\?0:${modeVar}==="tool-use"\\?`),
      ([whole, flash]) => `,${flash}=!0||${whole.slice(flash.length + 2)}`
    );
    if (!file) return null;
  }

  if (width !== null) {
    const cells = Math.max(1, Math.round(width));
    const left = Math.floor((cells - 1) / 2);
    const right = cells - 1 - left;
    file = replaceFirst(
      file,
      /let ([$\w]+)=([$\w]+)-1,([$\w]+)=\2\+1;if\(\1>=/,
      ([, start, center, end]) =>
        `let ${start}=${center}-${left},${end}=${center}+${right};if(${start}>=`
    );
    if (!file) return null;
    // Pad the sweep by at least the window width so a wide window still
    // fully leaves the message between passes.
    file = replaceFirst(
      file,
      /([$\w]+)=([$\w]+)\+2\*([$\w]+),([^;]*?)==="requesting"\?([$\w]+)%\1-\3:\2\+\3-\5%\1,/,
      ([, period, msgWidth, pad, middle, tick]) => {
        const p = `Math.max(${pad},${cells})`;
        return `${period}=${msgWidth}+2*${p},${middle}==="requesting"?${tick}%${period}-${p}:${msgWidth}+${p}-${tick}%${period},`;
      }
    );
    if (!file) return null;
  }

  return file === oldFile ? null : file;
};
