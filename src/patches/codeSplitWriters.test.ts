import { describe, expect, it } from 'vitest';

import { PatchGroup } from './index';
import { applyPatchImplementationsToGraph } from './nativeGraphDispatcher';
import { writeThinkingVerbs } from './thinkingVerbs';
import { writeThemes } from './themes';
import { writeThinkerFormat } from './thinkerFormat';
import { writeThinkerSymbolMirrorOption } from './thinkerMirrorOption';
import { writeVerboseProperty } from './verboseProperty';
import { writeThinkingVisibility } from './thinkingVisibility';
import { writeAutoAcceptPlanMode } from './autoAcceptPlanMode';
import { writeHideStartupBanner } from './hideStartupBanner';
import { writeHideStartupClawd } from './hideStartupClawd';
import { writeInputChevronColor } from './inputChevronColor';
import { writeTokenCountRounding } from './tokenCountRounding';
import { writeStatuslineUpdateThrottle } from './statuslineUpdateThrottle';
import { writeContextLimit } from './contextLimit';
import { writeIncreaseFileReadLimit } from './increaseFileReadLimit';
import { writeOpusplan1m } from './opusplan1m';
import { writeModelCustomizations } from './modelSelector';
import { writeSuppressRateLimitOptions } from './suppressRateLimitOptions';
import { writeAgentsMd } from './agentsMd';
import { writeMcpBatchSize } from './mcpStartup';
import { insertAfterLoginRegistration } from './slashCommands';
import { writeVoiceMode } from './voiceMode';
import { assertPatchedModuleParses } from './moduleParseGate';
import { applySystemPrompts } from './systemPrompts';
import { writeFixLspSupport } from './fixLspSupport';
import { writeScrollEscapeSequenceFilter } from './scrollEscapeSequenceFilter';
import { writeThinkerSymbolSpeed } from './thinkerSymbolSpeed';
import { writeAllowBypassPermsInSudo } from './allowBypassPermsInSudo';
import type { Theme } from '../types';

// Fixtures are trimmed from real Claude Code 2.1.281 code-split chunks.

/** Runs one writer over a small module graph and returns the graph. */
const onGraph = (
  modules: Record<string, string>,
  fn: (source: string) => string | null
) => {
  const sources = new Map(Object.entries(modules));
  const out = applyPatchImplementationsToGraph(sources, { p: { fn } }, [
    { id: 'p', name: 'p', group: PatchGroup.MISC_CONFIGURABLE },
  ]);
  return { sources, result: out.results[0] };
};

