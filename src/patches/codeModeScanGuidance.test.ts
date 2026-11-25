import { describe, expect, it } from 'vitest';

import { writeCodeModeScanGuidance } from './codeModeScanGuidance';

// The REPL tool prompt's paragraph on what a call costs, in its two variants,
// and the template line that places it, from CC 2.1.332 (chunk-j03wwfcm.js).
const PROMPT =
  'let J=s?"What a `REPL` call costs: mostly what it returns, which stays in your context for every later step. About 150 lines of output cost as much as one more call. So search first and print ranges of long files, summarise data files and logs inside the script (counts, shapes, the odd rows), and after an edit return the failing tests and `git diff --stat` unless you mean to review the diff. This is about how much you print, not how much you check: write and run tests as you otherwise would.":"What a `REPL` call costs: each call is a full model round-trip \\u2014 the whole conversation is re-read before your script runs, and you wait for the reply \\u2014 while the work inside a script (shell commands, file reads, searches, tool calls) is comparatively free, and runs concurrently when you fan it out with `Promise.all`. So the expensive thing is coming back to decide, not doing more in one go: gather what a decision could plausibly need in the script you are already writing, and come back for another call when the next step depends on what this one shows you.";return`\n\n${J}\n\nA script\'s output is its last expression\'s value plus anything it \\`self.log(...)\\`s along the way.`';

const render = (code: string, stressesOutputCost: boolean) =>
  new Function('s', code)(stressesOutputCost) as string;

describe('writeCodeModeScanGuidance', () => {
  it('adds the scan guidance to both variants of the cost paragraph', () => {
    const patched = writeCodeModeScanGuidance(PROMPT)!;
    for (const variant of [false, true]) {
      const prompt = render(patched, variant);
      expect(prompt).toBe(
        render(PROMPT, variant).replace(
          "\n\nA script's output",
          () =>
            " To scan many files, run one command over all of them with `$` (`rg`, `grep -r`, or a short `python3 -c` or `awk` program) and work on its output in the script, instead of reading each file with `file()` or `Read`: every read is a tool call with its own permission check and hooks.\n\nA script's output"
        )
      );
    }
  });

  it('returns null when the cost paragraph is not there', () => {
    expect(writeCodeModeScanGuidance('let x=1;')).toBeNull();
    expect(
      writeCodeModeScanGuidance(PROMPT.replace("A script's output", 'Output'))
    ).toBeNull();
  });
});
