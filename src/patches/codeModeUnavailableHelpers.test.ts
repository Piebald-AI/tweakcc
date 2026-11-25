import { describe, expect, it } from 'vitest';

import { writeCodeModeUnavailableHelpers } from './codeModeUnavailableHelpers';

// CC 2.1.332, chunk-r1b3qc87.js: where the default kernel makes the script
// context (the end of the function body).
const KERNEL =
  'for(let k of gdr(e))t.toolNames.add(k.name);let T={shared:t,vmContext:i,vmGlobal:R,steps:d,currentCall:r,base:l,current:y,sealers:p,timers:t.timers,clearAllTimers:()=>t.timers.clearAll(),endCall:(k,A)=>k.end(A),mayLeaveUnquoted:M,scriptGlobalNames:()=>Object.getOwnPropertyNames(i).filter((k)=>!m.has(k)&&!t.toolNames.has(k)),isGlobalName:(k)=>f.has(k)||t.toolNames.has(k),reached:x,unclassifiedCode:t.unclassifiedCode,verdictOrder:t.verdictOrder,scriptChecks:t.scriptChecks,carriedMarkers:t.carriedMarkers,fieldsLine:t.fieldsLine,outstanding:t.outstanding};G(T,t.toolNames);let m=new Set(Object.getOwnPropertyNames(i)),a=E(\'Object.getOwnPropertyNames(globalThis).join(",")\',i,p.rejectImport),f=new Set(typeof a==="string"?a.split(","):m);return T';

// CC 2.1.332, chunk-8tabekkf.js: the Repl kernel's constructor and the
// function that writes its bootstrap script.
const REPL_CONSTRUCTOR =
  'constructor(e,t){super();this.#r=t;for(let{name:r}of gdr(e))this.toolNames.add(r);this.#n=this.#m(),this.#s=this.#m(),this.#s.script.end("cancelled"),this.#o=t.open({ops:Object.entries(DUt()).map(([r,{mode:o,atOnce:i,followsCalls:l}])=>({name:r,mode:o,atOnce:i,followsCalls:l})),called:(r)=>this.#t.answer(r,this.#y(r)),released:(r)=>this.#w(r)}),this.messages=new Pe(this.#o,(r,o,i)=>this.#b(r,o,i)),this.#t=new xe(this.messages),this.turns.onStart=(r,o)=>{if(o==="start")this.#t.turnStarted(r)};let n=it(t,{shellKind:_dr(),consoleIsRing:h_(),hasTeam:!hi(),memory:this.#o.inProcess?{readMs:fIr,message:rQr()}:void 0});this.messages.post({tag:$oe,send:(r)=>r.run(n,{timeoutMs:R_e(),tag:$oe}),reported:(r)=>{this.#p=new Set(ut(r))}})}';
const REPL_BOOTSTRAP =
  'function it(e,t){let n={...t,ops:Object.entries(DUt()).map(([i,l])=>({name:i,mode:l.mode,fields:cDn(l)})),hasClock:e.hasClock,hostFrames:e.hostFrames??[],mostDepth:e.mostDepth,mostItems:kg,mostTextChars:tQr,mostJsonChars:fe,mostDigits:Re,stride:e.hasClock?{first:1,most:Yur,slowMs:Gto}:{first:4096,most:16384,slowMs:50},shellTextKey:fdr,rewrites:[[qur,""],[jLn,"("],[ion,""],[BLn,""],[Kur,"{"],[Vur,"("]],mcpErrorName:s8e,unawaitedMessage:hdr,leftoverMessage:aQr},r=Wte(()=>import.meta.require("/$bunfs/root/chunk-easprn16.js")),o=Object.entries(en).map((i)=>i.join(": "));return`${ve}\nconst { ${o.join(", ")} } =\n${ae(r)}(${e.link}, ${_(n)}, {\n  harden: shownStack => { ${Asa("shownStack(s)")} },\n  intake: () => ({ sanitize: ${eQr()} }),\n  preludes: ({ ${tn} }) => ({\n    shell: ${ae(zJr())},\n    file: ${ae(JJr)},\n    team: ${ae(QJr)},\n    running: ${ae(nQr)},\n  }),\n}).entries;\nJSON.stringify(Object.getOwnPropertyNames(globalThis))`}';

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

const helpersOf = (globals: object) =>
  ['edit', 'write', 'file', 'sleep'].filter(name =>
    Object.hasOwn(globals, name)
  );

