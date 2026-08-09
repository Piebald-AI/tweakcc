// Please see the note about writing patches in ./index

import { showDiff } from './index';
import stringWidth from 'string-width';

/** The width Claude Code ships, and what the box keeps when there is nothing to size. */
const VANILLA_BOX_WIDTH = 2;

/**
 * Width of the spinner symbol box, in terminal cells: the widest phase plus one
 * cell separating the symbol from the thinking verb.
 *
 * An empty phase list keeps the vanilla width: `Math.max()` of nothing is
 * -Infinity, which reached the bundle as `width:-Infinity`. That is valid
 * JavaScript, so neither `node --check` nor the parse gate would have caught it.
 *
 * Measured with display width rather than `String.length`, because the two only
 * agree for symbols that are single UTF-16 code units. A regional-indicator
 * flag is 4 code units but 2 cells, so sizing by `length` overshot the box and
 * pushed the verb away from the symbol (#925). Every shipped symbol set is
 * single-cell BMP characters, where both measures agree, which is why this only
 * ever showed up with custom symbols.
 */
export const thinkerSymbolBoxWidth = (phases: string[]): number =>
  phases.length === 0
    ? VANILLA_BOX_WIDTH
    : Math.max(...phases.map(phase => stringWidth(phase))) + 1;

// Claude Code 2.1.195 migrated the spinner symbol box to the JSX automatic
// runtime and React-Compiler memoization, so the old braced anchor
// `{flexWrap:"wrap",height:1,width:2}` no longer exists. The box is now spread
// inside a memoized `jsx` call as `…,flexWrap:"wrap",height:1,width:2,children:…`
// and the compiler emits one copy per render branch. The unbraced run is also a
// substring of the old braced form, so this stays compatible with older Claude
// Code versions (where it matches the single braced occurrence).
const widthPattern = /flexWrap:"wrap",height:1,width:2/;

// Claude Code builds each spinner's frame list the same way: the TERM-dependent
// symbol array that thinkerSymbolChars rewrites is ping-ponged into a
// forward-then-reverse sequence, `X=symbols(),FRAMES=[...X,...[...X].reverse()]`.
// Capturing those FRAMES names is what tells a spinner box apart from a box that
// merely shares its shape.
//
// Anchored on `=[...` rather than on the assigned name, then the name is read
// backwards off the match. Starting this backreferenced pattern with `[$\w]+`
// makes the engine retry it at every offset of a 22MB bundle: 600ms, against
// 8ms anchored on the literal. See the note about word boundaries in ./index.
const frameArrayPattern =
  /=\[\.\.\.([$\w]+),\.\.\.\[\.\.\.\1\]\.reverse\(\)\]/g;

const spinnerFrameVars = (file: string): string[] => {
  const names = new Set<string>();
  for (const match of file.matchAll(frameArrayPattern)) {
    const end = match.index;
    let start = end;
    while (start > 0 && /[$\w]/.test(file[start - 1])) start--;
    if (start < end) names.add(file.slice(start, end));
  }
  return [...names];
};

/**
 * Offsets of every `function` keyword, used as slice boundaries. Two positions
 * are treated as belonging to the same function when no `function` keyword
 * separates them, which is enough to tell one minified component from the next.
 */
const functionStarts = (file: string): number[] =>
  [...file.matchAll(/(?<![$\w])function[\s(]/g)].map(m => m.index);

/**
 * Indices into `starts` bounding the slice that contains `pos`.
 */
const sliceAround = (
  starts: number[],
  pos: number,
  end: number
): [number, number] => {
  let lo = 0;
  let hi = starts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= pos) lo = mid + 1;
    else hi = mid;
  }
  return [lo > 0 ? starts[lo - 1] : 0, lo < starts.length ? starts[lo] : end];
};

export const writeThinkerSymbolWidthLocation = (
  oldFile: string,
  width: number
): string | null => {
  const boxes = [...oldFile.matchAll(new RegExp(widthPattern.source, 'g'))].map(
    m => m.index
  );

  if (boxes.length === 0) {
    console.error('patch: thinker symbol width: failed to find match');
    return null;
  }

  // Claude Code renders this same box outside the spinner too: a deadline/status
  // component puts a static glyph in one. Resizing that one widens an unrelated
  // part of the UI as soon as the user picks symbols wider than the default, so
  // a box only qualifies when its function also references a spinner frame
  // array. If the frame arrays cannot be located, fall back to resizing every
  // box, which is what this patch did before the scoping: an upstream shape
  // change then costs the extra box again rather than the whole patch.
  const frameVars = spinnerFrameVars(oldFile);
  let targets = boxes;
  if (frameVars.length > 0) {
    // `$` is a valid identifier and minifiers do emit it. Interpolated raw into
    // the alternation it would become the end-of-input anchor, so no reference
    // would be found and every box would fall through to the fallback.
    const framePattern = new RegExp(
      `(?<![$\\w])(?:${frameVars
        .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|')})(?![$\\w])`,
      'g'
    );
    const frameRefs = [...oldFile.matchAll(framePattern)].map(m => m.index);
    const starts = functionStarts(oldFile);
    targets = boxes.filter(box => {
      const [from, to] = sliceAround(starts, box, oldFile.length);
      return frameRefs.some(ref => ref >= from && ref < to);
    });
    if (targets.length === 0) targets = boxes;
  }

  const replacement = `flexWrap:"wrap",height:1,width:${width}`;
  const matchLength = 'flexWrap:"wrap",height:1,width:2'.length;

  // Apply from the end so earlier offsets stay valid.
  let newFile = oldFile;
  for (let i = targets.length - 1; i >= 0; i--) {
    const start = targets[i];
    const before = newFile;
    newFile =
      newFile.slice(0, start) +
      replacement +
      newFile.slice(start + matchLength);
    showDiff(before, newFile, replacement, start, start + matchLength);
  }

  return newFile;
};
