import { describe, expect, it, vi } from 'vitest';

import { InputPatternHighlighter } from '../types';
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
});