describe('code-split (CC 2.1.2xx) writer forms', () => {
  it('thinking verbs: patches present and past tense lists in separate modules', () => {
    const verbs = Array.from(
      { length: 50 },
      (_, i) => `"Verb${'abcdefghij'[i % 10]}ing"`
    ).join(',');
    const { sources, result } = onGraph(
      {
        '/present.js': `var v=[${verbs}];`,
        '/past.js':
          'var ag=["Baked","Brewed","Churned","Cogitated","Cooked","Saut\\xE9ed"];',
      },
      s => writeThinkingVerbs(s, ['Porting'])
    );
    expect(result).toMatchObject({ applied: true, failed: false });
    expect(sources.get('/present.js')).toBe('var v=["Porting"];');
    expect(sources.get('/past.js')).toBe('var ag=["Ported"];');
  });

  it('themes: keeps the `X=` form of the name map (a `return` there is a syntax error)', () => {
    const themes = [
      { id: 'dark', name: 'Dark mode', colors: {} },
      { id: 'mine', name: 'Mine', colors: {} },
    ] as unknown as Theme[];
    const { sources } = onGraph(
      {
        '/names.js':
          'var pi="x",Ir={auto:"Auto (match terminal)",dark:"Dark mode",light:"Light mode"};',
        '/schema.js':
          'var e=["dark","light","light-daltonized","dark-daltonized"];',
      },
      s => writeThemes(s, themes)
    );
    const names = sources.get('/names.js')!;
    expect(names).toBe('var pi="x",Ir={"dark":"Dark mode","mine":"Mine"};');
    expect(() => assertPatchedModuleParses('/names.js', names)).not.toThrow();
    expect(sources.get('/schema.js')).toContain('"dark-daltonized","mine"]');
  });

  it('thinker format: wraps the default-suffix branch only', () => {
    const src =
      'p=U((F)=>F.spinnerTip),gt=K?[K.activeForm,K.subject].find(Boolean):void 0,at=y??(I||lt),Wt=H===Yt&&Be.test(at)?at:at+H;A(()=>{})';
    const out = writeThinkerFormat(src, '{}... ')!;
    expect(out).toContain(
      'Wt=H===Yt?`${at}... `:(H===Yt&&Be.test(at)?at:at+H);'
    );
  });

  it('thinker mirror: handles every toReversed() frame set', () => {
    const src = 'Er=[...lt,...lt.toReversed()],Ar=[...ut,...ut.toReversed()];';
    expect(writeThinkerSymbolMirrorOption(src, false)).toBe(
      'Er=[...lt],Ar=[...ut];'
    );
  });

  it('verbose: matches a bare JSX-runtime call', () => {
    const src =
      '&&e(jmn,{responseLengthRef:Zt.responseLength,spinnerSuffix:St?co:null,verbose:Ie,loadingStartTimeRef:Zt.x})';
    expect(writeVerboseProperty(src)).toContain(
      'verbose:true,loadingStartTimeRef'
    );
  });

  it('thinking visibility: keeps the redacted-thinking branch', () => {
    const src =
      'case"thinking":{if(sQe(l)){let ue;ue=e(Qa,{param:l});return ue}if(!E&&!R){return null}let ue;ue=e(Ss,{addMargin:h,param:l,isTranscriptMode:E,verbose:R});return ue}';
    const out = writeThinkingVisibility(src)!;
    expect(out).toContain(
      'if(sQe(l)){let ue;ue=e(Qa,{param:l});return ue}let ue;'
    );
    expect(out).toContain('isTranscriptMode:true,');
    expect(out).not.toContain('if(!E&&!R)');
  });

  it('startup banner: nulls the card that reads version/cwd/billingType', () => {
    const src =
      'function Is(o){let l=w(39),d;let{oneShotsAllowed:m}=d,{version:C,cwd:L,billingType:V,agentName:F}=KYe(),ee=1}';
    expect(writeHideStartupBanner(src)).toBe(
      'function Is(o){return null;let l=w(39),d;let{oneShotsAllowed:m}=d,{version:C,cwd:L,billingType:V,agentName:F}=KYe(),ee=1}'
    );
  });

  it('startup Clawd: nulls the pose-aware Clawd component', () => {
    const src =
      'function Qee(g){let l=w(26),d;let{pose:b}=d,t=b;if($t()){return null}if(a.terminal==="Apple_Terminal"){return 1}let c=e(n,{color:"clawd_body"})}';
    expect(writeHideStartupClawd(src)).toContain(
      'function Qee(g){return null;let l=w(26)'
    );
  });

  it('startup Clawd: nulls the 2.1.285 component with extra props and a terminal helper', () => {
    const src =
      'function Spe(){return a.terminal!=="Apple_Terminal"}function Uqt(o){return typeof o!=="string"&&"facing"in o}' +
      'function wpe(o){let i=w(47),t;let{pose:c,color:l,paint:m}=t,p=c===void 0?"default":c,d=l===void 0?"clawd_body":l;if(St()){return null}if(Uqt(p)){return 1}}';
    const out = writeHideStartupClawd(src);
    expect(out).toContain('function wpe(o){return null;let i=w(47)');
    // The preceding helpers are left alone.
    expect(out).toContain('function Uqt(o){return typeof o');
    expect(out).toContain('function Spe(){return a.terminal');
  });

  // Fixtures below are trimmed from real Claude Code 2.1.295 chunks.
  it('startup banner (2.1.295): nulls the wrapper that also renders the release-notes summary', () => {
    const card =
      'function na(l){let u=w(28),m;if(u[0]!==l)m=l===void 0?{}:l,u[0]=l,u[1]=m;else m=u[1];let{oneShotsAllowed:f}=m,h=f===void 0?!0:f,{columns:v}=ke(),T=tt(),C=V(yM),_=Jv(),D=qln(),A=Dt(D),L=iY(D),{version:O,cwd:H,billingType:W,agentName:j}=Tft(),ee=C??j,de;if(u[2]=}';
    const wrapper =
      'function sa(){let f=w(16),{storageV5:l}=Ce(),u=ss(),m=wt(),h;if(f[0]!==u||f[1]!==m)h=()=>!m||SU(u)||Lt()||J_()!==void 0,f[0]=u,f[1]=m,f[2]=h;else h=f[2];let[v]=y(h),T;if(f[3]!==v)T=()=>v||a.DEMO_VERSION?null:ku(),f[3]=v,f[4]=T;else T=f[4];let[C]=y(T),_,D;if(f[5]!==v||f[6]!==l)_=()=>{if(v||!mo(ce().lastReleaseNotesSeen)){return}Ae(DM,l)},D=[v,l],f[5]=v,f[6]=l,f[7]=_,f[8]=D;else _=f[7],D=f[8];P(_,D);const A=!v;let L;if(f[9]!==A)L=e(na,{oneShotsAllowed:A}),f[9]=A,f[10]=L;else L=f[10];let O;if(f[11]!==C)O=C&&r(s,{paddingLeft:2,flexDirection:"column",children:[e(n,{bold:!0,children:C}),r(n,{dimColor:!0,children:[e(jt,{url:g3n,children:hBr})," for details"]})]}),f[11]=C,f[12]=O;else O=f[12];let H;if(f[13]!==L||f[14]!==O)H=r(Y,{children:[L,O,!1]}),f[13]=L,f[14]=O,f[15]=H;else H=f[15];return H}';
    const out = writeHideStartupBanner(card + wrapper)!;
    expect(out).toContain('function sa(){return null;let f=w(16)');
    // The card itself is left alone; the disabled wrapper never renders it.
    expect(out).toContain('function na(l){let u=w(28)');
  });

  it('startup Clawd (2.1.295): nulls the fixed-width host, not the shared pose component', () => {
    const { sources, result } = onGraph(
      {
        '/clawd.js':
          'function kwe(o){let i=w(47),t;if(i[0]!==o)t=o===void 0?{}:o,i[0]=o,i[1]=t;else t=i[1];let{pose:c,color:l,paint:u}=t,d=c===void 0?"default":c,p=l===void 0?"clawd_body":l;if(tt()){return null}if(Vln(d)){let x;if(i[2]!==p||i[3]!==d)x=Ewe()?e(ie,{facing:d.facing,color:p}):e(Ct,{eyes:"open",color:p}),i[2]=p,i[3]=d,i[4]=x;else x=i[4];return x}let x;if(i[5]!==d)x=WKn(d),i[5]=d,i[6]=x;else x=i[6];let m=x;}',
        '/card.js':
          'function Yi(l){let X=w(21),{fullscreen:u,entrance:m,ultra:f}=l,h=_u(),v=tt(),T=rb(zb().effortUltra),C=vqe(ur()[0]),_=tie(),D=R(_),A=Te(Ym),L=A?.columns,O=A?.rows,[H,W,j]=m6(),{isVisible:ee}=W,[,de]=hh(YT,0),Se=f&&u&&QPe(ko)===ko&&_!=="blurred"&&!Lt()&&J_()===void 0&&!h&&!v&&T!==null&&ge.level>=3&&Ew}',
      },
      writeHideStartupClawd
    );
    expect(result.applied).toBe(true);
    expect(sources.get('/card.js')).toContain(
      'function Yi(l){return null;let X=w(21),{fullscreen:u,entrance:m,ultra:f}=l'
    );
    expect(sources.get('/clawd.js')).toContain('function kwe(o){let i=w(47)');
  });

  it('input chevron: tolerates nested object literals and a bare JSX call', () => {
    const src =
      'function iF(h){let we=w(6),{isLoading:M,isScreenReader:E,themeColor:K}=h,Se=K??void 0,Ce;if(we[0]!==E)Ce=E?e(G,{children:"$"}):r(G,{children:[X.pointer]});let Me;if(we[2]!==Se||we[3]!==M)Me=e(n,{color:Se,dimColor:M,children:Ce});return Me}';
    expect(writeInputChevronColor(src, 'success')).toContain(
      'color:M?Se:"success",dimColor:!1,children:Ce'
    );
  });

  it('token count rounding: wraps the template-literal token label', () => {
    const src = ',Ct=wt,bt=ns(Ct),It=`${X.arrowDown} ${bt} tokens`,At=ie(It)';
    expect(writeTokenCountRounding(src, 100)).toContain(
      'bt=ns(Math.round((Ct)/100)*100),It='
    );
  });

  it('statusline: turns the class debounce into a throttle', () => {
    const src =
      'class eRn{#l=null;#e;setInputs(e){if(n.statusLine?.command)this.#y()}isTrustAccepted(){}#y(){this.#l?.(),this.#l=this.#e.setTimeout(()=>{this.#l=null,this.#b()},Bjn)}#b(){}}';
    const out = writeStatuslineUpdateThrottle(src, 500, false)!;
    expect(out).toContain('#y(){if(this.#l)return;');
    expect(out).toContain('+500-Date.now()');
    expect(out).not.toContain('this.#l?.(),this.#l=this.#e.setTimeout');
  });

  it('context limit: handles the declaration without the 20000 constant', () => {
    expect(
      writeContextLimit('var UMe=200000,wz=200000,A_=32000,EO=128000;')
    ).toBe(
      'var UMe=(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||200000),wz=(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||200000),A_=32000,EO=128000;'
    );
  });

  it('context limit: also overrides the effective window of 1M models', () => {
    const src =
      'var R$e=200000,Sq=200000,gh=32000,Px=128000;function Hg(e,n){let r=yh();if(r!==void 0)return r;if(PLr(e,n))return Sq;return bh(e,n)}';
    const out = writeContextLimit(src)!;
    const Hg = new Function(
      'process',
      `function yh(){}function PLr(){return!1}function bh(){return 1e6}${out};return Hg`
    );
    expect(Hg({ env: { CLAUDE_CODE_CONTEXT_LIMIT: '60000' } })('m', 'x')).toBe(
      60000
    );
    expect(Hg({ env: {} })('m', 'x')).toBe(1e6);
  });

  it('file read limit: finds the default beside the token-limit error class', () => {
    const src =
      'var kTr=25000,TTr=128;class bEe extends Error{tokenCount;constructor(e,t){super(`File content (${e} tokens) exceeds maximum allowed tokens (${t}).`)}}';
    expect(writeIncreaseFileReadLimit(src)).toContain(
      'var kTr=1000000,TTr=128;'
    );
  });

  it('file read limit: finds the defaultFileReadingLimits fallback (CC 2.1.296)', () => {
    // CC 2.1.296 chunk-qsxrphgj.js, hint strings trimmed
    const src =
      'var Ugo=25000,Aws=` To read it anyway, call ${rt} again with ${hue}: true.`,jgo=128;class $de extends Error{tokenCount;constructor(e,t,r=""){super(`File content (${e} tokens) exceeds maximum allowed tokens (${t}).${r}`)}}function i(){let e=a.CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS;if(e!==void 0&&e>0)return e;return}function qW(){let e=wo();return e.defaultFileReadingLimits??={maxSizeBytes:Y5e,maxTokens:i()??Ugo},e.defaultFileReadingLimits}';
    const out = writeIncreaseFileReadLimit(src)!;
    expect(out).toContain('var Ugo=1000000,Aws=');
    expect(out).toContain('jgo=128;');
  });

  it('file read limit: handles a $-prefixed default name', () => {
    const src =
      'var $go=25000,x=1;function q(){return e.defaultFileReadingLimits??={maxSizeBytes:Y,maxTokens:i()??$go},e.defaultFileReadingLimits}';
    expect(writeIncreaseFileReadLimit(src)).toContain('var $go=1000000,x=1;');
  });

  it('opusplan[1m]: reports native support as already satisfied', () => {
    const src =
      'function yie(e){if(e==="opusplan"||e==="opusplan[1m]")return"opus";return null}';
    expect(writeOpusplan1m(src)).toBe(src);
  });

  it('model customizations: appends models before the disabled-last sort', () => {
    const src =
      'function o2(e,n){let s=[];for(let D of w)s.push(D)}s=i2(s,n);let E=null,T=oh(),A=y0();return s.push({...ml(E)??{value:E,label:E,description:"Custom model"},sessionTail:!0}),xo(s,n)}';
    const out = writeModelCustomizations(src)!;
    expect(out).toContain('}for(const tweakccModel of [');
    expect(out).toContain(')s.push(tweakccModel);s=i2(s,n);');
  });

  it('rate-limit options: neutralises the context-provided opener', () => {
    const src =
      'e(X,{onOpenRateLimitOptions:R?.openRateLimitOptions,onRateLimitAutoQueueContinue:R?.arm})';
    expect(writeSuppressRateLimitOptions(src)).toContain(
      'onOpenRateLimitOptions:()=>{},'
    );
  });

  it('AGENTS.md: adds a prologue that tries alternative names', () => {
    const src =
      'async function pye(e,n,r,s){try{let g,h=!1;if(g===null){t(`[CLAUDE.md] skipping ${e}: not a regular file`);return{info:null,includePaths:[]}}return GJe(g,e,n,r)}catch(g){return awn(g,e),{info:null,includePaths:[]}}}';
    const out = writeAgentsMd(src, ['AGENTS.md'])!;
    expect(out.startsWith('async function pye(e,n,r,s,tweakccAltPass){')).toBe(
      true
    );
    expect(out).toContain('["AGENTS.md"]');
    expect(() => assertPatchedModuleParses('/agents.js', out)).not.toThrow();
  });

  it('AGENTS.md: adds alternatives to the batch project-file list', () => {
    const src =
      'let gt=bt.map((yn)=>{let Nn=We&&!jn;return{dir:yn,project:Nn,projectFiles:Nn?[qu(yn,"CLAUDE.md"),qu(yn,".claude","CLAUDE.md")].filter((Gn)=>!_e(Gn,"Project")):[]}});';
    const out = writeAgentsMd(src, ['AGENTS.md'])!;
    expect(out).toContain(
      'projectFiles:Nn?(()=>{let tweakccBase=[qu(yn,"CLAUDE.md")'
    );
    expect(out).toContain('["AGENTS.md"]');
    expect(out).toContain('.filter((Gn)=>!_e(Gn,"Project")):[]');
    expect(() => assertPatchedModuleParses('/p.js', out)).not.toThrow();
  });

  it('MCP batch size: rewrites the typed env accessor default', () => {
    expect(
      writeMcpBatchSize(
        'function jr(){return a.MCP_SERVER_CONNECTION_BATCH_SIZE??3}',
        8
      )
    ).toBe('function jr(){return a.MCP_SERVER_CONNECTION_BATCH_SIZE??8}');
  });

  it('slash commands: registers after /login in the factory registry', () => {
    const src =
      'var GBt=()=>({type:"local-jsx",name:"login",description:"x"});var list=[a,b,GBt(),WBt(),c];';
    expect(insertAfterLoginRegistration(src, ',{name:"x"}')).toBe(
      'var GBt=()=>({type:"local-jsx",name:"login",description:"x"});var list=[a,b,GBt(),{name:"x"},WBt(),c];'
    );
  });

  it('voice mode: patches the gate in the module that defines it', () => {
    const { sources, result } = onGraph(
      {
        '/commands.js':
          'var C={type:"local",name:"voice",description:"Toggle voice mode",argumentHint:"[hold|tap|off]",get isHidden(){return!cze()}};',
        '/gate.js': 'function cze(){return c0n()&&d0n()}',
      },
      s => writeVoiceMode(s, true)
    );
    expect(result).toMatchObject({ applied: true, failed: false });
    expect(sources.get('/gate.js')).toBe(
      'function cze(){return !0;return c0n()&&d0n()}'
    );
  });
});

