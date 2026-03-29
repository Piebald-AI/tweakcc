// Please see the note about writing patches in ./index

import { showDiff } from './index';

interface LiteralVariant {
  oldSnippet: string;
  newSnippet: string;
}

const replaceLiteralOnce = (
  file: string,
  oldSnippet: string,
  newSnippet: string,
  errorMessage: string
): string | null => {
  const startIndex = file.indexOf(oldSnippet);

  if (startIndex === -1) {
    console.error(errorMessage);
    return null;
  }

  if (file.indexOf(oldSnippet, startIndex + oldSnippet.length) !== -1) {
    console.error(`${errorMessage} (matched multiple times)`);
    return null;
  }

  const endIndex = startIndex + oldSnippet.length;
  const newFile = file.slice(0, startIndex) + newSnippet + file.slice(endIndex);

  showDiff(file, newFile, newSnippet, startIndex, endIndex);

  return newFile;
};

const replaceAnyLiteralOnce = (
  file: string,
  variants: LiteralVariant[],
  errorMessage: string
): string | null => {
  for (const variant of variants) {
    const startIndex = file.indexOf(variant.oldSnippet);

    if (startIndex === -1) {
      continue;
    }

    if (
      file.indexOf(
        variant.oldSnippet,
        startIndex + variant.oldSnippet.length
      ) !== -1
    ) {
      console.error(`${errorMessage} (matched multiple times)`);
      return null;
    }

    const endIndex = startIndex + variant.oldSnippet.length;
    const newFile =
      file.slice(0, startIndex) + variant.newSnippet + file.slice(endIndex);

    showDiff(file, newFile, variant.newSnippet, startIndex, endIndex);

    return newFile;
  }

  console.error(errorMessage);
  return null;
};

const MODEL_PICKER_2186_CALLSITE =
  'let E6=A??SYz,T6;if(K[49]!==J6||K[50]!==a||K[51]!==C||K[52]!==X||K[53]!==p||K[54]!==E6||K[55]!==F)T6=zK.createElement(m,{flexDirection:"column"},zK.createElement(J1,{defaultValue:X,defaultFocusValue:C,options:p,onChange:a,onFocus:J6,onCancel:E6,visibleOptionCount:F})),K[49]=J6,K[50]=a,K[51]=C,K[52]=X,K[53]=p,K[54]=E6,K[55]=F,K[56]=T6;else T6=K[56];let R6;if(K[57]!==g)R6=g>0&&zK.createElement(m,{paddingLeft:3},zK.createElement(v,{dimColor:!0},"and ",g," more…")),K[57]=g,K[58]=R6;else R6=K[58];let y6;if(K[59]!==T6||K[60]!==R6)y6=zK.createElement(m,{flexDirection:"column",marginBottom:1},T6,R6),K[59]=T6,K[60]=R6,K[61]=y6;else y6=K[61];';
const MODEL_PICKER_2187_CALLSITE =
  'let E6=A??hYz,T6;if(K[49]!==J6||K[50]!==a||K[51]!==C||K[52]!==X||K[53]!==p||K[54]!==E6||K[55]!==F)T6=zK.createElement(m,{flexDirection:"column"},zK.createElement(J1,{defaultValue:X,defaultFocusValue:C,options:p,onChange:a,onFocus:J6,onCancel:E6,visibleOptionCount:F})),K[49]=J6,K[50]=a,K[51]=C,K[52]=X,K[53]=p,K[54]=E6,K[55]=F,K[56]=T6;else T6=K[56];let R6;if(K[57]!==g)R6=g>0&&zK.createElement(m,{paddingLeft:3},zK.createElement(v,{dimColor:!0},"and ",g," more…")),K[57]=g,K[58]=R6;else R6=K[58];let y6;if(K[59]!==T6||K[60]!==R6)y6=zK.createElement(m,{flexDirection:"column",marginBottom:1},T6,R6),K[59]=T6,K[60]=R6,K[61]=y6;else y6=K[61];';

const isSupportedModelPickerVersion = (file: string): boolean =>
  file.includes(MODEL_PICKER_2186_CALLSITE) ||
  file.includes(MODEL_PICKER_2187_CALLSITE);

const addSearchStateToModelPicker = (file: string): string | null =>
  replaceAnyLiteralOnce(
    file,
    [
      {
        oldSnippet: '[W,Z]=SB8.useState(!1),f=M8(bYz),G;if(',
        newSnippet:
          '[W,Z]=SB8.useState(!1),[L7,b7]=SB8.useState(""),f=M8(bYz),G;if(',
      },
      {
        oldSnippet: '[W,Z]=SB8.useState(!1),f=M8(CYz),G;if(',
        newSnippet:
          '[W,Z]=SB8.useState(!1),[L7,b7]=SB8.useState(""),f=M8(CYz),G;if(',
      },
    ],
    'patch: modelSelectorSearch: failed to add model picker search state'
  );

