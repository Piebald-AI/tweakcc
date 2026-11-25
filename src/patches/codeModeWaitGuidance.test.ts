import { describe, expect, it } from 'vitest';

import { writeCodeModeWaitGuidance } from './codeModeWaitGuidance';

// Three pieces of the REPL tool prompt from CC 2.1.332 (chunk-j03wwfcm.js):
// the note that uses the background-tasks check, the paragraph on
// preview(out), and the line that names the shell tool.
const PROMPT =
  'return[`A shell command with no timeout of its own ${Lfe()?"is stopped after 10 minutes (background tasks are off in this session, so what the note on `$` says about the background does not apply)":"moves to the background after 10 minutes"}`,`To keep a long output out of your context, return \\`preview(out)\\` or \\`preview(out, 2000)\\` instead of the output itself: it gives the first characters, and when \\`out\\` is an awaited \\`$\\` result (not its \\`.text()\\` string) whose output the shell tool saved to a file, it starts with the output\'s size and the file\'s path.\n${Q}${re}${N}`,`All tools work as async functions: \\`Read\\`, \\`Write\\`, \\`Edit\\`, \\`Glob\\`, \\`Grep\\`, \\`${y}\\`, etc.`].join(\'\\n\')';

const render = (code: string, backgroundOff: boolean, shellTool: string) =>
  new Function('Lfe', 'y', 'Q', 're', 'N', code)(
    () => backgroundOff,
    shellTool,
    '',
    '',
    ''
  ) as string;

describe('writeCodeModeWaitGuidance', () => {
  it('adds the paragraph after the one on preview(out)', () => {
    const prompt = render(writeCodeModeWaitGuidance(PROMPT)!, false, 'Bash');
    expect(prompt).toContain(
      "it starts with the output's size and the file's path.\n\nDon't wait inside a script for something outside this machine"
    );
    expect(prompt).toContain(
      "`await tools.Bash({command: 'gh pr checks 123 --watch --fail-fast', run_in_background: true})`"
    );
    expect(
      render(writeCodeModeWaitGuidance(PROMPT)!, false, 'PowerShell')
    ).toContain('await tools.PowerShell({');
  });

  it('leaves the prompt as it was when background tasks are off', () => {
    expect(render(writeCodeModeWaitGuidance(PROMPT)!, true, 'Bash')).toBe(
      render(PROMPT, true, 'Bash')
    );
  });

  it('returns null when the prompt is not there', () => {
    expect(writeCodeModeWaitGuidance('let x=1;')).toBeNull();
    expect(
      writeCodeModeWaitGuidance(PROMPT.replace('background tasks are off', ''))
    ).toBeNull();
  });
});