describe('Claude Code 2.1.281 patch fixes', () => {
  it('table format ascii: replaces the row-start border, not only separators', async () => {
    const { writeTableFormat } = await import('./tableFormat');
    const src =
      'function te(I,M){let z=[];for(let X=0;X<O;X++){let ee="\\u2502";for(let Y=0;Y<I.length;Y++){ee+=" "+Qmn(Yt,ie(Yt),so,io)+" \\u2502"}z.push(ee)}return z}';
    const out = writeTableFormat(src, 'ascii')!;
    expect(out).toContain('let ee="|";');
    expect(out).toContain('+" |"');
    expect(out).not.toContain('\\u2502');
  });

  it('table format ascii: leaves horizontal rules outside the table code alone', async () => {
    const { writeTableFormat } = await import('./tableFormat');
    // The prompt box rule and a dialog divider live in other modules; turning
    // them into dashes made the whole UI draw `-----` instead of `─────`.
    const promptModule =
      'let qt;if(Se[13]!==Rt)qt="\\u2500".repeat(Rt);let Co="\\u2500".repeat(wo);';
    expect(writeTableFormat(promptModule, 'ascii')).toBeNull();
  });

  it('table format ascii: dashes the vertical-layout separator in the table module', async () => {
    const { writeTableFormat } = await import('./tableFormat');
    const tableModule =
      'function te(H){let[O,W,j,B]={top:["\\u250C","\\u2500","\\u252C","\\u2510"],middle:["\\u251C","\\u2500","\\u253C","\\u2524"],bottom:["\\u2514","\\u2500","\\u2534","\\u2518"]}[H],z=O;return z}' +
      'function mt(o){let c=[];let d=Math.min(a-1,40);let x=Zs("\\u2500",d);return x}' +
      'var far="\\u2500".repeat(9);'.padStart(9000, ' ');
    const out = writeTableFormat(tableModule, 'ascii')!;
    expect(out).toContain('let x=Zs("-",d)');
    expect(out).toContain('middle:["|","-","|","|"]');
    // Far outside the table code: untouched.
    expect(out).toContain('var far="\\u2500".repeat(9);');
  });

  it('toolsets: filters the REPL store tool pool, keeping array identity stable', async () => {
    const { writeToolsets } = await import('./toolsets');
    const catalog =
      'function AC(){return[]}var tP=(e,r)=>{return r},Y1r=3;function ept(e,r,n){let s=tP(e,n);return s}var K5={getAllBaseTools:AC,getTools:tP,assembleToolPool:ept};';
    const store =
      'class St{computeToolPool(h,M,E){let K={toolPermissionContext:h.toolPermissionContext,x:1};return{tools:M,k:K}}}';
    const { sources } = onGraph(
      { '/catalog.js': catalog, '/store.js': store },
      s => writeToolsets(s, [{ name: 'ro', allowedTools: ['Read'] }], null)
    );
    const run = new Function(
      `${sources.get('/catalog.js')};${sources.get('/store.js')};` +
        'globalThis.__tweakccToolset="ro";' +
        'const tools=[{name:"Read"},{name:"Write"}];const st=new St();' +
        'const a=st.computeToolPool({toolPermissionContext:{mode:"default"}},tools);' +
        'const b=st.computeToolPool({toolPermissionContext:{mode:"default"}},tools);' +
        'delete globalThis.__tweakccToolset;return [a.tools.map(t=>t.name),a.tools===b.tools]'
    );
    expect(run()).toEqual([['Read'], true]);
  });

  it('clear-screen: invalidates the memoised message list when the clear version changes', async () => {
    const { patchListMemo } = await import('./clearScreen');
    const src =
      'let Pr=Bo,Mo;if(Q[49]!==Ge||Q[50]!==Pr||Q[61]!==O){let Or;if(Q[66]!==q)Or=(Sk)=>wcr(Sk,q),Q[66]=q,Q[67]=Or;else Or=Q[67];Mo=Pr.filter(Or)}';
    const out = patchListMemo(src)!;
    expect(out).toContain(
      'if(Q.tweakccClearVersion!==(globalThis.__tweakccClearVersion|0)||Q[49]!==Ge'
    );
    expect(out).toContain(
      '{Q.tweakccClearVersion=globalThis.__tweakccClearVersion|0;let Or;'
    );
  });
  it('toolsets: shows the effective toolset on the mode status line', async () => {
    const { writeToolsets } = await import('./toolsets');
    const catalog =
      'function AC(){return[]}var tP=(e,r)=>{return r},Y1r=3;function ept(e,r,n){let s=tP(e,n);return s}var K5={getAllBaseTools:AC,getTools:tP,assembleToolPool:ept};';
    const footer =
      'function Ft(h){let ee=w(9),{mode:M,short:E,hint:K}=h,Me;if(ee[6]!==M)Me=bW(M),ee[6]=M,ee[7]=Me;else Me=ee[7];const Ie=E?"":" on";return[Me,Ie,K]}';
    const { sources } = onGraph(
      { '/catalog.js': catalog, '/footer.js': footer },
      s =>
        writeToolsets(
          s,
          [
            { name: 'ro', allowedTools: ['Read'] },
            { name: 'all', allowedTools: '*' },
          ],
          'all',
          null,
          'ro'
        )
    );
    const run = new Function(
      `${sources.get('/catalog.js')};function w(){return[]}function bW(m){return m+" mode"}${sources.get('/footer.js')};` +
        'const a=Ft({mode:"default",short:!1}).join("");const b=Ft({mode:"plan",short:!1}).join("");' +
        'globalThis.__tweakccToolset="ro";const c=Ft({mode:"default",short:!1}).join("");delete globalThis.__tweakccToolset;return[a,b,c]'
    );
    expect(run()).toEqual([
      'default mode on [all]',
      'plan mode on [ro]',
      'default mode on [ro]',
    ]);
  });
});

