import { describe, it, expect } from 'vitest';

import { writeFixInputTaskListOverflow } from './fixInputTaskListOverflow';

const hooks =
  ';function Pce(){return Fe(u())}function Kvi(){return Fe(u(),y)??!1}' +
  'function y(s){return s!==void 0&&s.length>0}';

const taskList = (limit = 5) =>
  `function Geo(i){let a=1,B=A<=10?0:Math.min(${limit},Math.max(3,A-14));return B}`;

const budget =
  'function d9e(h){let x=1,ob=Ri()?Math.max(l6e,Math.floor(wr/2)-a6e):void 0}';

const selector = 'function abc(){let Yo=G((yi)=>yi.expandedView);return Yo}';

const makeInput = () =>
  hooks +
  taskList() +
  'function abc(){let No=G(sao),Yo=G((yi)=>yi.expandedView);return Yo}' +
  'function d9e(h){let x=G(nao),{columns:Zr,rows:wr}=Ae();' +
  'let TB=Fne,nf=TB?.text??"",zg=sv?Math.max(YX,Zr-_Ne):Zr-zX,' +
  'ob=Ri()?Math.max(l6e,Math.floor(wr/2)-a6e):void 0,uD=!Yr;return ob}';

const reserve = '2+Math.min(tlh.length,tlb)+(tlh.length>tlb&&tlb>0?1:0)';

describe('writeFixInputTaskListOverflow', () => {
  it('subtracts the visible task list height while the task list is expanded', () => {
    const result = writeFixInputTaskListOverflow(makeInput());

    expect(result).not.toBeNull();
    expect(result).toContain(
      ',ob=((tlv,tlh,tlb)=>Ri()?Math.max(l6e,Math.floor(wr/2)-a6e-' +
        `(tlv==="tasks"&&tlh?.length?${reserve}:0)):void 0)` +
        '(G((tls)=>tls.expandedView),Pce(),' +
        'wr<=10?0:Math.min(5,Math.max(3,wr-14))),uD=!Yr'
    );
    expect(result).toContain(
      hooks +
        taskList() +
        'function abc(){let No=G(sao),Yo=G((yi)=>yi.expandedView);return Yo}'
    );
  });

  it('returns null when maxVisibleLines is not found', () => {
    expect(
      writeFixInputTaskListOverflow(hooks + taskList() + selector)
    ).toBeNull();
  });

  it('returns null when no expandedView selector exists', () => {
    expect(
      writeFixInputTaskListOverflow(hooks + taskList() + budget)
    ).toBeNull();
  });

  it('falls back to a selector that follows the budget', () => {
    const result = writeFixInputTaskListOverflow(
      hooks + taskList() + budget + selector
    );

    expect(result).toContain('(G((tls)=>tls.expandedView),Pce(),');
  });

  it('matches the Claude Code 2.1.325 shape', () => {
    const input =
      hooks +
      taskList() +
      'function Ab(){let I=q((A)=>A.expandedView);return I}' +
      'function Cd(h){let Rh=fS?Math.max(M6,ls-ID):ls-A6,' +
      'Th=Xi()?Math.max(c9e,Math.floor(Rs/2)-Mt):void 0,TR=!Ar;return Th}';
    const result = writeFixInputTaskListOverflow(input);

    expect(result).toContain(
      ',Th=((tlv,tlh,tlb)=>Xi()?Math.max(c9e,Math.floor(Rs/2)-Mt-' +
        `(tlv==="tasks"&&tlh?.length?${reserve}:0)):void 0)` +
        '(q((tls)=>tls.expandedView),Pce(),' +
        'Rs<=10?0:Math.min(5,Math.max(3,Rs-14))),TR=!Ar'
    );
  });

  it('uses the visible task limit found in the bundle', () => {
    const result = writeFixInputTaskListOverflow(
      hooks + taskList(7) + selector + budget
    );

    expect(result).toContain('wr<=10?0:Math.min(7,Math.max(3,wr-14)))');
  });

  it('returns null when the visible task limit is not found', () => {
    expect(writeFixInputTaskListOverflow(hooks + selector + budget)).toBeNull();
  });

  it('returns null when the task list hook is not found', () => {
    const input =
      ';function Kvi(){return Fe(u(),y)??!1}' +
      'function y(s){return s!==void 0&&s.length>0}' +
      taskList() +
      selector +
      budget;

    expect(writeFixInputTaskListOverflow(input)).toBeNull();
  });

  it('ignores a has-tasks lookalike without the non-empty predicate', () => {
    const input =
      ';function Pce(){return Fe(u())}function Kvi(){return Fe(u(),y)??!1}' +
      'function y(s){return s!==void 0}' +
      taskList() +
      selector +
      budget;

    expect(writeFixInputTaskListOverflow(input)).toBeNull();
  });

  it('finds the task list hook after a lookalike', () => {
    const input =
      ';function Zl(){return Fe(w())}function Abc(){return Fe(w(),z)??!1}' +
      'function z(s){return s!==void 0}' +
      hooks +
      taskList() +
      selector +
      budget;

    expect(writeFixInputTaskListOverflow(input)).toContain(
      '(G((tls)=>tls.expandedView),Pce(),'
    );
  });

  it('finds the task list hook right after an adjacent lookalike', () => {
    const input =
      ';function Pce(){return Fe(u())}' +
      'function Abc(){return Fe(u(),z)??!1}function Kvi(){return Fe(u(),y)??!1}' +
      'function z(s){return s!==void 0}function y(s){return s!==void 0&&s.length>0}' +
      taskList() +
      selector +
      budget;

    expect(writeFixInputTaskListOverflow(input)).toContain(
      '(G((tls)=>tls.expandedView),Pce(),'
    );
  });

  it('returns null when a captured identifier collides with a parameter', () => {
    const input =
      hooks +
      taskList() +
      selector +
      'function d9e(h){let x=1,ob=Ri()?Math.max(l6e,Math.floor(tlb/2)-a6e):void 0}';

    expect(writeFixInputTaskListOverflow(input)).toBeNull();
  });

  it('returns the file unchanged when already patched', () => {
    const patched = writeFixInputTaskListOverflow(makeInput())!;

    expect(writeFixInputTaskListOverflow(patched)).toBe(patched);
  });

  it('uses the closest preceding useAppState name', () => {
    const input =
      ';function $l(){return F$(u$())}function $h(){return F$(u$(),$y)??!1}' +
      'function $y(s){return s!==void 0&&s.length>0}' +
      'let a=1,$B=$A<=10?0:Math.min(5,Math.max(3,$A-14));' +
      'let c=X((s)=>s.expandedView);let b=$G((s)=>s.expandedView);' +
      'let x=1,ob=$r()?Math.max(m$,Math.floor(r$/2)-f$):void 0;';
    const result = writeFixInputTaskListOverflow(input);

    expect(result).toContain('($G((tls)=>tls.expandedView),$l(),');
    expect(result).toContain(
      'Math.floor(r$/2)-f$-(tlv==="tasks"&&tlh?.length?'
    );
  });
});