const addSearchUiToModelPicker = (file: string): string | null => {
  let nextFile = replaceAnyLiteralOnce(
    file,
    [
      {
        oldSnippet: MODEL_PICKER_2186_CALLSITE,
        newSnippet:
          'let E6=A??SYz,T6=zK.createElement(m,{flexDirection:"column"},p.length===0?zK.createElement(v,{dimColor:!0,italic:!0},"No models match \u201c",L7,"\u201d"):zK.createElement(J1,{defaultValue:X,defaultFocusValue:C,options:p,onChange:a,onFocus:J6,onCancel:E6,visibleOptionCount:F,highlightText:L7}));let R6=g>0&&zK.createElement(m,{paddingLeft:3},zK.createElement(v,{dimColor:!0},"and ",g," more…"));let y6=zK.createElement(m,{flexDirection:"column",marginBottom:1},T6,R6);let n6=zK.createElement(m,{marginTop:1,width:"100%",minWidth:48,flexGrow:1,borderStyle:"round",borderColor:"suggestion",paddingX:1,flexDirection:"row"},zK.createElement(v,{dimColor:!0},"\u2315 "),zK.createElement(m,{flexGrow:1},zK.createElement(x3,{value:L7,onChange:b7,onSubmit:()=>{if(C!==void 0)a(C)},onExit:E6,placeholder:"Search models..."+" ".repeat(48),focus:!0,showCursor:!0,multiline:!1,cursorOffset:L7.length,onChangeCursorOffset:()=>{},columns:Math.max(42,(process.stdout.columns||80)-10)})));',
      },
      {
        oldSnippet: MODEL_PICKER_2187_CALLSITE,
        newSnippet:
          'let E6=A??hYz,T6=zK.createElement(m,{flexDirection:"column"},p.length===0?zK.createElement(v,{dimColor:!0,italic:!0},"No models match \u201c",L7,"\u201d"):zK.createElement(J1,{defaultValue:X,defaultFocusValue:C,options:p,onChange:a,onFocus:J6,onCancel:E6,visibleOptionCount:F,highlightText:L7}));let R6=g>0&&zK.createElement(m,{paddingLeft:3},zK.createElement(v,{dimColor:!0},"and ",g," more…"));let y6=zK.createElement(m,{flexDirection:"column",marginBottom:1},T6,R6);let n6=zK.createElement(m,{marginTop:1,width:"100%",minWidth:48,flexGrow:1,borderStyle:"round",borderColor:"suggestion",paddingX:1,flexDirection:"row"},zK.createElement(v,{dimColor:!0},"\u2315 "),zK.createElement(m,{flexGrow:1},zK.createElement(x3,{value:L7,onChange:b7,onSubmit:()=>{if(C!==void 0)a(C)},onExit:E6,placeholder:"Search models..."+" ".repeat(48),focus:!0,showCursor:!0,multiline:!1,cursorOffset:L7.length,onChangeCursorOffset:()=>{},columns:Math.max(42,(process.stdout.columns||80)-10)})));',
      },
    ],
    'patch: modelSelectorSearch: failed to update model picker J1 callsite'
  );

  if (!nextFile) {
    return null;
  }

  nextFile = replaceLiteralOnce(
    nextFile,
    'let K8;if(K[69]!==f6||K[70]!==y6||K[71]!==S6||K[72]!==s6)K8=zK.createElement(m,{flexDirection:"column"},f6,y6,S6,s6),K[69]=f6,K[70]=y6,K[71]=S6,K[72]=s6,K[73]=K8;else K8=K[73];',
    'let K8=zK.createElement(m,{flexDirection:"column",width:"100%"},f6,y6,S6,s6,n6);',
    'patch: modelSelectorSearch: failed to add model picker search box'
  );

  return nextFile;
};

const addFuzzyFilteringToModelPicker = (file: string): string | null => {
  let nextFile = replaceLiteralOnce(
    file,
    'let p=I,B;if(K[14]!==X||K[15]!==p)B=p.some((A6)=>A6.value===X)?X:p[0]?.value??void 0,K[14]=X,K[15]=p,K[16]=B;else B=K[16];',
    'let p=L7.trim()?I.map((A6)=>{let y6=L7.toLowerCase().trim(),c6=y6.replace(/[^a-z0-9]/g,""),g6=`${typeof A6.label==="string"?A6.label:""} ${A6.value??""}`.toLowerCase(),F6=g6.replace(/[^a-z0-9]/g,""),B6=`${typeof A6.label==="string"?A6.label:""} ${A6.description??""} ${A6.value??""}`.toLowerCase().replace(/[^a-z0-9]/g,"");if(c6==="")return{option:A6,score:3};let N6;if(F6===c6)N6=0;else if(F6.includes(c6))N6=1;else if(B6.includes(c6))N6=2;else{let e6=0;for(let t6 of c6){e6=B6.indexOf(t6,e6);if(e6===-1)return null;e6++;}N6=3}return{option:A6,score:N6};}).filter((A6)=>A6!==null).sort((A6,y6)=>A6.score-y6.score).map((A6)=>A6.option):I,B=L7.trim()?p[0]?.value??void 0:p.some((A6)=>A6.value===X)?X:p[0]?.value??void 0;',
    'patch: modelSelectorSearch: failed to add fuzzy filtering'
  );

  if (!nextFile) {
    return null;
  }

  nextFile = replaceLiteralOnce(
    nextFile,
    'let C=B,F=Math.min(10,p.length),g=Math.max(0,p.length-F),Q;',
    'let C=B,F=Math.min(25,Math.max(1,p.length)),g=Math.max(0,p.length-F),Q;',
    'patch: modelSelectorSearch: failed to update filtered visible count'
  );

  return nextFile;
};

export const writeModelSelectorSearch = (oldFile: string): string | null => {
  if (!isSupportedModelPickerVersion(oldFile)) {
    console.error(
      'patch: modelSelectorSearch: only supported on Claude Code 2.1.86 or 2.1.87'
    );
    return null;
  }

  let newFile = addSearchStateToModelPicker(oldFile);
  if (!newFile) {
    return null;
  }

  newFile = addSearchUiToModelPicker(newFile);
  if (!newFile) {
    return null;
  }

  newFile = addFuzzyFilteringToModelPicker(newFile);
  if (!newFile) {
    return null;
  }

  return newFile;
};