describe('Claude Code 2.1.283 patch fixes', () => {
  it('thinking visibility: stops folding thinking into the collapsed tool group', () => {
    const src =
      'else if(q_r(xe)||Oe!==void 0&&iRt(Oe.message))ve(),w.push(xe);else if(Oe!==void 0){let De=Oe.memo.summary??=fr(x)}';
    const { sources } = onGraph({ '/g.js': src }, s =>
      writeThinkingVisibility(s)
    );
    expect(sources.get('/g.js')).toContain(
      'else if(q_r(xe)||Oe!==void 0)ve(),w.push(xe)'
    );
  });

  it('show more items: lifts the /model picker cap', async () => {
    const { writeShowMoreItemsInSelectMenus } = await import(
      './showMoreItemsInSelectMenus'
    );
    const src =
      'let Zo=Math.max(2,Math.min(10,Math.floor((ze-B-j-N-z)/2)));x({title:"Select model",subtitle:"Switch between Claude models"})';
    const { sources } = onGraph({ '/m.js': src }, s =>
      writeShowMoreItemsInSelectMenus(s, 25)
    );
    expect(sources.get('/m.js')).toContain(
      'Math.max(2,Math.min(25,Math.floor('
    );
  });

  it('native installer warning: also removes the claude doctor issue entry', async () => {
    const { writeSuppressNativeInstallerWarning } = await import(
      './suppressNativeInstallerWarning'
    );
    const src =
      'else{let d=p2e();n.push({issue:"Native installation exists but ~/.local/bin is not in your PATH",fix:`Run: echo x >> ${k}`})}';
    expect(writeSuppressNativeInstallerWarning(src)).toBe('else{let d=p2e();}');
  });

  it('subagent models: the configured Explore model beats the forced inherit', async () => {
    const { writeSubagentModels } = await import('./subagentModels');
    const src =
      'fk={agentType:"Explore",source:"built-in",baseDir:"built-in",model:"inherit",omitClaudeMd:!0};function Fse(e,n){if(e.agentType!==fk.agentType||e.source!=="built-in")return e.model;if(JFt())return"inherit";return"inherit"}';
    const out = writeSubagentModels(src, {
      plan: null,
      explore: 'claude-haiku-4-5',
      generalPurpose: null,
    })!;
    const Fse = new Function(`function JFt(){return!1}${out};return Fse`)();
    expect(
      Fse({
        agentType: 'Explore',
        source: 'built-in',
        model: 'claude-haiku-4-5',
      })
    ).toBe('claude-haiku-4-5');
  });

  it('auto-accept plan mode: injects inside the dialog whose props are destructured', () => {
    const src =
      'function Other(h){return 1}function B5e({payload:h,answer:M}){let x=1;function ts(tr){}return r(jr,{children:[e(xi,{title:"Ready to code?",children:e($e,{options:$o,defaultFocusValue:jo,onChange:(tr)=>void ts(tr),onCancel:sr})})]})}function Next(h){let Me=w(9);if(1)Me=1;else Se=Me[8];return Se}';
    const { sources } = onGraph({ '/p.js': src }, s =>
      writeAutoAcceptPlanMode(s)
    );
    const out = sources.get('/p.js')!;
    const inject = out.indexOf('globalThis.__tweakccPlanAccept=');
    expect(inject).toBeGreaterThan(out.indexOf('function B5e('));
    expect(inject).toBeLessThan(out.indexOf('function Next('));
    expect(out).toContain('ts((jo??$o?.[0]?.value');
  });

  it('session memory: removes the 2.1.283 extraction gate with its extra escape hatch', async () => {
    const { writeSessionMemory } = await import('./sessionMemory');
    const src =
      'querySource:"extract_memories",forkLabel:"extract_memories"});if(!A&&!x("tengu_passport_quail",!1)&&!Ee())return;if(!A&&!ll())return;';
    const { sources } = onGraph({ '/s.js': src }, s => writeSessionMemory(s));
    expect(sources.get('/s.js')).not.toContain('tengu_passport_quail');
  });
});

