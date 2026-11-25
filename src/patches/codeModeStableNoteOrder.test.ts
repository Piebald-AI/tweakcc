import { describe, expect, it } from 'vitest';

import { writeCodeModeStableNoteOrder } from './codeModeStableNoteOrder';

// The attachment-placement function from CC 2.1.332 (chunk-bqhgd24a.js).
const PLACEMENT =
  'function rZo(e,n=!1,o=!1){let g=!1;for(let H=0;H<e.length;H++){let z=e[H];if(z.type==="attachment"||n&&Yp(z)){g=!0;break}}if(!g)return e;let h=[],y=[],k=!1;for(let H=e.length-1;H>=0;H--){let z=e[H],{type:Y}=z;if(Y==="attachment"&&z.attachment.type!=="message_pdf_reads"&&!(o&&rde(e,H)))y.push(z);else{let Q=Y==="user"&&Whe(z).length>0,_e=Y==="assistant"||Y==="attachment"||Q||Y==="user"&&(Array.isArray(z.message.content)&&z.message.content[0]?.type==="tool_result"||z.taskDelivery!==void 0),ie=n&&Yp(z);if(_e&&y.length>0){let Se=[],Ae=k&&!o?sZo(y):y;for(let He=0;He<Ae.length;He++){let Ge=Ae[He];if(o&&ZZt(Ge)&&Pnt(z)||Q&&G9e.has(Ge.attachment.type))Se.push(Ge);else h.push(Ge)}if(!ie)h.push(z);y.length=0,y.push(...Se)}else if(!ie)h.push(z);k=!_e&&(k||Y==="user"&&!ie&&!FFe(z))}}let C=k&&!o?sZo(y):y;for(let H=0;H<C.length;H++)h.push(C[H]);return h.reverse(),h}function sZo(e){if(!e.some((n)=>n.placement==="next_to_message"))return e;return[...e.filter((n)=>n.placement==="next_to_message"),...e.filter((n)=>n.placement!=="next_to_message")]}';

type Row = {
  uuid: string;
  type: 'user' | 'assistant' | 'attachment';
  isVirtual?: boolean;
  message?: { content: { type: string }[] };
  attachment?: { type: string };
};

const place = (code: string, rows: Row[]) =>
  (
    new Function(
      'Yp',
      'rde',
      'Whe',
      'ZZt',
      'Pnt',
      'G9e',
      'FFe',
      `${code};return rZo;`
    )(
      (r: Row) =>
        (r.type === 'user' || r.type === 'assistant') && r.isVirtual === true,
      () => false,
      () => [],
      () => false,
      () => false,
      new Set(),
      () => false
    ) as (rows: Row[], scriptRows: boolean) => Row[]
  )(rows, true).map(r => r.uuid);

const user = (uuid: string, block: string, isVirtual = false): Row => ({
  uuid,
  type: 'user',
  isVirtual,
  message: { content: [{ type: block }] },
});
const attachment = (uuid: string, type: string): Row => ({
  uuid,
  type: 'attachment',
  attachment: { type },
});

// A REPL call answered "(dispatched #1)", its repl-eval event, the skill body
// the script loaded, and a plugin note appended after the batch.
const firstSend: Row[] = [
  { uuid: 'repl-call', type: 'assistant', message: { content: [] } },
  user('dispatched', 'tool_result'),
  attachment('event', 'poll_events'),
  user('skill-body', 'text'),
  attachment('note', 'plugin_note'),
];
// The same rows as stored: the script's inner Skill call rows sit between the
// skill body and the note.
const rebuilt: Row[] = [
  ...firstSend.slice(0, 4),
  {
    uuid: 'inner-call',
    type: 'assistant',
    isVirtual: true,
    message: { content: [] },
  },
  user('inner-result', 'tool_result', true),
  firstSend[4],
];

describe('writeCodeModeStableNoteOrder', () => {
  it('places the note differently once script rows are stored, without the patch', () => {
    expect(place(PLACEMENT, firstSend)).toEqual([
      'repl-call',
      'dispatched',
      'event',
      'note',
      'skill-body',
    ]);
    expect(place(PLACEMENT, rebuilt)).toEqual([
      'repl-call',
      'dispatched',
      'event',
      'skill-body',
      'note',
    ]);
  });

  it('places the note the same way with or without script rows, with the patch', () => {
    const patched = writeCodeModeStableNoteOrder(PLACEMENT)!;
    const expected = ['repl-call', 'dispatched', 'event', 'note', 'skill-body'];
    expect(place(patched, firstSend)).toEqual(expected);
    expect(place(patched, rebuilt)).toEqual(expected);
  });

  it('returns null when the placement loop is not there', () => {
    expect(writeCodeModeStableNoteOrder('let x=1;')).toBeNull();
    expect(
      writeCodeModeStableNoteOrder(
        PLACEMENT.replace('"message_pdf_reads"', '"other"')
      )
    ).toBeNull();
  });
});
