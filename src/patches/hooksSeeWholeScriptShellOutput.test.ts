import { describe, expect, it } from 'vitest';

import { writeHooksSeeWholeScriptShellOutput } from './hooksSeeWholeScriptShellOutput';

// A Code Mode script's tool call, from the end of the call to its result, in
// CC 2.1.332 (chunk-h3f56h75.js).
const CALL =
  'let Ao=!1,In=ge.byHook!==void 0,{shellOutputSpilled:er,shellOutputCut:Co}=ge.byHook?Eo:Qn(ge.data),hd=Ds(ge.data),gd=async(B)=>{if(O?.leaveSavedOutput===void 0||!Pe(B)||!ar(l.readTool??e,n,l.readTool!==void 0))return xo(B,z);return O.leaveSavedOutput({path:String(B.persistedOutputPath),readBack:(de)=>xo(B,de),facts:z}),{...B,stdout:h$e(String(B.stdout),r$).preview,stdoutTruncated:!0}},xo=(B,de)=>{let ie={folder:TN(n.session),projectsDir:Am()};if(de===void 0)return Or(B,ie);de.readBack=!0;let Te=de.wantsWhole&&!n.abortController.signal.aborted;return Or(B,ie,{facts:de,ownBytes:hd,readWhole:Te})},yd=P_r(L),Po=!1,Io=ge.data,tr,nr=Promise.withResolvers();using Vc={[Symbol.dispose]:()=>nr.resolve(!1)};try{for(let B of Xr("hooks")?[void 0]:[{managedHooksExcluded:!0},{managedHooksOnly:!0}])for await(let de of mdt(Je,e,L,o.message.id,Et,ge.data,o.requestId,void 0,void 0,md,{...B,hookChangedFile:nr.promise},!0,ge.byHook===void 0)){if(Ao=!0,"message"in de&&d8e(de.message))Y?.messages.push(de.message);if("updatedToolOutput"in de&&(xf(e)||e.outputSchema?.safeParse(de.updatedToolOutput)?.success!==!1)){let ie=de.updatedToolOutput;if(e.restoreTransientForRemap)try{ie=e.restoreTransientForRemap(ge.data,ie)}catch(Te){i(Te),ie=de.updatedToolOutput}if(ge.data=ie,In=!0,xf(e))tr=B?.managedHooksOnly?"managed":"other"}}}finally{Po=x_r(L,yd)}if(In)gt=Kmo(oai(e,Io,L)),Sve(n.agentId,ut,!0);if(Ao){let B=await Lgs(e.name,L,Et,n.readFileState);if(nr.resolve(B!==null),B!==null)Y?.messages.push(B)}if(D(),Po)return te(O_r(e.name));let Mo=tr===void 0?void 0:e.outputSchema?.safeParse(ge.data);if(Mo?.success===!1){if(tr==="managed"&&bdt(n,e))return te(`a managed PostToolUse hook rewrote ${e.name} with a result that does not match its output shape: ${Mo.error.message}`);if(Array.isArray(ge.data))return te(`${e.name} ran, and its result was not delivered: a PostToolUse hook replaced it with a list whose items are not all content blocks.`);ge.data=Yu(ge.data,Io)}u(ge,{tool:e,newMessages:ge.newMessages,contextLayers:ge.contextLayers,isResult:!0,mcpMeta:ge.mcpMeta,...Y!==void 0&&{hookFeedback:ne()},...er&&{shellSpill:{cut:Co}}});let hn=ge.data;if(e.name===ke||e.name===kt){if(hn=In?Cr(hn,er,Co):er&&Ece().includes(e)?await gd(hn):hn,z!==void 0){if(In)z.hookRewrote=!0;if(n.abortController.signal.aborted)z.whole=void 0}}return It(ge.data,hn,Re,ye,{...ge,movedToBackground:Ro})';

// The same module's function that marks a hook-rewritten saved output as cut.
const markCut = (e: Output, n: boolean, r: boolean) =>
  !n
    ? e
    : {
        ...e,
        stdoutTruncated: true,
        stdoutRewrittenByHook: true,
        ...(r && { spillFileCut: true }),
      };

type Output = Record<string, unknown> & { stdout: string };

const PREVIEW = 30000;
const SECRET = 'DB_PASSWORD=canary-not-a-secret';
const REDACTED = 'DB_PASSWORD=[redacted]';
const printed = (at: number) => {
  const text = 'x'.repeat(59000);
  return text.slice(0, at) + SECRET + text.slice(at);
};

interface Run {
  result: Output;
  hookInputs: Output[];
  readBacks: number;
}