describe('module parse gate', () => {
  it('accepts ES modules and CommonJS', () => {
    expect(() =>
      assertPatchedModuleParses('/esm.js', 'import{a}from"./a.js";export{a};')
    ).not.toThrow();
    expect(() =>
      assertPatchedModuleParses('/cjs.js', 'module.exports=1;')
    ).not.toThrow();
  });

  it('rejects a module that parses under neither goal', () => {
    expect(() =>
      assertPatchedModuleParses('/bad.js', 'var Ir=return{};')
    ).toThrow(/\/bad\.js failed to parse/);
  });
});

describe('system prompts across modules', () => {
  it('returns every source and leaves non-matching modules untouched', async () => {
    const result = await applySystemPrompts(
      ['var a=1;', 'var b=2;'],
      '0.0.0-none',
      false,
      null
    );
    expect(result.newContents).toEqual(['var a=1;', 'var b=2;']);
    expect(result.newContent).toBe('var a=1;');
  });
});

describe('scroll escape filter on a module graph', () => {
  it('goes into every stdout-writing module, below the @bun pragma, installing once', () => {
    const { sources, result } = onGraph(
      {
        '/cli': '// @bun @bytecode\n// Version: 9\nimport{a}from"./a.js";a();',
        '/ink.js':
          '// @bun @bytecode\nvar w=(s)=>process.stdout.write(s);export{w};',
        '/other.js': 'var z=1;export{z};',
      },
      writeScrollEscapeSequenceFilter
    );
    expect(result).toMatchObject({ applied: true, failed: false });
    const ink = sources.get('/ink.js')!;
    expect(ink.startsWith('// @bun @bytecode\n// SCROLLING FIX')).toBe(true);
    expect(sources.get('/cli')).not.toContain('SCROLLING FIX');
    expect(sources.get('/other.js')).toBe('var z=1;export{z};');

    // Execute the injected block twice against a fake stdout.
    const block = ink.slice(
      ink.indexOf('// SCROLLING FIX PATCH START'),
      ink.indexOf('// SCROLLING FIX PATCH END')
    );
    const written: unknown[] = [];
    const fakeStdout = {
      write(chunk: unknown) {
        written.push(chunk);
        return true;
      },
    };
    const g: Record<string, unknown> = {};
    const run = new Function('process', 'globalThis', 'Buffer', block);
    run({ stdout: fakeStdout }, g, Buffer);
    const wrapped = fakeStdout.write;
    run({ stdout: fakeStdout }, g, Buffer);
    expect(fakeStdout.write).toBe(wrapped);

    fakeStdout.write('a\x1b[1;46rb\x1b[3Sc\x1b[2Td\x1b[re\x1b[5;1H');
    fakeStdout.write(Buffer.from('x\x1b[1;2ry\u00e9', 'utf8'));
    expect(written[0]).toBe('abcde\x1b[5;1H');
    expect((written[1] as Buffer).toString('utf8')).toBe('xy\u00e9');

    // CC later installs its own fd writer over process.stdout.write, then
    // restores the one it saw. Both must stay filtered, never double-wrapped.
    const direct: unknown[] = [];
    const saved = fakeStdout.write;
    fakeStdout.write = (chunk: unknown) => {
      direct.push(chunk);
      return true;
    };
    fakeStdout.write('p\x1b[1;2rq');
    expect(direct).toEqual(['pq']);
    fakeStdout.write = saved;
    expect(fakeStdout.write).toBe(saved);
    fakeStdout.write('r\x1b[Ss');
    expect(written[2]).toBe('rs');
  });

  it('turns off the scroll-region renderer, whose replies the filter would hide', () => {
    const renderer =
      'function SY(){{let n=bo();if(n.decstbmRendererEnabled!==void 0)return n.decstbmRendererEnabled;' +
      'if(Le(a.CLAUDE_CODE_DECSTBM))return n.decstbmRendererEnabled=!0;' +
      'return n.decstbmRendererEnabled=x("tengu_marlin_porch",!1),n.decstbmRendererEnabled}return!1}' +
      'process.stdout.write("");export{SY};';
    const { sources } = onGraph(
      { '/ink.js': renderer },
      writeScrollEscapeSequenceFilter
    );
    const out = sources.get('/ink.js')!;
    const body = out.slice(
      out.indexOf('function SY'),
      out.indexOf('process.stdout.write("")')
    );
    const SY = new Function('bo', 'Le', 'a', 'x', `${body}return SY;`)(
      () => ({}) as Record<string, unknown>,
      () => true,
      { CLAUDE_CODE_DECSTBM: '1' },
      () => true
    ) as () => boolean;
    expect(SY()).toBe(false);
  });

  it('turns off the scroll-region renderer on CC 2.1.295', () => {
    // chunk-x31wb8sb.js
    const renderer =
      'function zq(){let n=wo();if(n.decstbmRendererEnabled!==void 0)return n.decstbmRendererEnabled;' +
      'if(!process.stdout.isTTY)return n.decstbmRendererEnabled=!1;if(Sle())return n.decstbmRendererEnabled=!1;' +
      'if(!oYn(Fwe()))return n.decstbmRendererEnabled=!1;if(Tc())return n.decstbmRendererEnabled=!1;' +
      'if(dm())return n.decstbmRendererEnabled=!1;if(Le(a.CLAUDE_CODE_DECSTBM))return n.decstbmRendererEnabled=!0;' +
      'return n.decstbmRendererEnabled=k("tengu_marlin_porch",!1),n.decstbmRendererEnabled}' +
      'process.stdout.write("");export{zq};';
    const { sources } = onGraph(
      { '/ink.js': renderer },
      writeScrollEscapeSequenceFilter
    );
    const out = sources.get('/ink.js')!;
    const body = out.slice(
      out.indexOf('function zq'),
      out.indexOf('process.stdout.write("")')
    );
    const no = () => false;
    const zq = new Function(
      'wo',
      'process',
      'Sle',
      'oYn',
      'Fwe',
      'Tc',
      'dm',
      'Le',
      'a',
      'k',
      `${body}return zq;`
    )(
      () => ({}) as Record<string, unknown>,
      { stdout: { isTTY: true } },
      no,
      () => true,
      () => true,
      no,
      no,
      () => true,
      { CLAUDE_CODE_DECSTBM: '1' },
      () => true
    ) as () => boolean;
    expect(zq()).toBe(false);
  });
});

