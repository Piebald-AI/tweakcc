import { describe, it, expect } from 'vitest';

import { writeFixInputTaskListOverflow } from './fixInputTaskListOverflow';

const hooks =
  ';function Kvi(){return Fe(u(),y)??!1}function y(s){return s!==void 0&&s.length>0}';

const makeInput = () =>
  hooks +
  'function abc(){let No=G(sao),Yo=G((yi)=>yi.expandedView);return Yo}' +
  'function d9e(h){let x=G(nao),{columns:Zr,rows:wr}=Ae();' +
  'let TB=Fne,nf=TB?.text??"",zg=sv?Math.max(YX,Zr-_Ne):Zr-zX,' +
  'ob=Ri()?Math.max(l6e,Math.floor(wr/2)-a6e):void 0,uD=!Yr;return ob}';

describe('writeFixInputTaskListOverflow', () => {
  it('subtracts the task list height while the task list is expanded', () => {
    const result = writeFixInputTaskListOverflow(makeInput());

    expect(result).not.toBeNull();
    expect(result).toContain(
      ',ob=((tlv,tlh)=>Ri()?Math.max(l6e,Math.floor(wr/2)-a6e-' +
        '(tlv==="tasks"&&tlh?(wr<=10?0:Math.min(10,Math.max(3,wr-14))+2):0))' +
        ':void 0)(G((tls)=>tls.expandedView),Kvi()),uD=!Yr'
    );
    expect(result).toContain(
      hooks +
        'function abc(){let No=G(sao),Yo=G((yi)=>yi.expandedView);return Yo}'
    );
  });

  it('returns null when maxVisibleLines is not found', () => {
    expect(
      writeFixInputTaskListOverflow('let Yo=G((yi)=>yi.expandedView);')
    ).toBeNull();
  });

  it('returns null when no expandedView selector exists', () => {
    const input =
      hooks +
      'function d9e(h){let x=1,ob=Ri()?Math.max(l6e,Math.floor(wr/2)-a6e):void 0}';

    expect(writeFixInputTaskListOverflow(input)).toBeNull();
  });

  it('falls back to a selector that follows the budget', () => {
    const input =
      hooks +
      'function d9e(h){let x=1,ob=Ri()?Math.max(l6e,Math.floor(wr/2)-a6e):void 0}' +
      'function abc(){let Yo=G((yi)=>yi.expandedView);return Yo}';
    const result = writeFixInputTaskListOverflow(input);

    expect(result).toContain('(G((tls)=>tls.expandedView),Kvi())');
  });

  it('matches the Claude Code 2.1.325 shape', () => {
    const input =
      hooks +
      'function Ab(){let I=q((A)=>A.expandedView);return I}' +
      'function Cd(h){let Rh=fS?Math.max(M6,ls-ID):ls-A6,' +
      'Th=Xi()?Math.max(c9e,Math.floor(Rs/2)-Mt):void 0,TR=!Ar;return Th}';
    const result = writeFixInputTaskListOverflow(input);

    expect(result).toContain(
      ',Th=((tlv,tlh)=>Xi()?Math.max(c9e,Math.floor(Rs/2)-Mt-' +
        '(tlv==="tasks"&&tlh?(Rs<=10?0:Math.min(10,Math.max(3,Rs-14))+2):0))' +
        ':void 0)(q((tls)=>tls.expandedView),Kvi()),TR=!Ar'
    );
  });

  it('returns null when the has-tasks hook is not found', () => {
    const input =
      'function abc(){let Yo=G((yi)=>yi.expandedView);return Yo}' +
      'function d9e(h){let x=1,ob=Ri()?Math.max(l6e,Math.floor(wr/2)-a6e):void 0}';

    expect(writeFixInputTaskListOverflow(input)).toBeNull();
  });

  it('ignores a has-tasks lookalike without the non-empty predicate', () => {
    const input =
      ';function Kvi(){return Fe(u(),y)??!1}function y(s){return s!==void 0}' +
      'function abc(){let Yo=G((yi)=>yi.expandedView);return Yo}' +
      'function d9e(h){let x=1,ob=Ri()?Math.max(l6e,Math.floor(wr/2)-a6e):void 0}';

    expect(writeFixInputTaskListOverflow(input)).toBeNull();
  });

  it('returns the file unchanged when already patched', () => {
    const patched = writeFixInputTaskListOverflow(makeInput())!;

    expect(writeFixInputTaskListOverflow(patched)).toBe(patched);
  });

  it('uses the closest preceding useAppState name', () => {
    const input =
      ';function $h(){return F$(u$(),$y)??!1}function $y(s){return s!==void 0&&s.length>0}' +
      'let a=X((s)=>s.expandedView);let b=$G((s)=>s.expandedView);' +
      'let x=1,ob=$r()?Math.max(m$,Math.floor(r$/2)-f$):void 0;';
    const result = writeFixInputTaskListOverflow(input);

    expect(result).toContain('($G((tls)=>tls.expandedView),$h())');
    expect(result).toContain('Math.floor(r$/2)-f$-(tlv==="tasks"&&tlh?');
  });
});
