// Please see the note about writing patches in ./index

import { isGraphContextActive } from './graphContext';
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
 */

export const writeThinkingVisibility = (oldFile: string): string | null => {
  // CC 2.1.2xx folds thinking into the grey collapsed tool group ("Thought
  // for 2s, read 2 files") before the per-block renderer below ever runs:
  //   else if(q_r(xe)||Oe!==void 0&&iRt(Oe.message))ve(),w.push(xe);else if(Oe!==void 0){let De=Oe.memo.summary…
  // Keep every thinking message standalone. On a module graph this lives in
  // a different module from the renderer, so each applies where it matches.
  const foldPattern =
    /else if\(([$\w]+\([$\w]+\))\|\|([$\w]+)!==void 0&&[$\w]+\(\2\.message\)\)(?=[$\w]+\(\),[$\w]+\.push\([$\w]+\);else if\(\2!==void 0\)\{let [$\w]+=\2\.memo\.summary)/;
  const foldMatch = oldFile.match(foldPattern);
  let file = oldFile;
  if (foldMatch && foldMatch.index !== undefined) {
    const replacement = `else if(${foldMatch[1]}||${foldMatch[2]}!==void 0)`;
    file =
      oldFile.slice(0, foldMatch.index) +
      replacement +
      oldFile.slice(foldMatch.index + foldMatch[0].length);
    showDiff(
      oldFile,
      file,
      replacement,
      foldMatch.index,
      foldMatch.index + foldMatch[0].length
    );
  }
  // CC 2.1.295 asks the API to omit thinking text (blocks arrive with an empty
  // `thinking` and only a signature) unless `showThinkingSummaries` is set:
  //   function fUn(){return ft().showThinkingSummaries??!1}
  // Default it to true; an explicit `false` in settings still wins. This lives
  // in a third module.
  const summariesPattern =
    /(function [$\w]+\(\)\{return [$\w]+\(\)\.showThinkingSummaries\?\?)!1\}/;
  const summariesMatch = file.match(summariesPattern);
  if (summariesMatch && summariesMatch.index !== undefined) {
    const replacement = summariesMatch[1] + '!0}';
    const before = file;
    file =
      before.slice(0, summariesMatch.index) +
      replacement +
      before.slice(summariesMatch.index + summariesMatch[0].length);
    showDiff(
      before,
      file,
      replacement,
      summariesMatch.index,
      summariesMatch.index + summariesMatch[0].length
    );
  }
  const rendered = writeThinkingRenderer(file);
  if (rendered) return rendered;
  if (file !== oldFile && isGraphContextActive()) return file;
  console.error(
    'patch: thinkingVisibility: failed to find thinking visibility pattern'
  );
  return null;
};

const writeThinkingRenderer = (oldFile: string): string | null => {
  // Unified pattern that matches both formats:
  // - Group 1: `case"thinking":` (+/- `{`)
  // - Group 2: `if(...) return null;` (the early return we want to remove)
  // - Group 3: Everything from `{` or return up to `isTranscriptMode:`
  // - Then the variable name followed by comma (replaced with `true,`)
  // CC 2.1.2xx first short-circuits redacted thinking with its own branch
  // (`if(sQe(l)){…return ue}`) before the early `return null`; group 1 keeps
  // that branch intact.
  const pattern =
    /(case"thinking":\{?(?:if\([$\w]+\([$\w]+\)\)\{.{0,400}?return [$\w]+\})?)(if\(.{0,80}?\)\s*(?:\{\s*return null\s*;?\s*\}|return null\s*;?))(.{0,400}?isTranscriptMode:)([$\w]+)\s*,/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    return null;
  }

  // Replacement: skip match[2] (removes the if-return-null), set isTranscriptMode to true
  const replacement = match[1] + match[3] + 'true,';

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);

  return newFile;
};
