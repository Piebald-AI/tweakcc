// Please see the note about writing patches in ./index.ts.

import { LocationResult, showDiff } from './index.js';

// This patch forces the "/cost" ccommand to always show the cost by disabling the
// subscription gating check.  In minified code it looks like:
//   async call(){if(t2())return{type:"text",value:`With your ${aP1()} subscription, no need to monitor cost ...`};return{...}}
// We rewrite `if(t2())` to `if(!1)` for that specific branch, so it will never execute, and
// instead the detailed path will be taken.

const getIgnoreMaxSubscriptionLocation = (
  oldFile: string
): LocationResult | null => {
  // 1) Find the exact phrase
  const needle = 'subscription, no need to monitor cost';
  const phraseIdx = oldFile.indexOf(needle);
  if (phraseIdx === -1) {
    console.error('patch: ignoreMaxSubscription: phrase not found');
    return null;
  }

  // 2) Look back 60 chars and search for `if([$\w]+\(\))`.
  const windowStart = Math.max(0, phraseIdx - 60);
  const windowEnd = phraseIdx;
  const window = oldFile.slice(windowStart, windowEnd);
  const re = /if\(([$\w]+)\(\)\)/g;
  let last: RegExpMatchArray | null = null;
  for (const m of window.matchAll(re)) {
    last = m;
  }
  if (!last || last.index === undefined) {
    console.error(
      'patch: ignoreMaxSubscription: could not match if(<id>()) nearby'
    );
    return null;
  }

  // 3) Return the location of the whole `if(<id>())` to replace with `if(!1)`.
  const startIndex = windowStart + last.index;
  const endIndex = startIndex + last[0].length;
  return { startIndex, endIndex };
};

export const writeIgnoreMaxSubscription = (oldFile: string): string | null => {
  const location = getIgnoreMaxSubscriptionLocation(oldFile);
  if (!location) {
    return null;
  }

  const newContent = 'if(!1)';
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newContent +
    oldFile.slice(location.endIndex);
  showDiff(
    oldFile,
    newFile,
    newContent,
    location.startIndex,
    location.endIndex
  );
  return newFile;
};
