import { describe, expect, it } from 'vitest';

import { PatchGroup } from './index';
import { applyPatchImplementationsToGraph } from './nativeGraphDispatcher';
import { writeShowMoreItemsInSelectMenus } from './showMoreItemsInSelectMenus';

describe('writeShowMoreItemsInSelectMenus on CC 2.1.295', () => {
  // Real excerpts: chunk-bjsr3cz2.js (/help command list, counts lines) and
  // chunk-tjhhhqzz.js (/model picker cap).
  const helpCommands =
    'function z(x){let l=w(13),{commands:m,maxHeight:a}=x,{headerFocused:i,focusHeader:c}=fy(),t=2*Math.max(1,Math.floor((a-10)/2)),o=tt(),u;';
  const modelPicker =
    'yo=0,Xo=Ko()&&(Se||cR()&&!f$e()),pn=Xo?3:0,Dn=_t!==null?3:0,jo=Math.max(2,Math.min(10,Math.floor((je-sHe-yo-pn-Dn)/2))),[,Go,Mo]=fd(!1),yn=V' +
    'x({subtitle:"Switch between Claude models"})';

  const run = (modules: Record<string, string>) => {
    const sources = new Map(Object.entries(modules));
    const out = applyPatchImplementationsToGraph(
      sources,
      { p: { fn: s => writeShowMoreItemsInSelectMenus(s, 25) } },
      [{ id: 'p', name: 'p', group: PatchGroup.MISC_CONFIGURABLE }]
    );
    return { sources, result: out.results[0] };
  };

  it('lifts the /model picker cap but leaves the line-counted /help list alone', () => {
    const { sources, result } = run({
      '/help.js': helpCommands,
      '/model.js': modelPicker,
    });
    expect(result).toMatchObject({ applied: true, failed: false });
    expect(sources.get('/model.js')).toContain(
      'Math.max(2,Math.min(25,Math.floor((je-sHe-yo-pn-Dn)/2))'
    );
    expect(sources.get('/help.js')).toBe(helpCommands);
  });
  it('raises the React-compiled Select default (pe=l===void 0?5:l)', () => {
    // Real excerpt: chunk-maph1hbj.js `Yi`, the Select every menu renders.
    const select =
      'function Yi(o){let k=w(84),{isDisabled:t,hideIndexes:i,disablePrintableKeybindings:a,visibleOptionCount:l,hiddenBelowUnit:f,highlightText:c,options:u,columnSizingOptions:b,defaultValue:d,selectedValue:m,onCancel:D,onChange:I,onFocus:O,defaultFocusValue:L,layout:j,disableSelection:h,inlineDescriptions:v,hoverStyle:x,inputChromeWidth:A,onUpFromFirstItem:W,onDownFromLastItem:M,onInputModeToggle:C,onOpenEditor:E,canPasteImage:B,onImagePaste:K,pastedContents:g,onRemoveImage:ue,pointerWhileDisabled:he}=o,_=t===void 0?!1:t,q=i===void 0?!1:i,ye=a===void 0?!1:a,pe=l===void 0?5:l,';
    const out = writeShowMoreItemsInSelectMenus(select, 25);
    expect(out).toBe(select.replace('pe=l===void 0?5:l', 'pe=l===void 0?25:l'));
  });
});
