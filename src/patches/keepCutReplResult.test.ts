import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { writeKeepCutReplResult } from './keepCutReplResult';

// The end of a Code Mode script run in CC 2.1.332 (chunk-j03wwfcm.js).
const RESULT =
  'Yn=[...me.carriedMarkers],Gn=se===void 0?void 0:Ho(se),en={code:Q,result:Gn?.shown,stdout:Hn(),stderr:Bt,...Vn.length>0&&{toolsUsed:Vn},...Yn.length>0&&{carriedMarkers:Yn},...Ie.length>0&&{images:Ie},...Ke>0&&{imagesOmitted:Ke},...Pt!==void 0&&{imagesRefused:Pt},...zn!==void 0&&{refusedCalls:zn},...V.length>0&&{imagePagesFailed:V},...nt>0&&{imagePagesFailedOmitted:nt},...Mt.length>0&&{documents:Mt},...Lt>0&&{documentsOmitted:Lt},...At.length>0&&{notifications:At}}';

const FREE = [
  'me',
  'se',
  'Ho',
  'Q',
  'Hn',
  'Bt',
  'Vn',
  'Ie',
  'Ke',
  'Pt',
  'zn',
  'V',
  'nt',
  'Mt',
  'Lt',
  'At',
];

type Rendered = { shown: string; uncut?: { label?: string; text: string }[] };

const run = (
  code: string,
  session: object,
  value: unknown,
  rendered: Rendered
) =>
  new Function(...FREE, `let ${code};return{Gn,en};`)(
    session,
    value,
    () => rendered,
    'return x',
    () => '',
    '',
    [],
    [],
    0,
    undefined,
    undefined,
    [],
    0,
    [],
    0,
    []
  ) as { Gn: Rendered; en: { result: string } };

const whole = 'a'.repeat(20000) + 'MIDDLE' + 'z'.repeat(20000);
const cut: Rendered = {
  shown: `${whole.slice(0, 18000)}\n... [${whole.length - 30000} chars elided] ...\n${whole.slice(-12000)}`,
  uncut: [{ text: whole }],
};

const newSession = () => {
  const context = vm.createContext({});
  return {
    context,
    carriedMarkers: new Set(),
    vmGlobal: vm.runInContext('globalThis', context),
  };
};

describe('writeKeepCutReplResult', () => {
  it('keeps a cut string result in $0 and says so', () => {
    const session = newSession();
    const { Gn, en } = run(
      writeKeepCutReplResult(RESULT)!,
      session,
      whole,
      cut
    );
    expect(vm.runInContext('$0.indexOf("MIDDLE")', session.context)).toBe(
      20000
    );
    expect(
      vm.runInContext('$0 === globalThis.$0 && typeof $0', session.context)
    ).toBe('string');
    expect(en.result).toBe(Gn.shown);
    expect(Gn.shown).toMatch(
      /^\[The result below is cut\. The whole of it, 40006 chars, is in \$0 \(a string\)/
    );
    expect(Gn.shown.endsWith(cut.shown)).toBe(true);
    expect(Gn.uncut).toBe(cut.uncut);
  });

  it('joins labelled parts the way the uncut file does', () => {
    const session = newSession();
    run(
      writeKeepCutReplResult(RESULT)!,
      session,
      {},
      {
        shown: 'cut',
        uncut: [
          { label: 'a', text: 'x' },
          { label: 'b', text: 'y' },
        ],
      }
    );
    expect(vm.runInContext('$0', session.context)).toBe('a:\nx\n\nb:\ny');
  });

  it('leaves results that were not cut, and sessions without a VM global, alone', () => {
    const session = newSession();
    const short = { shown: 'short' };
    expect(
      run(writeKeepCutReplResult(RESULT)!, session, 'short', short).Gn
    ).toBe(short);
    expect(vm.runInContext('typeof $0', session.context)).toBe('undefined');
    expect(
      run(
        writeKeepCutReplResult(RESULT)!,
        { carriedMarkers: new Set() },
        whole,
        cut
      ).Gn
    ).toBe(cut);
  });

  it('does not name $0 when it cannot be set', () => {
    const session = newSession();
    vm.runInContext(
      'Object.defineProperty(globalThis, "$0", { value: 1 })',
      session.context
    );
    expect(run(writeKeepCutReplResult(RESULT)!, session, whole, cut).Gn).toBe(
      cut
    );
  });

  it('shows the cut result unchanged without the patch', () => {
    const session = newSession();
    expect(run(RESULT, session, whole, cut).Gn).toBe(cut);
    expect(vm.runInContext('typeof $0', session.context)).toBe('undefined');
  });

  it('returns null when the result rendering is not there', () => {
    expect(writeKeepCutReplResult('let x=1;')).toBeNull();
    expect(
      writeKeepCutReplResult(RESULT.replace('result:Gn?.shown', 'result:Gn'))
    ).toBeNull();
  });
});
