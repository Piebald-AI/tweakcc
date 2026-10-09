import { describe, expect, it } from 'vitest';

import {
  writeClearScreen,
  writeClearScreenModules,
  patchRenderFilter,
  patchTranscriptSplit,
} from './clearScreen';

const cmds = Array.from({ length: 31 }, (_, i) => `c${i}`).join(',');
const slashCommandArray =
  'var Cmd0={type:"local",name:"clear",description:"Clear"};' +
  `Cmds=memo9(()=>[${cmds},...Fa?[Fa]:[]])`;

const renderFilter =
  'function g97(H,$){if(H.type!=="user")return!0;if(H.isMeta){if(H.origin?.kind==="channel")return!0;return!1}if(H.isVisibleInTranscriptOnly&&!$)return!1;return!0}';

const makeInput = (delimiter = ';') =>
  'const x=1;' +
  renderFilter +
  ';' +
  slashCommandArray +
  `${delimiter}function cHz(){Nw.get(process.stdout)?.forceRedraw()}`;

describe('clearScreen', () => {
  it('exposes forceRedraw and registers /clear-screen command', () => {
    const result = writeClearScreen(makeInput());

    expect(result).not.toBeNull();
    expect(result).toContain(
      'globalThis.__tweakccForceRedraw=()=>Nw.get(process.stdout)?.forceRedraw()'
    );
    expect(result).toContain('name:"clear-screen"');
    expect(result).toContain('__tweakccHiddenUUIDs');
    expect(result).toContain('globalThis.__tweakccForceRedraw?.()');
  });

  it('preserves all messages for API context (hides via UUID set, does not remove)', () => {
    const result = writeClearScreen(makeInput());

    expect(result).not.toBeNull();
    expect(result).toContain('__tweakccHiddenUUIDs=new Set(');
    expect(result).toContain('return[...m]');
    expect(result).not.toContain('content:[]');
    expect(result).not.toContain('return k?[');
    expect(result).not.toContain('return[]');
  });

  it('patches render filter to check __tweakccHiddenUUIDs', () => {
    const result = writeClearScreen(makeInput());

    expect(result).not.toBeNull();
    expect(result).toContain(
      'globalThis.__tweakccHiddenUUIDs?.has(H.uuid?.slice(0,24)))return!1;if(H.type!=="user")'
    );
  });

  it('preserves original forceRedraw function', () => {
    const result = writeClearScreen(makeInput());

    expect(result).not.toBeNull();
    expect(result).toContain(
      'function cHz(){Nw.get(process.stdout)?.forceRedraw()}'
    );
  });

  it('returns oldFile when already patched', () => {
    const input = makeInput() + ',{name:"clear-screen"}';
    const result = writeClearScreen(input);

    expect(result).toBe(input);
  });

  it('returns null when forceRedraw function not found', () => {
    const result = writeClearScreen('const x=1;');

    expect(result).toBeNull();
  });

  it('returns null when render filter not found', () => {
    const input =
      'const x=1;' +
      slashCommandArray +
      ';function cHz(){Nw.get(process.stdout)?.forceRedraw()}';
    const result = writeClearScreen(input);

    expect(result).toBeNull();
  });

  it('works with different delimiters before forceRedraw function', () => {
    for (const d of [',', ';', '}', '{']) {
      const result = writeClearScreen(makeInput(d));
      expect(result).not.toBeNull();
      expect(result).toContain('globalThis.__tweakccForceRedraw');
    }
  });
});

describe('patchRenderFilter', () => {
  it('adds __tweakccHiddenUUIDs check at the start of the function', () => {
    const result = patchRenderFilter(';' + renderFilter);

    expect(result).not.toBeNull();
    expect(result).toContain(
      ';function g97(H,$){if(globalThis.__tweakccHiddenUUIDs?.has(H.uuid?.slice(0,24)))return!1;if(H.type!=="user")'
    );
  });

  it('preserves the rest of the function', () => {
    const result = patchRenderFilter(';' + renderFilter);

    expect(result).not.toBeNull();
    expect(result).toContain('if(H.isMeta)');
    expect(result).toContain('if(H.isVisibleInTranscriptOnly&&!$)return!1');
  });

  it('returns null when pattern not found', () => {
    const result = patchRenderFilter('const x=1;');

    expect(result).toBeNull();
  });

  it('works with different delimiters before function', () => {
    for (const d of [',', ';', '}', '{']) {
      const result = patchRenderFilter(d + renderFilter);
      expect(result).not.toBeNull();
      expect(result).toContain(
        'if(globalThis.__tweakccHiddenUUIDs?.has(H.uuid?.slice(0,24)))return!1;'
      );
    }
  });

  it('works with different function and argument names', () => {
    const input =
      ';function abc(X$,Y$){if(X$.type!=="user")return!0;if(X$.isMeta){if(X$.origin?.kind==="channel")return!0;return!1}return!0}';
    const result = patchRenderFilter(input);

    expect(result).not.toBeNull();
    expect(result).toContain(
      'if(globalThis.__tweakccHiddenUUIDs?.has(X$.uuid?.slice(0,24)))return!1;'
    );
  });
});

