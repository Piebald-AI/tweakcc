import { describe, expect, it } from 'vitest';

import { writeCodeModeBackgroundShell } from './codeModeBackgroundShell';

// CC 2.1.332, chunk-nthvjcm6.js: loads the $ prelude.
const PRELUDE_LOADER =
  'import{Xt}from"/$bunfs/root/chunk-d5hjpa3k.js";var t="/$bunfs/root/shell.prelude.js-e9940635.txt.zst";var e=Xt(t,import.meta.dirname);export{e as default};';

// The chain methods of the promise $ returns, from the 2.1.332 $ prelude.
const PRELUDE_CHAIN =
  "    const chain = (name, f) => defineProperty(p, name, {\n        value: (...a) => {\n            f(...a);\n            return p;\n        },\n    });\n    chain('nothrow', () => {\n        nothrow = true;\n    });\n    chain('throws', (b) => {\n        nothrow = !b;\n    });\n    chain('quiet', () => { });\n    chain('timeout', (n) => {\n        ms = n;\n    });\n    chain('cwd', (d) => {\n        cwd = BuiltinString(d);\n    });\n    chain('env', (e) => {\n        env = e;\n    });\n";

// CC 2.1.332, chunk-h3f56h75.js: the host side of $ runs the command, and
// writes the text of a result that went to the background.
const HOST_RUN =
  'let P;try{P=e.useTool(h?ke:kt,{command:M+n,...r!==void 0&&{timeout:r}})}finally{N.pending=void 0,N.facts=void 0}let I=await P,W=kZo(I,r,J);if(e.noteBackgroundCommand(u,I),!W.truncated&&(W.file===void 0||J.readBack))return W;';
const HOST_STILL_RUNNING =
  'function vl({taskId:e,timedOutAfterMs:n,requestedMs:r,backgroundedByUser:o,ending:l}){let u=(y)=>`${Math.max(1,Math.round(y/1000))}s`,c=n===void 0?"its timeout":r!==void 0&&r>n?`the ${u(n)} maximum (you asked for ${u(r)})`:`its ${u(n)} timeout`,m=o?"The user moved the command to the background.":`The command did not finish within ${c}.`,h=l===void 0?"Read that file (cat or tail it) to check progress, and you will be notified when it exits."+Fs(o||n!==void 0):"Read that file (cat or tail it) to check progress. It is stopped when you give your final response, so you will be notified of its exit only if it exits while you are still working.";return`[still running] ${m} It was NOT killed: it continues as background task ${e}, and its output streams to ${ym(e)}. ${h} Do not start it again.`}';

// CC 2.1.332, chunk-j03wwfcm.js: where the REPL declarations are read, and
// the advice on keeping a dev server running.
const DECLARATIONS =
  'async function ro(n){let{HELPER_DTS:e}=await import("/$bunfs/root/chunk-6xskwnqh.js"),o=n.isBash?"bash":"powershell",s=n.asyncLane?"async":"sync",{unavailable:l=[]}=n,c=fr(e.core[o][s].trimEnd(),l),m=bdr()?pr(c):c;';
const ADVICE =
  'function mr(n,e,o){if(!ce())return"";let s=e?" To keep a dev server or a watcher running, start it without awaiting it, as for a build below; it is stopped at its timeout.":o?" To keep a dev server, a watcher or a long job running, start it with `run_in_background`, as the paragraph on the time limit below says. Don\'t use `nohup`, `setsid` or `&` for this: Claude Code can\'t show or stop what they start.":" To keep a dev server or a watcher running, await it with a short timeout: `const server = await $`npm run dev`.timeout(3000)` moves it to the background after 3 s, where the user can see and stop it, and `server.running.outputPath` names the file with its output. Don\'t use `nohup`, `setsid` or `&` for this: Claude Code can\'t show or stop what they start.";return s}';

const SHELL_PROMISE =
  'interface ShellPromise extends Promise<ShellOutput> {\n    nothrow(): ShellPromise;\n    throws(on: boolean): ShellPromise;\n    quiet(): ShellPromise;\n    timeout(ms: number): ShellPromise;\n    cwd(dir: string): ShellPromise;\n';

// Runs minified code with the given stubs; any other free name is a global
// or undefined.
const run = (code: string, stubs: Record<string, unknown>): unknown =>
  new Function('scope', `with (scope) { ${code} }`)(
    new Proxy(stubs, {
      has: () => true,
      get: (target, name) =>
        name === Symbol.unscopables
          ? undefined
          : Object.hasOwn(target, name)
            ? target[name as string]
            : (globalThis as Record<PropertyKey, unknown>)[name],
    })
  );

const patched = (code: string) => writeCodeModeBackgroundShell(code)!;

