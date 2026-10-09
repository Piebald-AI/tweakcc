// Please see the note about writing patches in ./index

import { showDiff } from './index';

// `=[...X,...[...X].reverse()]` (older) or `=[...X,...X.toReversed()]`
// (CC 2.1.2xx, which also keeps one mirrored copy per terminal-specific
// frame set, e.g. a Ghostty variant and a default variant).
const mirrorPattern =
  /=\s*\[\.\.\.([$\w]+),\s*\.\.\.?(?:\[\.\.\.\1\]\.reverse\(\)|\1\.toReversed\(\))\]/g;

// CC 2.1.2xx no longer steps the main spinner through the mirrored array. Its
// frame index "breathes" up and back down the plain symbol list on a cosine
// over a fixed period, so it ping-pongs whatever the arrays above hold:
//   function Xn(l){let t=XPe(l,qn);return Math.round(t*(Ncn().length-1))}
// (2.1.295, where XPe(r,t)=(1-Math.cos(2*Math.PI*r/t))/2 and qn=2000).
const breathingFramePattern =
  /(function [$\w]+\(([$\w]+)\)\{)let ([$\w]+)=[$\w]+\(\2,([$\w]+|\d+)\);return Math\.round\(\3\*\(([$\w]+)\(\)\.length-1\)\)\}/;

/**
 * Turns the breathing frame index into a sawtooth that restarts at the first
 * frame. The period expression is kept, so a thinker-symbol-speed rewrite of it
 * still applies: one breathing period visits 2*(frames-1) frames, and each
 * frame keeps that same duration here.
 */
const writeRestartingBreathingFrame = (oldFile: string): string | null => {
  const match = oldFile.match(breathingFramePattern);
  if (!match || match.index === undefined) return null;
  const [, head, time, count, period, frames] = match;
  const replacement =
    `${head}let ${count}=${frames}().length;` +
    `return Math.floor(${time}*2*Math.max(1,${count}-1)/${period})%${count}}`;
  const start = match.index;
  const end = start + match[0].length;
  const newFile = oldFile.slice(0, start) + replacement + oldFile.slice(end);
  showDiff(oldFile, newFile, replacement, start, end);
  return newFile;
};

export const writeThinkerSymbolMirrorOption = (
  oldFile: string,
  enableMirror: boolean
): string | null => {
  // Code-split builds keep the frame arrays and the breathing frame index in
  // different modules, so patch whichever this source contains.
  const restarted = enableMirror
    ? null
    : writeRestartingBreathingFrame(oldFile);
  const file = restarted ?? oldFile;

  const matches = [...file.matchAll(mirrorPattern)];
  if (matches.length === 0) {
    if (restarted !== null) return restarted;
    console.error('patch: thinker symbol mirror option: failed to find match');
    return null;
  }

  let newFile = file;
  for (const match of matches.reverse()) {
    const varName = match[1];
    const newArray = enableMirror
      ? `=[...${varName},...[...${varName}].reverse()]`
      : `=[...${varName}]`;
    const start = match.index!;
    const end = start + match[0].length;
    const before = newFile;
    newFile = newFile.slice(0, start) + newArray + newFile.slice(end);
    showDiff(before, newFile, newArray, start, end);
  }
  return newFile;
};
