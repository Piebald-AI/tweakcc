import { describe, expect, it, vi } from 'vitest';

import { InputPatternHighlighter } from '../types';
import {
  beginGraphContext,
  endGraphContext,
  enterGraphModule,
  leaveGraphModule,
} from './graphContext';
import { writeInputPatternHighlighters } from './inputPatternHighlighters';

vi.mock('./index', async () => {
  const actual = await vi.importActual<typeof import('./index')>('./index');
  return {
    ...actual,
    findChalkVar: () => 'chalk',
    showDiff: vi.fn(),
  };
});

const baseHighlighter = (
  overrides: Partial<InputPatternHighlighter>
): InputPatternHighlighter => ({
  name: 'test',
  regex: 'ok',
  regexFlags: 'g',
  format: '{MATCH}',
  styling: [],
  foregroundColor: '#ffffff',
  backgroundColor: null,
  enabled: true,
  ...overrides,
});

describe('writeInputPatternHighlighters', () => {
  it('skips invalid user regexes and still emits valid highlighters', () => {
    const input =
      'let props={inputValue:inputText,other:1};' +
      'return R.createElement(T,{key:E,color:N.highlight?.color,dimColor:N.highlight?.dimColor,inverse:N.highlight?.inverse},R.createElement(I,null,N.text));' +
      ';let ranges=React.useMemo(()=>{let arr=[];if(a&&b&&!c)arr.push({start:s,end:s+l.length,color:"warning",priority:1})},[]);';

    const result = writeInputPatternHighlighters(input, [
      baseHighlighter({ name: 'broken', regex: '[', regexFlags: 'g' }),
      baseHighlighter({ name: 'valid', regex: 'todo', regexFlags: '' }),
    ]);

    expect(result).not.toBeNull();
    expect(result).toContain('matchAll(new RegExp("todo", "g"))');
    expect(result).not.toContain('new RegExp("["');
  });

  it('rewrites the JSX automatic-runtime renderer and shimmer (CC >=2.1.195)', () => {
    const input =
      'let props={inputValue:inputText,other:1};' +
      'if(x.highlight?.shimmerColor&&x.highlight.color)return M0e.jsx(w,{children:x.text.split("").map((k,D)=>M0e.jsx(OGe,{char:k,index:x.start+D,glimmerIndex:b,messageColor:x.highlight.color,shimmerColor:x.highlight.shimmerColor},D))},I);' +
      'return M0e.jsx(w,{color:x.highlight?.color,dimColor:x.highlight?.dimColor,inverse:x.highlight?.inverse,children:M0e.jsx(bd,{children:x.text})},I);' +
      ';let ranges=Po.useMemo(()=>{let arr=[];if(a&&b&&!c)arr.push({start:s,end:s+l.length,color:"warning",priority:20})},[]);';

    const result = writeInputPatternHighlighters(input, [
      baseHighlighter({ name: 'valid', regex: 'todo', regexFlags: '' }),
    ]);

    expect(result).not.toBeNull();
    expect(result).toContain(
      'bold:x.highlight?.style?void 0:x.highlight?.bold'
    );
    expect(result).toContain(
      'children:M0e.jsx(bd,{children:x.highlight?.style?x.highlight.style(x.text):x.text})'
    );
    expect(result).toContain(
      "if(typeof x.highlight?.color==='function')return M0e.jsx(w,{children:M0e.jsx(bd,{children:x.highlight.color(x.text)})},I);"
    );
    expect(result).toContain('matchAll(new RegExp("todo", "g"))');
    expect(result).toContain('style:(x)=>chalk(x),priority:100');
    expect(result).not.toContain('.createElement(');
  });

  it('rewrites the CC 2.1.285 renderer that already lists bold/italic/background', () => {
    // 2.1.285 renders every style prop natively except inverse, so without the
    // rewrite an inverse highlighter silently does nothing.
    const renderer =
      'R=(V,ne)=>e(s,{children:V.map((m,E)=>{if(m.highlight?.shimmerColor&&m.highlight.color){return e(n,{children:m.text.split("").map((W,T)=>e(z,{char:W},T))},E)}' +
      'return e(n,{color:m.highlight?.color,backgroundColor:m.highlight?.backgroundColor,dimColor:m.highlight?.dimColor,bold:m.highlight?.bold,italic:m.highlight?.italic,underline:m.highlight?.underline,strikethrough:m.highlight?.strikethrough,children:e(Zr,{children:m.text})},E)})},ne)';
    beginGraphContext(new Map([['/$bunfs/root/chunk-r.js', renderer]]));
    enterGraphModule('/$bunfs/root/chunk-r.js');
    let result: string | null;
    try {
      result = writeInputPatternHighlighters(renderer, [
        baseHighlighter({ name: 'inv', regex: 'x', styling: ['inverse'] }),
      ]);
    } finally {
      leaveGraphModule();
      endGraphContext();
    }
    expect(result).not.toBeNull();
    expect(result).toContain(
      'inverse:m.highlight?.style?void 0:m.highlight?.inverse'
    );
    expect(result).toContain(
      'children:e(Zr,{children:m.highlight?.style?m.highlight.style(m.text):m.text})'
    );
  });
});
