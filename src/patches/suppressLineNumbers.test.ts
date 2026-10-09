import { describe, it, expect } from 'vitest';
import { PatchGroup } from './index';
import { applyPatchImplementationsToGraph } from './nativeGraphDispatcher';
import { writeSuppressLineNumbers } from './suppressLineNumbers';

describe('writeSuppressLineNumbers', () => {
  const formatter =
    'function f({content:J,startLine:G}){if(!J)return"";let L=J.split(/\\r?\\n/);return L.map(x=>x).join("")}function g(){}';
  const p1 =
    '"- Results are returned using cat -n format, with line numbers starting at 1"';
  const p2 =
    '`${oYr}. Each line is the line number, a single separator (a tab or \\`:\\`), then the verbatim file content (including any leading whitespace).`';
  const p2Unescaped =
    '`${oYr}. Each line is the line number, a single separator (a tab or `:`), then the verbatim file content (including any leading whitespace).`';

  it('neutralizes the formatter and rewrites both read-tool prompt lines', () => {
    const result = writeSuppressLineNumbers(
      formatter + ';var X=' + p1 + ',Y=' + p2 + ';'
    );
    expect(result).not.toBeNull();
    expect(result).toContain('if(!J)return"";return J}');
    expect(result).toContain(
      'var X="- Results are returned as raw file content without line-number prefixes"'
    );
    expect(result).toContain(
      'Y=`- Results are returned as raw file content without line-number prefixes`'
    );
    expect(result).not.toContain('Each line is the line number');
  });

  it('rewrites the p2 prompt line whose inner backticks are escaped', () => {
    const result = writeSuppressLineNumbers(formatter + ';var Y=' + p2 + ';');
    expect(result).not.toBeNull();
    expect(result).not.toContain('Each line is the line number');
  });

  it('also rewrites the p2 prompt line with unescaped separator backticks', () => {
    const result = writeSuppressLineNumbers(
      formatter + ';var Y=' + p2Unescaped + ';'
    );
    expect(result).not.toBeNull();
    expect(result).not.toContain('Each line is the line number');
  });

  it('returns null when the formatter signature is absent', () => {
    expect(writeSuppressLineNumbers('no matching content here')).toBeNull();
  });
});

describe('writeSuppressLineNumbers on a CC 2.1.295 module graph', () => {
  // Trimmed from real 2.1.295 chunks: the formatter and the Read tool prompt
  // live in different modules.
  const formatterModule =
    'function out({content:e,startLine:n,tabAwareSeparator:r=!1}){if(!e)return"";let s=r&&(e.startsWith("\\t")||e.includes(`\n\t`))?":":"\\t",u=[],i=n,o=0,f=e.indexOf(`\n`);while(f!==-1)u.push(mRr(e.slice(o,f),i++,s)),o=f+1,f=e.indexOf(`\n`,o);return u.push(mRr(e.slice(o),i,s)),u.join(`\n`)}function mRr(e,n,r){let s=e.endsWith("\\r")?e.slice(0,-1):e;return`${n}${r}${s}`}function bzn(e){return e}';
  const promptModule =
    'var YLe="[Truncated: PARTIAL view \\u2014 ",w9t=2000,vms="Read a file from the local filesystem.",jdo="- Results are returned using cat -n format, with line numbers starting at 1",Ems=`${jdo}. Each line is the line number, a single separator (a tab or \\`:\\`), then the verbatim file content (including any leading whitespace).`,$s="- When you already know which part of the file you need, only read that part. This can be important for larger files.";';

  const onGraph = (modules: Record<string, string>) => {
    const sources = new Map(Object.entries(modules));
    const out = applyPatchImplementationsToGraph(
      sources,
      { p: { fn: writeSuppressLineNumbers } },
      [{ id: 'p', name: 'p', group: PatchGroup.MISC_CONFIGURABLE }]
    );
    return { sources, result: out.results[0] };
  };

  it('neutralizes the formatter and rewrites the prompt in its own module', () => {
    const { sources, result } = onGraph({
      '/fmt.js': formatterModule,
      '/prompt.js': promptModule,
    });
    expect(result).toMatchObject({ applied: true, failed: false });
    expect(sources.get('/fmt.js')).toContain(
      'tabAwareSeparator:r=!1}){if(!e)return"";return e}function mRr(e){return e.endsWith("\\r")?e.slice(0,-1):e}'
    );
    const prompt = sources.get('/prompt.js')!;
    expect(prompt).toContain(
      'jdo="- Results are returned as raw file content without line-number prefixes"'
    );
    expect(prompt).toContain(
      'Ems=`- Results are returned as raw file content without line-number prefixes`'
    );
  });

  it('fails rather than rewriting only the prompt when the formatter is gone', () => {
    const { sources, result } = onGraph({ '/prompt.js': promptModule });
    expect(result).toMatchObject({ applied: false, failed: true });
    expect(sources.get('/prompt.js')).toBe(promptModule);
  });
});