const run = async (
  code: string,
  {
    stdout,
    redact = true,
    readBack = (data: Output) => ({
      ...data,
      stdout,
      stdoutTruncated: false,
      inlineChars: PREVIEW,
    }),
  }: {
    stdout: string;
    redact?: boolean;
    readBack?: (data: Output) => Output;
  }
): Promise<Run> => {
  const hookInputs: Output[] = [];
  let readBacks = 0;
  const tool = { name: 'Bash' };
  const data: Output = {
    stdout: stdout.slice(0, PREVIEW),
    stderr: '',
    interrupted: false,
    ...(stdout.length > PREVIEW && {
      persistedOutputPath: '/tool-results/out.txt',
      persistedOutputSize: stdout.length,
    }),
  };
  const stubs: Record<string, unknown> = {
    ge: { data },
    Eo: undefined,
    Qn: (B?: Output) => ({
      shellOutputSpilled: typeof B?.persistedOutputPath === 'string',
      shellOutputCut: false,
    }),
    Ds: () => stdout.length,
    O: undefined,
    Pe: () => true,
    ar: () => false,
    l: {},
    e: tool,
    n: {
      session: {},
      abortController: { signal: { aborted: false } },
      agentId: 'a',
      readFileState: {},
    },
    z: {},
    h$e: undefined,
    r$: undefined,
    TN: () => '/tool-results',
    Am: () => '/projects',
    Or: async (B: Output) => {
      readBacks++;
      return readBack(B);
    },
    P_r: () => 0,
    L: 'toolu_1',
    Xr: () => false,
    mdt: async function* (...args: unknown[]) {
      const input = args[5] as Output;
      if ((args[10] as { managedHooksOnly?: boolean }).managedHooksOnly) return;
      hookInputs.push(input);
      if (redact && input.stdout.includes(SECRET))
        yield {
          updatedToolOutput: {
            ...input,
            stdout: input.stdout.replace(SECRET, REDACTED),
          },
        };
    },
    Je: undefined,
    o: { message: { id: 'msg_1' }, requestId: 'req_1' },
    Et: {},
    md: 1,
    d8e: () => false,
    Y: undefined,
    xf: () => false,
    i: () => {},
    x_r: () => false,
    gt: undefined,
    Kmo: () => undefined,
    oai: () => undefined,
    Sve: () => {},
    ut: undefined,
    Lgs: async () => null,
    D: () => {},
    te: (x: unknown) => x,
    O_r: (x: unknown) => x,
    bdt: () => false,
    Yu: (x: unknown) => x,
    u: () => {},
    ne: () => [],
    ke: 'Bash',
    kt: 'PowerShell',
    Cr: markCut,
    Ece: () => [tool],
    It: (_data: unknown, result: Output) => result,
    Re: {},
    ye: undefined,
    Ro: undefined,
  };
  const result = (await new Function(
    ...Object.keys(stubs),
    `return(async()=>{${code}})()`
  )(...Object.values(stubs))) as Output;
  return { result, hookInputs, readBacks };
};

describe('writeHooksSeeWholeScriptShellOutput', () => {
  const patched = () => writeHooksSeeWholeScriptShellOutput(CALL)!;

  it('without the patch, a rewrite cuts the data and a late secret gets through', async () => {
    const early = await run(CALL, { stdout: printed(1000) });
    expect(early.hookInputs[0].stdout).toHaveLength(PREVIEW);
    expect(early.result.stdout).toHaveLength(
      PREVIEW - SECRET.length + REDACTED.length
    );
    expect(early.result.stdoutRewrittenByHook).toBe(true);

    const late = await run(CALL, { stdout: printed(40000) });
    expect(late.result.stdout).toContain(SECRET);
  });

  it('hands the hooks the whole output and keeps their rewrite whole', async () => {
    for (const at of [1000, 40000]) {
      const { result, hookInputs, readBacks } = await run(patched(), {
        stdout: printed(at),
      });
      expect(hookInputs[0].stdout).toBe(printed(at));
      expect(hookInputs[0]).not.toHaveProperty('stdoutTruncated');
      expect(hookInputs[0]).not.toHaveProperty('inlineChars');
      expect(readBacks).toBe(1);
      expect(result.stdout).toHaveLength(
        printed(at).length - SECRET.length + REDACTED.length
      );
      expect(result.stdout).not.toContain(SECRET);
      expect(result).not.toHaveProperty('stdoutRewrittenByHook');
      expect(result.persistedOutputPath).toBe('/tool-results/out.txt');
    }
  });

  it('reads the output back again for the script when no hook rewrites it', async () => {
    const { result, hookInputs, readBacks } = await run(patched(), {
      stdout: printed(1000),
      redact: false,
    });
    expect(hookInputs[0].stdout).toBe(printed(1000));
    expect(readBacks).toBe(2);
    expect(result.stdout).toBe(printed(1000));
  });

  it('keeps the preview for the hooks when the saved output cannot be read whole', async () => {
    const { result, hookInputs } = await run(patched(), {
      stdout: printed(1000),
      readBack: data => ({ ...data, stdoutTruncated: true }),
    });
    expect(hookInputs[0].stdout).toHaveLength(PREVIEW);
    expect(result.stdoutRewrittenByHook).toBe(true);
  });

  it('reads nothing back when the output was not saved', async () => {
    const { hookInputs, readBacks } = await run(patched(), { stdout: SECRET });
    expect(hookInputs[0].stdout).toBe(SECRET);
    expect(readBacks).toBe(0);
  });

  it('returns null when the script tool call is not there', () => {
    expect(writeHooksSeeWholeScriptShellOutput('let x=1;')).toBeNull();
    expect(
      writeHooksSeeWholeScriptShellOutput(
        CALL.replace('?await gd(hn)', '?gd(hn)')
      )
    ).toBeNull();
  });
});
