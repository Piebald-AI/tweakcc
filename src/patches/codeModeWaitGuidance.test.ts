import { describe, expect, it } from 'vitest';

import { writeCodeModeWaitGuidance } from './codeModeWaitGuidance';

// Pieces of the REPL tool prompt from CC 2.1.332 (chunk-j03wwfcm.js): the
// async-lane flag, the note that uses the background-tasks check, the
// paragraph on preview(out), and the line that names the shell tool.
const PROMPT =
  'let c=0,I=Gte()&&(!Lg()||n.some((ue)=>ue.isMcp!==!0&&mt(ue,bo))),w=0;return[`A shell command with no timeout of its own ${Lfe()?"is stopped after 10 minutes (background tasks are off in this session, so what the note on `$` says about the background does not apply)":"moves to the background after 10 minutes"}`,`To keep a long output out of your context, return \\`preview(out)\\` or \\`preview(out, 2000)\\` instead of the output itself: it gives the first characters, and when \\`out\\` is an awaited \\`$\\` result (not its \\`.text()\\` string) whose output the shell tool saved to a file, it starts with the output\'s size and the file\'s path.\n${Q}${re}${N}`,`All tools work as async functions: \\`Read\\`, \\`Write\\`, \\`Edit\\`, \\`Glob\\`, \\`Grep\\`, \\`${y}\\`, etc.`].join(\'\\n\')';

interface Session {
  asyncRepl: boolean;
  headless: boolean;
  backgroundOff?: boolean;
  shellTool?: string;
}

const render = (code: string, session: Session) =>
  new Function('Gte', 'Lg', 'n', 'mt', 'bo', 'Lfe', 'y', 'Q', 're', 'N', code)(
    () => session.asyncRepl,
    () => session.headless,
    [{ name: 'Poll' }],
    (tool: { name: string }, name: string) => tool.name === name,
    'Poll',
    () => session.backgroundOff ?? false,
    session.shellTool ?? 'Bash',
    '',
    '',
    ''
  ) as string;

const LEAD =
  "it starts with the output's size and the file's path.\n\nDon't wait inside a script for something outside this machine";
const SHORT_TIMEOUT =
  '`await $`gh pr checks 123 --watch --fail-fast`.timeout(3000)` moves it to the background after 3 s.';
const BACKGROUND = (tool: string) =>
  `\`await tools.${tool}({command: 'gh pr checks 123 --watch --fail-fast', run_in_background: true})\` returns at once.`;

describe('writeCodeModeWaitGuidance', () => {
  const patched = writeCodeModeWaitGuidance(PROMPT)!;

  it('names a short timeout in the async lane, which refuses run_in_background', () => {
    const prompt = render(patched, { asyncRepl: true, headless: false });
    expect(prompt).toContain(LEAD);
    expect(prompt).toContain(SHORT_TIMEOUT);
    expect(prompt).not.toContain('run_in_background');
  });

  it('names run_in_background in the sync lane and in headless sessions', () => {
    for (const session of [
      { asyncRepl: false, headless: false },
      { asyncRepl: true, headless: true },
    ]) {
      const prompt = render(patched, session);
      expect(prompt).toContain(LEAD);
      expect(prompt).toContain(BACKGROUND('Bash'));
      expect(prompt).not.toContain('.timeout(3000)');
    }
    expect(
      render(patched, {
        asyncRepl: false,
        headless: false,
        shellTool: 'PowerShell',
      })
    ).toContain(BACKGROUND('PowerShell'));
  });

  it('leaves the prompt as it was when background tasks are off', () => {
    const session = { asyncRepl: true, headless: false, backgroundOff: true };
    expect(render(patched, session)).toBe(render(PROMPT, session));
  });

  it('returns null when the prompt is not there', () => {
    expect(writeCodeModeWaitGuidance('let x=1;')).toBeNull();
    expect(
      writeCodeModeWaitGuidance(PROMPT.replace('background tasks are off', ''))
    ).toBeNull();
    expect(
      writeCodeModeWaitGuidance(PROMPT.replace('isMcp', 'mcp'))
    ).toBeNull();
  });
});