// Runs the kernel snippet; G installs the four helpers as 2.1.332 does.
const kernelHelpers = (code: string, toolNames: string[]) => {
  const context = {};
  run(code, {
    gdr: (tools: unknown) => tools,
    e: toolNames.map(name => ({ name })),
    t: { toolNames: new Set<string>() },
    i: context,
    G: (T: { vmContext: object }) => {
      for (const name of ['edit', 'write', 'file', 'sleep']) {
        Object.defineProperty(T.vmContext, name, {
          value: () => name,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    },
    E: () => 'edit,write,file,sleep',
    p: {},
  });
  return helpersOf(context);
};

// Builds the Repl kernel with the given tools and returns the helpers that its
// bootstrap script's file prelude hands to the kernel.
const replHelpers = (
  constructor: string,
  bootstrap: string,
  toolNames: string[]
) => {
  // import.meta only parses in a module; Wte is a stub, so it never runs.
  const build = run(
    `${bootstrap.replace('import.meta.require', 'require')};return it`,
    {
      DUt: () => ({}),
      Wte: () => '',
      en: {},
      ve: "'use strict';",
      ae: (source: string) => `(${source})`,
      _: JSON.stringify,
      Asa: () => '',
      eQr: () => '',
      zJr: () => '0',
      JJr: '(read, writeFile, editOnce, note, noteMiss, wait) => ({ edit: 1, write: 2, file: 3, sleep: 4 })',
    }
  ) as (backend: object, settings: object) => string;
  let script = '';
  const Repl = run(
    `class Base { toolNames = new Set(); turns = {}; }
     return class extends Base {
       messages;#r;#o;#t;#n;#s;#p;
       ${constructor}
       #m() { return { script: { end() {} } }; }
       #y() {}
       #w() {}
       #b() {}
     }`,
    {
      gdr: (tools: unknown) => tools,
      it: (backend: object, settings: object) =>
        (script = build(backend, settings)),
      DUt: () => ({}),
      _dr: () => 'bash',
      h_: () => false,
      hi: () => false,
      Pe: class {
        post() {}
      },
      xe: class {},
    }
  ) as new (tools: object[], backend: object) => object;
  new Repl(
    toolNames.map(name => ({ name })),
    { open: () => ({}) }
  );
  const file = /\n {4}file: (.*),\n {4}team:/s.exec(script)![1];
  return helpersOf(new Function(`return ${file}`)()());
};

describe('writeCodeModeUnavailableHelpers', () => {
  it('leaves every helper in place without the patch', () => {
    expect(kernelHelpers(KERNEL, ['Read'])).toEqual([
      'edit',
      'write',
      'file',
      'sleep',
    ]);
    expect(replHelpers(REPL_CONSTRUCTOR, REPL_BOOTSTRAP, ['Read'])).toEqual([
      'edit',
      'write',
      'file',
      'sleep',
    ]);
  });

  it('removes the default kernel helpers whose tool is missing', () => {
    const patched = writeCodeModeUnavailableHelpers(KERNEL)!;
    expect(kernelHelpers(patched, ['Read', 'Bash'])).toEqual(['file', 'sleep']);
    expect(kernelHelpers(patched, ['Glob'])).toEqual(['sleep']);
    expect(kernelHelpers(patched, ['Read', 'Edit', 'Write'])).toEqual([
      'edit',
      'write',
      'file',
      'sleep',
    ]);
  });

  it('removes the Repl kernel helpers whose tool is missing', () => {
    const patched = writeCodeModeUnavailableHelpers(
      REPL_CONSTRUCTOR + REPL_BOOTSTRAP
    )!;
    const constructor = patched.slice(0, patched.indexOf('function it('));
    const bootstrap = patched.slice(constructor.length);
    expect(replHelpers(constructor, bootstrap, ['Read', 'Bash'])).toEqual([
      'file',
      'sleep',
    ]);
    expect(
      replHelpers(constructor, bootstrap, ['Read', 'Edit', 'Write'])
    ).toEqual(['edit', 'write', 'file', 'sleep']);
  });

  it('returns null when the helpers are not there', () => {
    expect(writeCodeModeUnavailableHelpers('let x=1;')).toBeNull();
    expect(writeCodeModeUnavailableHelpers(REPL_CONSTRUCTOR)).toBeNull();
  });
});