// Real minified excerpts from CC 2.1.295 chunks.
const redraw2295 =
  'n{...no,isBriefOnly:!1}}function Hbt(){}function Ubt(){ti().get(process.stdout)?.forceRedraw()}funct';
const split2295 =
  'class Pa{transcript=[];progress=[];split(l){let u=this.transcript,m=this.progress,f=0,h=0,v=null,T=null;for(let C of l)if(C.type==="progress")if(T!==null)T.push(C);else if(m[h]===C)h++;else T=m.slice(0,h),T.push(C);else if(v!==null)v.push(C);else if(u[f]===C)f++;else v=u.slice(0,f),v.push(C);return v??=f===u.length?u:u.slice(0,f),T??=h===m.length?m:m.slice(0,h),this.transcript=v,this.progress=T,{transcript:v,progress:T}}}';
const commands2295 =
  'var Oao={type:"local",name:"clear",description:"Start a new session with empty context; previous session stays on disk (resumable with /resume)",argumentHint:"[name]",aliases:["reset","new"],supportsNonInteractive:!0,thinClientDispatch:"post-text",load:()=>import("/$bunfs/root/chunk-dhtm2ayx.js")},Jle=Oao;' +
  'function Y7o(){return[ENe,TNe,RNe,oje,rje,VUe,pDt,RFe,IDt,Zle,...v6("fleetFork"),LBt,CFe,yDt,KBt,Jle,OFe,IFe,zet,zFe,WFe,qFe,DDt,KFe,LFe,_Dt,VFe,ede,YFe,...v6("fleetBackground"),hje,gje,yje,ije,FUe,NUe,kje,_je,BBt,t$e,NDt,BDt,r$e,zDt,qDt,s$e,tde,XFe,$Dt,FDt,i$e,e$e,dje,lje,dHt,cHt,uHt,YUe,c$e,Kue,Vue,p$e,u$e,XDt,QDt,JDt,m$e,g$e,b$e,kHt,VBt,MUe,OBt,PFe,MFe,eLt,tLt,IBt,XUe,yLt,C$e,rLt,Que,itt,h5,cje,uje,fje,pje,gHt,_Ht,mje,fHt,CUe,AUe,Abo,Ebo,Sbo,...MHt?[MHt]:[],...v6("daemon"),YDt,...T6?[T6]:[],...v6("skillDoctor"),IUe,LUe,a$e,UUe,bbo,Cje,qUe,DBt,aje,nje,WDt(),jDt(),HDt,UDt,...v6("logout"),$Ue,...ofe?[ofe]:[],...rfe?[rfe]:[],v$e,hDt,...[],...Rbo,dLt,Tbo,mDt,lLt,YBt,...E6?[E6]:[],...vje?[vje]:[],...Tje?[Tje]:[],...Eje?[Eje]:[],...QBt,...nfe?[nfe]:[],...Sje&&!Le(a.IS_DEMO)?[Sje.promoteMemory,Sje.promoteMemoryNonInteractive]:[],...w6&&!Le(a.IS_DEMO)?[w6.memoryAccount,w6.localMemoryToAccount]:[],...w6?[w6.accountMemorySwitch]:[],...[]]';

const modules2295 = () =>
  new Map([
    ['/$bunfs/root/chunk-tjhhhqzz.js', redraw2295],
    ['/$bunfs/root/chunk-7ytk1pm2.js', split2295],
    ['/$bunfs/root/chunk-53bsrq2x.js', commands2295],
    ['/$bunfs/root/chunk-other.js', 'var x=1;'],
  ]);

describe('writeClearScreenModules (CC 2.1.295)', () => {
  it('patches the redraw helper, transcript splitter and command list in their own modules', () => {
    const result = writeClearScreenModules(modules2295());

    expect(result).not.toBeNull();
    expect([...result!.keys()].sort()).toEqual([
      '/$bunfs/root/chunk-53bsrq2x.js',
      '/$bunfs/root/chunk-7ytk1pm2.js',
      '/$bunfs/root/chunk-tjhhhqzz.js',
    ]);
    expect(result!.get('/$bunfs/root/chunk-tjhhhqzz.js')).toContain(
      'function Hbt(){}globalThis.__tweakccForceRedraw=()=>ti().get(process.stdout)?.forceRedraw();function Ubt(){'
    );
    expect(result!.get('/$bunfs/root/chunk-7ytk1pm2.js')).toContain(
      'for(let C of globalThis.__tweakccHiddenUUIDs?l.filter(x=>!globalThis.__tweakccHiddenUUIDs.has(x.uuid?.slice(0,24))):l)if(C.type==="progress")'
    );
    expect(result!.get('/$bunfs/root/chunk-53bsrq2x.js')).toContain(
      '...[],{type:"local",name:"clear-screen"'
    );
  });

  it('returns null when an anchor is missing', () => {
    const mods = modules2295();
    mods.delete('/$bunfs/root/chunk-7ytk1pm2.js');

    expect(writeClearScreenModules(mods)).toBeNull();
  });
});

describe('patchTranscriptSplit', () => {
  it('returns null when pattern not found', () => {
    expect(patchTranscriptSplit('const x=1;')).toBeNull();
  });
});