describe('thinker symbol speed on CC 2.1.2xx (breathing spinner)', () => {
  it('sets the cosine period from ms-per-frame and frame count', () => {
    const src =
      'var xo=2000;function X2t(e,r){return(1-Math.cos(2*Math.PI*e/r))/2}' +
      'function Bo(l){let t=X2t(l,xo);return Math.round(t*(K2t().length-1))}';
    const out = writeThinkerSymbolSpeed(src, 50, 4);
    expect(out).toContain('X2t(l,300)');
    const Bo = new Function('K2t', `${out}return Bo;`)(() => [
      'a',
      'b',
      'c',
      'd',
    ]) as (ms: number) => number;
    // 50 ms per frame, 4 frames: up 0..3 and back within 300 ms.
    expect(Bo(0)).toBe(0);
    expect(Bo(150)).toBe(3);
    expect(Bo(300)).toBe(0);
  });
});

describe('allow bypass permissions as root on CC 2.1.2xx', () => {
  const MSG =
    '"--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons"';
  it('fails when no module refuses root, instead of reporting it as satisfied', () => {
    const { result } = onGraph(
      { '/a.js': 'var z=1;export{z};' },
      writeAllowBypassPermsInSudo
    );
    expect(result).toMatchObject({ applied: false, failed: true });
  });

  it('removes both refusals in the CC 2.1.295 forms', () => {
    // chunk-gq5s7t2h.js and chunk-rhc48ngb.js
    const { sources, result } = onGraph(
      {
        '/gq5s7t2h.js': `function g(s){if(!i(s))return;if(OT.isRootOutsideDeliberateSandbox())console.error(${MSG}),process.exit(1)}`,
        '/rhc48ngb.js': `if(r==="bypassPermissions"||s){if(typeof process.getuid==="function"&&process.getuid()===0&&process.env.IS_SANDBOX!=="1"&&!a.CLAUDE_CODE_BUBBLEWRAP)console.error(${MSG}),await DY({sessionId:K(),message:${MSG},reason:"bypass_root"}),process.exit(1)}let w=Ki();`,
      },
      writeAllowBypassPermsInSudo
    );
    expect(result).toMatchObject({ applied: true, failed: false });
    expect(sources.get('/gq5s7t2h.js')).toBe(
      'function g(s){if(!i(s))return;if(OT.isRootOutsideDeliberateSandbox()){}}'
    );
    expect(sources.get('/rhc48ngb.js')).toBe(
      'if(r==="bypassPermissions"||s){if(typeof process.getuid==="function"&&process.getuid()===0&&process.env.IS_SANDBOX!=="1"&&!a.CLAUDE_CODE_BUBBLEWRAP){}}let w=Ki();'
    );
  });

  it('removes both refusals: the flag validator and the setup check', async () => {
    const { sources, result } = onGraph(
      {
        '/validate.js': `function l(s){if(!i(s))return;if(Dw.isRootOutsideDeliberateSandbox())console.error(${MSG}),process.exit(1)}`,
        '/setup.js': `async function Ho(r,s){if(r==="bypassPermissions"||s){if(process.getuid()===0)console.error(${MSG}),await Az({sessionId:Y(),message:${MSG},reason:"bypass_root"}),process.exit(1)}go()}`,
      },
      writeAllowBypassPermsInSudo
    );
    expect(result).toMatchObject({ applied: true, failed: false });
    for (const src of sources.values()) {
      expect(src).not.toContain('process.exit(1)');
    }
    let exited = false;
    let continued = false;
    const Ho = new Function(
      'process',
      'Az',
      'Y',
      'go',
      `${sources.get('/setup.js')};return Ho`
    )(
      {
        getuid: () => 0,
        exit: () => {
          exited = true;
        },
      },
      async () => {},
      () => 'id',
      () => {
        continued = true;
      }
    ) as (r: string, s: boolean) => Promise<void>;
    await Ho('bypassPermissions', false);
    expect(exited).toBe(false);
    expect(continued).toBe(true);
  });
});

