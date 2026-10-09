// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * CC v2.0.50
 * ```diff
 *  case "thinking":
 * -  if (!V && !I) return null;
 *    return w3.createElement(Q$Q, {
 *      addMargin: B,
 *      param: A,
 * -    isTranscriptMode: V,
 * +    isTranscriptMode: true,
 *      verbose: I,
 *    });
 * ```
 *
 * CC v2.1.18
 * ```diff
 *  case "thinking": {
 * -  if (!D && !H) return null;
 *    let T = D && !(!P || f === P),
 *      k;
 *    if (K[22] !== Y || K[23] !== D || K[24] !== q || K[25] !== T || K[26] !== H)
 *      k = Y9.createElement(YW1, {
 *        addMargin: Y,
 *        param: q,
 * -      isTranscriptMode: D,
 * +      isTranscriptMode: true,
 *        verbose: H,
 *        hideInTranscript: T,
 *      });
 *  }
 * ```
 *
 * CC v2.1.295 (chunked native build): thinking blocks the narration
 * classifier flags render as assistant text first; that branch is kept.
 * ```diff
 *  case "thinking": {
 *    if (rwt(l)) { ...; de = e($a, {...}); return de }
 * -  if (!j && !b) { return null }
 *    let de;
 *    if (X[46] !== f || X[47] !== j || X[48] !== l || X[49] !== b)
 *      de = e(ws, {
 *        addMargin: f,
 *        param: l,
 * -      isTranscriptMode: j,
 * +      isTranscriptMode: true,
 *        verbose: b,
 *      });
 *  }
 * ```
 */

// `case"thinking":` (+/- `{`) and, from 2.1.295, the narration branch
// `if(fn(x)){...return y}` (group 1); the `if(...)return null` early return
// (group 2, dropped); everything up to `isTranscriptMode:` (group 3); then the
// variable that gets replaced with `true`.
const RENDER_PATTERN =
  /(case"thinking":\{?(?:if\([$\w]+\([$\w]+\)\)\{.{0,600}?return [$\w]+\})?)(if\(.{0,80}?\)\s*(?:\{\s*return null\s*;?\s*\}|return null\s*;?))(.{0,400}?isTranscriptMode:)([$\w]+)\s*,/;

/**
 * CC v2.1.295 folds thinking-only messages into the collapsed tool-use row
 * ("Thought for 2s (ctrl+o to expand)") unless the narration classifier
 * flagged them. Let every thinking message break the row like flagged ones do.
 * ```diff
 * -if(t9r(Ce)||Fe!==void 0&&swt(Fe.message))Te(),H.push(Ce);
 * +if(t9r(Ce)||Fe!==void 0)Te(),H.push(Ce);
 *  else if(Fe!==void 0){let Ge=Fe.memo.summary??=...
 * ```
 */
const COLLAPSE_PATTERN =
  /(\|\|([$\w]+)!==void 0)&&[$\w]+\(\2\.message\)(\)[$\w]+\(\),[$\w]+\.push\([$\w]+\);else if\(\2!==void 0\)\{let [$\w]+=\2\.memo\.summary\?\?=)/;

/**
 * CC v2.1.295 asks the API to omit thinking text unless the
 * `showThinkingSummaries` setting is true. Default it to true; an explicit
 * `false` in settings still wins.
 * ```diff
 * -function fUn(){return ft().showThinkingSummaries??!1}
 * +function fUn(){return ft().showThinkingSummaries??!0}
 * ```
 */
const SUMMARIES_PATTERN =
  /(function [$\w]+\(\)\{return [$\w]+\(\)\.showThinkingSummaries\?\?)!1\}/;

const replaceMatch = (
  oldFile: string,
  match: RegExpMatchArray,
  replacement: string
): string => {
  const startIndex = match.index!;
  const endIndex = startIndex + match[0].length;
  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);
  showDiff(oldFile, newFile, replacement, startIndex, endIndex);
  return newFile;
};

const patchRender = (oldFile: string): string | null => {
  const match = oldFile.match(RENDER_PATTERN);
  if (!match) return null;
  // Skip match[2] (removes the if-return-null), set isTranscriptMode to true
  return replaceMatch(oldFile, match, match[1] + match[3] + 'true,');
};

export const writeThinkingVisibility = (oldFile: string): string | null => {
  const newFile = patchRender(oldFile);
  if (newFile === null) {
    console.error(
      'patch: thinkingVisibility: failed to find thinking visibility pattern'
    );
  }
  return newFile;
};

/**
 * CC 2.1.280+ split bundles: the thinking renderer, the message-collapsing
 * pass and the thinking-display setting live in different chunks, and all
 * three must change for thinking text to show in the normal view.
 */
export const writeThinkingVisibilityModules = (
  modules: Map<string, string>
): Map<string, string> | null => {
  const steps: [string, RegExp, (file: string) => string | null][] = [
    ['thinking renderer', RENDER_PATTERN, patchRender],
    [
      'thinking collapse',
      COLLAPSE_PATTERN,
      file => {
        const match = file.match(COLLAPSE_PATTERN)!;
        return replaceMatch(file, match, match[1] + match[3]);
      },
    ],
    [
      'showThinkingSummaries default',
      SUMMARIES_PATTERN,
      file => {
        const match = file.match(SUMMARIES_PATTERN)!;
        return replaceMatch(file, match, match[1] + '!0}');
      },
    ],
  ];

  const changed = new Map<string, string>();
  for (const [label, pattern, apply] of steps) {
    const name = [...modules.keys()].find(n =>
      pattern.test(changed.get(n) ?? modules.get(n)!)
    );
    if (name === undefined) {
      console.error(`patch: thinkingVisibility: failed to find ${label}`);
      return null;
    }
    changed.set(name, apply(changed.get(name) ?? modules.get(name)!)!);
  }
  return changed;
};
