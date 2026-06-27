import { describe, it, expect } from 'vitest';
import { writeSuppressLineNumbers } from './suppressLineNumbers';

describe('writeSuppressLineNumbers', () => {
  const formatter =
    'function f({content:J,startLine:G}){if(!J)return"";let L=J.split(/\\r?\\n/);return L.map(x=>x).join("")}function g(){}';
  const p1 =
    '"- Results are returned using cat -n format, with line numbers starting at 1"';
  const p2 =
    '`${oYr}. Each line is the line number, a single separator (a tab or \\`:\\`), then the verbatim file content (including any leading whitespace).`';

  it('neutralizes the formatter and rewrites both read-tool prompt lines', () => {
    const result = writeSuppressLineNumbers(
      formatter + ';var X=' + p1 + ',Y=' + p2 + ';'
    );
    expect(result).not.toBeNull();
    expect(result).toContain('if(!J)return"";return J}');
    expect(result).toContain(
      'Results are returned as raw file content without line-number prefixes'
    );
    expect(result).toContain(
      'Results are raw file content without line-number prefixes.'
    );
    expect(result).not.toContain('Each line is the line number');
  });

  it('rewrites the p2 prompt line whose inner backticks are escaped', () => {
    const result = writeSuppressLineNumbers(formatter + ';var Y=' + p2 + ';');
    expect(result).not.toBeNull();
    expect(result).not.toContain('Each line is the line number');
  });

  it('returns null when the formatter signature is absent', () => {
    expect(writeSuppressLineNumbers('no matching content here')).toBeNull();
  });
});
