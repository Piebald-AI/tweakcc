import { describe, it, expect, vi } from 'vitest';
import {
  writePatchesAppliedIndication,
  writePatchesAppliedIndicationModules,
} from './patchesAppliedIndication';

vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'log').mockImplementation(() => {});

// CC 2.1.295 chunk-cnq1t5zj.js commander setup (build-info object trimmed).
const VERSION_295 =
  'o.description("x").version(`${{VERSION:"2.1.295",DD_SOURCEMAP_GROUP:"default"}.VERSION} (Claude Code)${UB()}`,"-v, --version","Output the version number")';

// CC 2.1.295 chunk-7ytk1pm2.js startup header (function na); r=jsxs, e=jsx, n=Text, s=Box.
const HEADER_295 =
  'let We=nt.join(" \\xB7 "),Rt;if(u[12]===S)Rt=e(n,{bold:!0,children:"Claude Code"}),u[12]=Rt' +
  ';else Rt=u[12];let Ye;if(u[13]!==K)Ye=r(n,{children:[Rt," ",r(n,{dimColor:!0,children:["v"' +
  ',K]})]}),u[13]=K,u[14]=Ye;else Ye=u[14];let it;if(u[15]!==Ue||u[16]!==re||u[17]!==Fe||u[18' +
  ']!==$e)it=Ue?r(Y,{children:[e(n,{dimColor:!0,children:$e}),r(n,{children:[e(n,{dimColor:!0' +
  ',children:Fe}),re]})]}):r(n,{children:[r(n,{dimColor:!0,children:[$e," \\xB7 ",Fe]}),re]}),' +
  'u[15]=Ue,u[16]=re,u[17]=Fe,u[18]=$e,u[19]=it;else it=u[19];let mt;if(u[20]!==We||u[21]!==i' +
  'e)mt=ie?r(s,{flexDirection:"row",children:[r(n,{dimColor:!0,wrap:"truncate-start",children' +
  ':[We," \\xB7 "]}),e(Mu,{status:ie})]}):We&&e(n,{dimColor:!0,children:We}),u[20]=We,u[21]=ie' +
  ',u[22]=mt;else mt=u[22];let Xe;if(u[23]!==it||u[24]!==mt||u[25]!==Ye)Xe=r(s,{flexDirection' +
  ':"column",children:[Ye,it,mt]}),u[23]=it,u[24]=mt,u[25]=Ye,u[26]=Xe;else Xe=u[26];';

// CC 2.1.295 chunk-2bt2v8q0.js background-agents header: must not be touched.
const BG_HEADER_295 =
  'let fe;if(Z[13]!==L||Z[14]!==Se||Z[15]!==oe||Z[16]!==re||Z[17]!==C||Z[18]!==ie)fe=!L&&r(Y,' +
  '{children:[C?r(n,{wrap:"truncate",children:[e(n,{bold:!0,children:"Claude Code"})," ",r(n,' +
  '{dimColor:!0,children:["v",ie]})]}):r(n,{children:[e(n,{bold:!0,children:"Claude Code"}),"' +
  ' ",r(n,{dimColor:!0,children:["v",ie]})]})]}),Z[19]=fe;else fe=Z[19];';

// CC 2.1.241 single bundle startup header (dotted zy.jsxs callee).
const HEADER_241 =
  'let VOA;if(gUe[22]===ue)VOA=g9t?zy.jsx(g9t.Title,{}):zy.jsx(v,{bold:!0,children:"Claude Co' +
  'de"}),gUe[22]=VOA;else VOA=gUe[22];let WTc;if(gUe[23]!==UTc)WTc=zy.jsxs(v,{children:[VOA,"' +
  ' ",zy.jsxs(v,{dimColor:!0,children:["v",UTc]})]}),gUe[23]=UTc,gUe[24]=WTc;else WTc=gUe[24]' +
  ';let qTc;if(gUe[25]!==BTc||gUe[26]!==oyn||gUe[27]!==Lvs||gUe[28]!==Dvs)qTc=BTc?zy.jsxs(zy.' +
  'Fragment,{children:[zy.jsx(v,{dimColor:!0,children:Dvs}),zy.jsxs(v,{children:[zy.jsx(v,{di' +
  'mColor:!0,children:Lvs}),oyn]})]}):zy.jsxs(v,{children:[zy.jsxs(v,{dimColor:!0,children:[D' +
  'vs," \\xB7 ",Lvs]}),oyn]}),gUe[25]=BTc,gUe[26]=oyn,gUe[27]=Lvs,gUe[28]=Dvs,gUe[29]=qTc;else' +
  ' qTc=gUe[29];let VTc;if(gUe[30]!==GTc)VTc=GTc&&zy.jsx(v,{dimColor:!0,children:GTc}),gUe[30' +
  ']=GTc,gUe[31]=VTc;else VTc=gUe[31];let KTc;if(gUe[32]!==WTc||gUe[33]!==qTc||gUe[34]!==VTc)' +
  'KTc=zy.jsxs(R,{flexDirection:"row",gap:2,alignItems:"center",children:[qOA,zy.jsxs(R,{flex' +
  'Direction:"column",children:[WTc,qTc,VTc]})]}),gUe[32]=WTc,gUe[33]=qTc,gUe[34]=VTc,gUe[35]' +
  '=KTc;else KTc=gUe[35];';

