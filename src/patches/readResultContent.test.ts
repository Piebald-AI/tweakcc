import { describe, expect, it } from 'vitest';

import { writeReadResultContent } from './readResultContent';

// The Read tool's renderToolResultMessage from CC 2.1.332 (chunk-wdr92kma.js).
const RENDER =
  'function F(t){switch(t.type){case"image":{let{originalSize:r}=t.file,i=pn(r);return o(Dt,{tone:"plain",oneRow:!0,children:["Read image (",i,")"]})}case"notebook":{let{cells:r}=t.file;if(!r||r.length<1)return e(n,{color:"error",children:"No cells found in notebook"});return o(Dt,{tone:"plain",oneRow:!0,children:["Read ",e(n,{bold:!0,children:r.length})," cells"]})}case"pdf":{let{originalSize:r}=t.file,i=pn(r);return o(Dt,{tone:"plain",oneRow:!0,children:["Read PDF (",i,")"]})}case"parts":return o(Dt,{tone:"plain",oneRow:!0,children:["Read ",e(n,{bold:!0,children:t.file.count})," ",t.file.count===1?"page":"pages"," (",pn(t.file.originalSize),")"]});case"text":{let r=Pyo(t.file);return o(Dt,{tone:"plain",oneRow:!0,children:["Read ",e(n,{bold:!0,children:r})," ",r===1?"line":"lines"]})}}}';

interface Element {
  type: unknown;
  props: { oneRow?: boolean; children?: unknown };
}

const jsx = (type: unknown, props: object) => ({ type, props });

const render = (
  code: string,
  content: string,
  options: { verbose?: boolean; isTranscriptMode?: boolean }
) =>
  new Function('e,o,n,Dt,Pyo,pn', `${code};return F;`)(
    jsx,
    jsx,
    'Text',
    'MessageResponse',
    (file: { numLines: number }) => file.numLines,
    String
  )(
    {
      type: 'text',
      file: {
        filePath: '/tmp/a.txt',
        content,
        numLines: 2,
        startLine: 1,
        totalLines: 2,
      },
    },
    [],
    options
  ) as Element;

const shownText = (node: unknown): string => {
  if (typeof node === 'string' || typeof node === 'number') return `${node}`;
  if (Array.isArray(node)) return node.map(shownText).join('');
  if (node && typeof node === 'object' && 'props' in node)
    return shownText((node as Element).props.children);
  return '';
};

describe('writeReadResultContent', () => {
  const patched = writeReadResultContent(RENDER)!;
  const content = 'first line\r\nsecond \u001b[31mred\n';

  it('shows only the line count without the patch', () => {
    const row = render(RENDER, content, { isTranscriptMode: true });
    expect(shownText(row)).toBe('Read 2 lines');
  });

  it('keeps the one-line summary in the normal view', () => {
    const row = render(patched, content, {
      verbose: false,
      isTranscriptMode: false,
    });
    expect(shownText(row)).toBe('Read 2 lines');
    expect(row.props.oneRow).toBe(true);
  });

  it('shows the file text in the transcript and in verbose mode', () => {
    for (const options of [{ isTranscriptMode: true }, { verbose: true }]) {
      const row = render(patched, content, options);
      expect(shownText(row)).toBe(
        'Read 2 lines\nfirst line\nsecond \u241b[31mred'
      );
      expect(row.props.oneRow).toBe(false);
    }
  });

  it('keeps the summary when the stored content was dropped', () => {
    expect(shownText(render(patched, '', { isTranscriptMode: true }))).toBe(
      'Read 2 lines'
    );
  });

  it('returns null when the Read text result is not there', () => {
    expect(writeReadResultContent('let x=1;')).toBeNull();
    expect(
      writeReadResultContent(RENDER.replace('"lines"', '"rows"'))
    ).toBeNull();
  });
});