// The timeout a chain of $ promise methods leaves behind.
const timeoutAfter = (
  loader: string,
  calls: (p: Record<string, (...args: unknown[]) => unknown>) => void
) => {
  // import.meta only parses in a module.
  const prelude = run(
    `${loader
      .replace(/^import[^;]*;/, '')
      .replace(/export\{.*$/, '')
      .replace('import.meta.dirname', 'dir')};return e`,
    {
      Xt: () =>
        `(p) => { let ms, nothrow, cwd, env; const defineProperty = Object.defineProperty, BuiltinString = String;\n${PRELUDE_CHAIN}    return () => ms; }`,
    }
  ) as string;
  const p = {} as Record<string, (...args: unknown[]) => unknown>;
  const timeout = (
    new Function(`return ${prelude}`)() as (p: object) => () => unknown
  )(p);
  calls(p);
  return timeout();
};

// The shell tool input and background note for a $ call with this timeout.
const hostCall = async (code: string, timeout: number | undefined) => {
  const calls: { input?: object; started?: unknown } = {};
  await (run(`return (async () => { ${code} })()`, {
    e: {
      useTool: (_name: string, input: object) => {
        calls.input = input;
        return Promise.resolve({ backgroundTaskId: 'b1' });
      },
      noteBackgroundCommand: (
        _command: string,
        _result: object,
        started?: unknown
      ) => {
        calls.started = started;
      },
    },
    h: true,
    ke: 'Bash',
    M: '',
    n: 'npm run dev',
    r: timeout,
    N: {},
    J: {},
    u: 'npm run dev',
    kZo: () => ({ truncated: false }),
  }) as Promise<unknown>);
  return calls;
};

const stillRunning = (code: string, requestedMs: number | undefined) =>
  (
    run(`${code};return vl`, {
      Fs: () => '',
      ym: (id: string) => `/tmp/${id}`,
    }) as (args: object) => string
  )({ taskId: 'b1', requestedMs, backgroundedByUser: false });

describe('writeCodeModeBackgroundShell', () => {
  it('adds .background(), which sets a timeout of 0', () => {
    expect(timeoutAfter(PRELUDE_LOADER, p => p.timeout(5000))).toBe(5000);
    expect(() => timeoutAfter(PRELUDE_LOADER, p => p.background())).toThrow();
    const loader = patched(PRELUDE_LOADER);
    expect(timeoutAfter(loader, p => p.background())).toBe(0);
    expect(timeoutAfter(loader, p => p.timeout(5000))).toBe(5000);
  });

  it('starts a command with a timeout of 0 in the background', async () => {
    expect(await hostCall(HOST_RUN, 0)).toEqual({
      input: { command: 'npm run dev', timeout: 0 },
      started: undefined,
    });
    const host = patched(HOST_RUN + HOST_STILL_RUNNING);
    expect(await hostCall(host, 0)).toEqual({
      input: { command: 'npm run dev', run_in_background: true },
      started: true,
    });
    expect(await hostCall(host, 3000)).toEqual({
      input: { command: 'npm run dev', timeout: 3000 },
      started: false,
    });
    expect(await hostCall(host, undefined)).toEqual({
      input: { command: 'npm run dev' },
      started: false,
    });
  });

  it('says a command with a timeout of 0 was started in the background', () => {
    const host = patched(HOST_RUN + HOST_STILL_RUNNING);
    const vl = host.slice(host.indexOf('function vl('));
    expect(stillRunning(HOST_STILL_RUNNING, 0)).toMatch(
      /^\[still running\] The command did not finish within its timeout\./
    );
    expect(stillRunning(vl, 0)).toMatch(
      /^\[still running\] It was started in the background\. It was NOT killed: it continues as background task b1/
    );
    expect(stillRunning(vl, 3000)).toMatch(
      /^\[still running\] The command did not finish within its timeout\./
    );
  });

  it('declares .background() and recommends it for dev servers', () => {
    const code = patched(DECLARATIONS + ADVICE);
    const read = /c=fr\((.*?),l\)/.exec(code)![1];
    const declarations = new Function('e', 'o', 's', `return ${read}`)(
      { core: { bash: { async: SHELL_PROMISE } } },
      'bash',
      'async'
    ) as string;
    expect(declarations).toContain(
      '    timeout(ms: number): ShellPromise;\n    /** runs the command in the background:'
    );
    expect(declarations).toContain(
      '    background(): ShellPromise;\n    cwd(dir: string): ShellPromise;'
    );
    const advice = (
      run(`${code.slice(code.indexOf('function mr('))};return mr`, {
        ce: () => true,
      }) as (a: unknown, bgOff: boolean, headless: boolean) => string
    )(undefined, false, false);
    expect(advice).toContain(
      '`const server = await $`npm run dev`.background()`'
    );
    expect(advice).not.toContain('.timeout(3000)');
  });

  it('returns null when $ is not there', () => {
    expect(writeCodeModeBackgroundShell('let x=1;')).toBeNull();
    expect(
      writeCodeModeBackgroundShell(HOST_RUN.replace('{timeout:r}', '{ms:r}'))
    ).toBeNull();
    expect(writeCodeModeBackgroundShell(DECLARATIONS)).toBeNull();
  });
});