describe('LSP native file sync detection', () => {
  it('leaves CC 2.1.283 alone: open/change/save present, closeFile gone', () => {
    const src =
      'async function a(s){await s.sendNotification("textDocument/didOpen",{})}' +
      'var m={openFile:a,changeFile:b,saveFile:c,isFileOpen:d};';
    expect(writeFixLspSupport(src)).toBe(src);
  });
});

describe('Claude Code 2.1.295 toolsets', () => {
  // Fixtures trimmed from real Claude Code 2.1.295 chunks (catalog and store
  // shapes are unchanged from 2.1.281).
  const catalog =
    'function AC(){return[]}var tP=(e,r)=>{return r},Y1r=3;function ept(e,r,n){let s=tP(e,n);return s}var K5={getAllBaseTools:AC,getTools:tP,assembleToolPool:ept};';
  const store =
    'class St{computeToolPool(h,M,E){let K={toolPermissionContext:h.toolPermissionContext,x:1};return{tools:M,k:K}}}';
  const toolsets = [
    { name: 'ro', allowedTools: ['Read', 'mcp__*'] },
    { name: 'none', allowedTools: [] },
    { name: 'all', allowedTools: '*' as const },
  ];

  it('drops tools outside the toolset from the held declared-tool set', async () => {
    const { writeToolsets } = await import('./toolsets');
    // chunk-w00n4xbx: the set of tools already declared in the conversation.
    const held =
      'var ha="ToolSearch";class aye{names;recordedOnly;recordOrder;#e;constructor(e,n={only:new Map,order:[]}){this.names=n.names??[...e.map((o)=>o.name),...n.only.keys()],this.recordedOnly=n.only,this.recordOrder=n.order,this.#e=new Map(e.map((o)=>[o.name,o]))}has(e){return this.#e.has(e)||this.recordedOnly.has(e)}keeps(e){return this.has(e)&&e!==ha}toolFor(e){return this.#e.get(e)}}';
    const { sources } = onGraph(
      { '/catalog.js': catalog, '/store.js': store, '/held.js': held },
      s => writeToolsets(s, toolsets, 'all')
    );
    const run = new Function(
      `${sources.get('/catalog.js')};${sources.get('/store.js')};${sources.get('/held.js')};` +
        'const names=["Read","Bash","mcp__x__y"],set=new aye(names.map(name=>({name}))),keeps=()=>names.filter(n=>set.keeps(n));' +
        'new St().computeToolPool({toolPermissionContext:{mode:"default"}},[]);const all=keeps();' +
        'globalThis.__tweakccToolset="ro";const ro=keeps();delete globalThis.__tweakccToolset;' +
        'delete globalThis.__tweakccMainToolContext;return[all,ro]'
    );
    expect(run()).toEqual([
      ['Read', 'Bash', 'mcp__x__y'],
      ['Read', 'mcp__x__y'],
    ]);
  });

  it('Shift+Tab drops the explicit /toolset choice so mode bindings apply', async () => {
    const { writeToolsets } = await import('./toolsets');
    // chunk-tjhhhqzz: the teammate branch, then the main-session mode cycle.
    const cycle =
      'function cyc(fq,dy){let kS=xBt(fq,void 0);i("tengu_mode_cycle",{to:d(kS),trigger:d("shift_tab")}),g("mode_switch");OV(`[${IF(dy)} on]`);if(i("tengu_mode_cycle",{to:d(dy),trigger:d("shift_tab")}),!Ka())g("mode_switch")}';
    const { sources } = onGraph({ '/cycle.js': cycle }, s =>
      writeToolsets(s, toolsets, 'all', null, 'ro')
    );
    const out = sources.get('/cycle.js')!;
    expect(out.match(/__tweakccToolset=void 0/g)).toHaveLength(1);
    const run = new Function(
      'function xBt(){}function i(){}function d(){}function g(){}function OV(){}function IF(){}function Ka(){return!0}' +
        `${out};globalThis.__tweakccToolset="ro";cyc({},"plan");return globalThis.__tweakccToolset`
    );
    expect(run()).toBeUndefined();

    // Without mode bindings an explicit choice is kept across modes.
    const unbound = onGraph({ '/cycle.js': cycle }, s =>
      writeToolsets(s, toolsets, 'all')
    );
    expect(unbound.sources.get('/cycle.js')).toBe(cycle);
  });

  it('/toolset refreshes the permission context and honours a toolset named "none"', async () => {
    const { writeToolsets } = await import('./toolsets');
    const react =
      'var K={H:null},us=function(e){return K.H.useState(e)},ce=function(t,n,r){var o,i={},a=null;if(n!=null)a=1;return{t,n,r}};export{us as useState,ce as createElement};';
    const ui =
      'function B(o){let q=w(4),x;return x.createElement("ink-box",o)}function T(o){let r=w(31),d;if(r[0]!==o)({color:d,backgroundColor:l,dimColor:m}=o);return d}function S(o){return o}export{B,T,S};';
    const picker =
      'import{S as Q}from"/ui.js";function P(){return e(Q,{options:a,onChange:b,visibleOptionCount:3})}';
    const commands =
      'var GBt=()=>({type:"local-jsx",name:"login",description:"x"});var list=[GBt(),WBt()];';
    const { sources } = onGraph(
      {
        '/react.js': react,
        '/ui.js': ui,
        '/picker.js': picker,
        '/cmds.js': commands,
      },
      s => writeToolsets(s, toolsets, 'all')
    );
    const run = new Function(
      `function WBt(){}${sources.get('/cmds.js')};const cmd=list.find(c=>c?.name==="toolset");` +
        'return(async()=>{const {call}=await cmd.load(),said=[],ctx0={mode:"default"};let state={toolPermissionContext:ctx0};' +
        'const ctx={setAppState:f=>{state=f(state)}},done=m=>said.push(m);' +
        'await call(done,ctx,"none");const picked=globalThis.__tweakccToolset,fresh=state.toolPermissionContext!==ctx0;' +
        'await call(done,ctx,"default");return[picked,fresh,globalThis.__tweakccToolset,said]})()'
    );
    expect(await run()).toEqual([
      'none',
      true,
      undefined,
      ['Toolset changed to none.', 'Toolset cleared; using the mode default.'],
    ]);
  });
});