describe('patchesAppliedIndication', () => {
  it('patches the CC 2.1.295 version printer and startup header across chunks', () => {
    const mods = new Map([
      ['/$bunfs/root/chunk-cnq1t5zj.js', VERSION_295],
      ['/$bunfs/root/chunk-7ytk1pm2.js', HEADER_295],
      ['/$bunfs/root/chunk-2bt2v8q0.js', BG_HEADER_295],
    ]);
    const changed = writePatchesAppliedIndicationModules(mods, '4.3.3', [
      'Foo: bar',
    ])!;
    expect([...changed.keys()].sort()).toEqual([
      '/$bunfs/root/chunk-7ytk1pm2.js',
      '/$bunfs/root/chunk-cnq1t5zj.js',
    ]);
    expect(changed.get('/$bunfs/root/chunk-cnq1t5zj.js')).toContain(
      '}.VERSION} (Claude Code)\\n4.3.3 (tweakcc)${UB()}`'
    );
    const header = changed.get('/$bunfs/root/chunk-7ytk1pm2.js')!;
    expect(header).toContain(
      'r(n,{dimColor:!0,children:["v",K]})," ",r(n,{color:"#FF8400",bold:!0,children:["+ tweakcc v4.3.3"]})]})'
    );
    expect(header).toContain(
      'Xe=r(s,{flexDirection:"column",children:[Ye,it,mt,r(s,{flexDirection:"column",children:[r(s,{children:[r(n,{color:"success",bold:!0,children:["┃ "]}),r(n,{color:"success",bold:!0,children:["✓ tweakcc patches are applied"]})]}),r(s,{children:[r(n,{color:"success",bold:!0,children:["┃ "]}),r(n,{dimColor:!0,children:[`  * Foo: bar`]})]})]})]})'
    );
    expect(
      () => new Function('r,n,s,e,u,S,K,Y,Ue,re,Fe,$e,ie,nt,Mu', header)
    ).not.toThrow();
  });

  it('honours showTweakccVersion/showPatchesApplied on CC 2.1.295', () => {
    const mods = new Map([
      ['a', VERSION_295],
      ['b', HEADER_295],
    ]);
    const header = writePatchesAppliedIndicationModules(
      mods,
      '4.3.3',
      [],
      false,
      true
    )!.get('b')!;
    expect(header).not.toContain('+ tweakcc');
    expect(header).toContain('✓ tweakcc patches are applied');
  });

  it('fails on CC 2.1.295 when the startup header is missing', () => {
    const mods = new Map([['a', VERSION_295]]);
    expect(writePatchesAppliedIndicationModules(mods, '4.3.3', [])).toBeNull();
  });

  it('leaves per-module fn to the modules hook on split chunks', () => {
    expect(writePatchesAppliedIndication(HEADER_295, '4.3.3', [])).toBeNull();
  });

  it('still patches a single-bundle JSX header (CC 2.1.241)', () => {
    const result = writePatchesAppliedIndication(
      VERSION_295 + ';' + HEADER_241,
      '4.3.3',
      ['Foo: bar']
    )!;
    expect(result).toContain('(Claude Code)\\n4.3.3 (tweakcc)');
    expect(result).toContain(
      'zy.jsxs(v,{dimColor:!0,children:["v",UTc]})," ",zy.jsxs(v,{color:"#FF8400",bold:!0,children:["+ tweakcc v4.3.3"]})'
    );
    expect(result).toContain(
      'children:[WTc,qTc,VTc,zy.jsxs(R,{flexDirection:"column",children:[zy.jsxs(R,{children:[zy.jsxs(v,{color:"success"'
    );
  });
});
