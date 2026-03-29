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

    if (startIndex !== -1) {
      const endIndex = startIndex + variant.oldSnippet.length;
      const newFile =
        file.slice(0, startIndex) + variant.newSnippet + file.slice(endIndex);

      showDiff(file, newFile, variant.newSnippet, startIndex, endIndex);

      return newFile;
    }
  }

  console.error(errorMessage);
  return null;
};

const MODEL_PICKER_2186_CALLSITE =
  'let E6=A??SYz,T6;if(K[49]!==J6||K[50]!==a||K[51]!==C||K[52]!==X||K[53]!==p||K[54]!==E6||K[55]!==F)T6=zK.createElement(m,{flexDirection:"column"},zK.createElement(J1,{defaultValue:X,defaultFocusValue:C,options:p,onChange:a,onFocus:J6,onCancel:E6,visibleOptionCount:F})),K[49]=J6,K[50]=a,K[51]=C,K[52]=X,K[53]=p,K[54]=E6,K[55]=F,K[56]=T6;else T6=K[56];let R6;if(K[57]!==g)R6=g>0&&zK.createElement(m,{paddingLeft:3},zK.createElement(v,{dimColor:!0},"and ",g," more…")),K[57]=g,K[58]=R6;else R6=K[58];let y6;if(K[59]!==T6||K[60]!==R6)y6=zK.createElement(m,{flexDirection:"column",marginBottom:1},T6,R6),K[59]=T6,K[60]=R6,K[61]=y6;else y6=K[61];';

const isModelPicker2186 = (file: string): boolean =>
  file.includes(MODEL_PICKER_2186_CALLSITE);

const addSearchStateToModelPicker = (file: string): string | null =>
  replaceAnyLiteralOnce(
    file,
    [
      {
        oldSnippet: '[W,Z]=HB8.useState(!1),G=M8(F3Y),f;',
        newSnippet:
          '[W,Z]=HB8.useState(!1),[L7,b7]=HB8.useState(""),G=M8(F3Y),f;',
      },
      {
        oldSnippet: '[W,Z]=HB8.useState(!1),G=M8(F3Y),f;if(',
        newSnippet:
          '[W,Z]=HB8.useState(!1),[L7,b7]=HB8.useState(""),G=M8(F3Y),f;if(',
      },
      {
        oldSnippet: '[W,Z]=SB8.useState(!1),f=M8(bYz),G;if(',
        newSnippet:
          '[W,Z]=SB8.useState(!1),[L7,b7]=SB8.useState(""),f=M8(bYz),G;if(',
      },
    ],
    'patch: modelSelectorSearch: failed to add model picker search state'
  );

const addSearchUiToModelPicker = (file: string): string | null => {
  let nextFile = replaceAnyLiteralOnce(
    file,
    [
      {
        oldSnippet:
          'let k6=$??p3Y,f6;if(K[49]!==J6||K[50]!==s||K[51]!==C||K[52]!==X||K[53]!==p||K[54]!==k6||K[55]!==g)f6=KK.createElement(B,{flexDirection:"column"},KK.createElement(J1,{defaultValue:X,defaultFocusValue:C,options:p,onChange:s,onFocus:J6,onCancel:k6,visibleOptionCount:g})),K[49]=J6,K[50]=s,K[51]=C,K[52]=X,K[53]=p,K[54]=k6,K[55]=g,K[56]=f6;else f6=K[56];let R6;if(K[57]!==F)R6=F>0&&KK.createElement(B,{paddingLeft:3},KK.createElement(T,{dimColor:!0},"and ",F," more…")),K[57]=F,K[58]=R6;else R6=K[58];let h6;if(K[59]!==f6||K[60]!==R6)h6=KK.createElement(B,{flexDirection:"column",marginBottom:1},f6,R6),K[59]=f6,K[60]=R6,K[61]=h6;else h6=K[61];',
        newSnippet:
          'let k6=$??p3Y,f6=KK.createElement(B,{flexDirection:"column"},p.length===0?KK.createElement(T,{dimColor:!0,italic:!0},"No models match \u201c",L7,"\u201d"):KK.createElement(J1,{defaultValue:X,defaultFocusValue:C,options:p,onChange:s,onFocus:J6,onCancel:k6,visibleOptionCount:g,searchable:!0,highlightText:L7,onSearchTextChange:b7}));let R6=F>0&&KK.createElement(B,{paddingLeft:3},KK.createElement(T,{dimColor:!0},"and ",F," more…"));let h6=KK.createElement(B,{flexDirection:"column",marginBottom:1},f6,R6);let n6=KK.createElement(B,{marginTop:1,width:"100%",minWidth:48,flexGrow:1},KK.createElement(mL,{query:L7,isFocused:!0,isTerminalFocused:!0,cursorOffset:L7.length,placeholder:"Search models..."+" ".repeat(48),width:"100%"}));',
      },
      {
        oldSnippet: MODEL_PICKER_2186_CALLSITE,
        newSnippet:
          'let E6=A??SYz,T6=zK.createElement(m,{flexDirection:"column"},p.length===0?zK.createElement(v,{dimColor:!0,italic:!0},"No models match \u201c",L7,"\u201d"):zK.createElement(J1,{defaultValue:X,defaultFocusValue:C,options:p,onChange:a,onFocus:J6,onCancel:E6,visibleOptionCount:F,highlightText:L7}));let R6=g>0&&zK.createElement(m,{paddingLeft:3},zK.createElement(v,{dimColor:!0},"and ",g," more…"));let y6=zK.createElement(m,{flexDirection:"column",marginBottom:1},T6,R6);let n6=zK.createElement(m,{marginTop:1,width:"100%",minWidth:48,flexGrow:1,borderStyle:"round",borderColor:"suggestion",paddingX:1,flexDirection:"row"},zK.createElement(v,{dimColor:!0},"\u2315 "),zK.createElement(m,{flexGrow:1},zK.createElement(x3,{value:L7,onChange:b7,onSubmit:()=>{if(C!==void 0)a(C)},onExit:E6,placeholder:"Search models..."+" ".repeat(48),focus:!0,showCursor:!0,multiline:!1,cursorOffset:L7.length,onChangeCursorOffset:()=>{},columns:Math.max(42,(process.stdout.columns||80)-10)})));',
      },
    ],
    'patch: modelSelectorSearch: failed to update model picker J1 callsite'
  );

  if (!nextFile) {
    return null;
  }

  nextFile = replaceAnyLiteralOnce(
    nextFile,
    [
      {
        oldSnippet:
          'let d6;if(K[69]!==H6||K[70]!==h6||K[71]!==S6||K[72]!==a6)d6=KK.createElement(B,{flexDirection:"column"},H6,h6,S6,a6),K[69]=H6,K[70]=h6,K[71]=S6,K[72]=a6,K[73]=d6;else d6=K[73];',
        newSnippet:
          'let d6=KK.createElement(B,{flexDirection:"column",width:"100%"},H6,h6,S6,a6,n6);',
      },
      {
        oldSnippet:
          'let K8;if(K[69]!==f6||K[70]!==y6||K[71]!==S6||K[72]!==s6)K8=zK.createElement(m,{flexDirection:"column"},f6,y6,S6,s6),K[69]=f6,K[70]=y6,K[71]=S6,K[72]=s6,K[73]=K8;else K8=K[73];',
        newSnippet:
          'let K8=zK.createElement(m,{flexDirection:"column",width:"100%"},f6,y6,S6,s6,n6);',
      },
    ],
    'patch: modelSelectorSearch: failed to add model picker search box'
  );

  return nextFile;
};

const addFuzzyFilteringToModelPicker = (file: string): string | null => {
  let nextFile = replaceAnyLiteralOnce(
    file,
    [
      {
        oldSnippet:
          'let p=I,u;if(K[14]!==X||K[15]!==p)u=p.some((Z6)=>Z6.value===X)?X:p[0]?.value??void 0,K[14]=X,K[15]=p,K[16]=u;else u=K[16];',
        newSnippet:
          'let p=L7.trim()?I.map((Z6)=>{let y6=L7.toLowerCase().trim(),c6=y6.replace(/[^a-z0-9]/g,""),g6=`${typeof Z6.label==="string"?Z6.label:""} ${Z6.value??""}`.toLowerCase(),F6=g6.replace(/[^a-z0-9]/g,""),B6=`${typeof Z6.label==="string"?Z6.label:""} ${Z6.description??""} ${Z6.value??""}`.toLowerCase().replace(/[^a-z0-9]/g,"");if(c6==="")return{option:Z6,score:3};let N6;if(F6===c6)N6=0;else if(F6.includes(c6))N6=1;else if(B6.includes(c6))N6=2;else{let e6=0;for(let t6 of c6){e6=B6.indexOf(t6,e6);if(e6===-1)return null;e6++;}N6=3}return{option:Z6,score:N6};}).filter((Z6)=>Z6!==null).sort((Z6,y6)=>Z6.score-y6.score).map((Z6)=>Z6.option):I,u=L7.trim()?p[0]?.value??void 0:p.some((Z6)=>Z6.value===X)?X:p[0]?.value??void 0;',
      },
      {
        oldSnippet:
          'let p=I,B;if(K[14]!==X||K[15]!==p)B=p.some((A6)=>A6.value===X)?X:p[0]?.value??void 0,K[14]=X,K[15]=p,K[16]=B;else B=K[16];',
        newSnippet:
          'let p=L7.trim()?I.map((A6)=>{let y6=L7.toLowerCase().trim(),c6=y6.replace(/[^a-z0-9]/g,""),g6=`${typeof A6.label==="string"?A6.label:""} ${A6.value??""}`.toLowerCase(),F6=g6.replace(/[^a-z0-9]/g,""),B6=`${typeof A6.label==="string"?A6.label:""} ${A6.description??""} ${A6.value??""}`.toLowerCase().replace(/[^a-z0-9]/g,"");if(c6==="")return{option:A6,score:3};let N6;if(F6===c6)N6=0;else if(F6.includes(c6))N6=1;else if(B6.includes(c6))N6=2;else{let e6=0;for(let t6 of c6){e6=B6.indexOf(t6,e6);if(e6===-1)return null;e6++;}N6=3}return{option:A6,score:N6};}).filter((A6)=>A6!==null).sort((A6,y6)=>A6.score-y6.score).map((A6)=>A6.option):I,B=L7.trim()?p[0]?.value??void 0:p.some((A6)=>A6.value===X)?X:p[0]?.value??void 0;',
      },
    ],
    'patch: modelSelectorSearch: failed to add fuzzy filtering'
  );

  if (!nextFile) {
    return null;
  }

  nextFile = replaceAnyLiteralOnce(
    nextFile,
    [
      {
        oldSnippet:
          'let C=u,g=Math.min(10,p.length),F=Math.max(0,p.length-g),Q;',
        newSnippet:
          'let C=u,g=Math.min(25,Math.max(1,p.length)),F=Math.max(0,p.length-g),Q;',
      },
      {
        oldSnippet:
          'let C=B,F=Math.min(10,p.length),g=Math.max(0,p.length-F),Q;',
        newSnippet:
          'let C=B,F=Math.min(25,Math.max(1,p.length)),g=Math.max(0,p.length-F),Q;',
      },
    ],
    'patch: modelSelectorSearch: failed to update filtered visible count'
  );

  return nextFile;
};

const threadSearchPropsThroughJ1 = (
  file: string,
  modelPicker2186: boolean
): string | null => {
  if (modelPicker2186) {
    return file;
  }

  let nextFile = replaceLiteralOnce(
    file,
    'onOpenEditor:G,onImagePaste:f,pastedContents:v,onRemoveImage:V}=q,N=_===void 0?!1:_,E=z===void 0?!1:z,S=Y===void 0?5:Y,R=X===void 0?"compact":X,x=M===void 0?!1:M,I=D===void 0?!1:D,[p,u]=dq.useState(!1),[C,g]=dq.useState(0),F;',
    'onOpenEditor:G,onImagePaste:f,pastedContents:v,onRemoveImage:V,searchable:L,onSearchTextChange:ee}=q,N=_===void 0?!1:_,E=z===void 0?!1:z,S=Y===void 0?5:Y,R=X===void 0?"compact":X,x=M===void 0?!1:M,I=D===void 0?!1:D,[p,u]=dq.useState(!1),[C,g]=dq.useState(0),F;',
    'patch: modelSelectorSearch: failed to thread search props through J1'
  );

  if (!nextFile) {
    return null;
  }

  nextFile = replaceLiteralOnce(
    nextFile,
    'let E6;if(K[17]!==p||K[18]!==Q||K[19]!==N||K[20]!==W||K[21]!==Z||K[22]!==P||K[23]!==A||K[24]!==_6||K[25]!==D6||K[26]!==J6)E6={isDisabled:N,disableSelection:D6,state:_6,options:A,isMultiSelect:!1,onUpFromFirstItem:P,onDownFromLastItem:W,onInputModeToggle:Z,inputValues:Q,imagesSelected:p,onEnterImageSelection:J6},K[17]=p,K[18]=Q,K[19]=N,K[20]=W,K[21]=Z,K[22]=P,K[23]=A,K[24]=_6,K[25]=D6,K[26]=J6,K[27]=E6;else E6=K[27];Qbq(E6);',
    'let E6={isDisabled:N,disableSelection:D6,state:_6,options:A,isMultiSelect:!1,onUpFromFirstItem:P,onDownFromLastItem:W,onInputModeToggle:Z,inputValues:Q,imagesSelected:p,onEnterImageSelection:J6,searchable:L,onSearchTextChange:ee};Qbq(E6);',
    'patch: modelSelectorSearch: failed to pass search props into Qbq'
  );

  return nextFile;
};

const addSearchHandlerToSingleSelect = (
  file: string,
  modelPicker2186: boolean
): string | null =>
  modelPicker2186
    ? file
    : replaceLiteralOnce(
        file,
        'var Pg1,Qbq=({isDisabled:q=!1,disableSelection:K=!1,state:_,options:z,isMultiSelect:Y=!1,onUpFromFirstItem:$,onDownFromLastItem:A,onInputModeToggle:O,inputValues:w,imagesSelected:j=!1,onEnterImageSelection:H})=>{XJ("select",!!_.onCancel);let J=Pg1.useMemo(()=>{return z.find((D)=>D.value===_.focusedValue)?.type==="input"},[z,_.focusedValue]),X=Pg1.useMemo(()=>{let M={};if(!J)M["select:next"]=()=>{if(A){let D=z[z.length-1];if(D&&_.focusedValue===D.value){A();return}}_.focusNextOption()},M["select:previous"]=()=>{if($&&_.visibleFromIndex===0){let D=z[0];if(D&&_.focusedValue===D.value){$();return}}_.focusPreviousOption()},M["select:accept"]=()=>{if(K===!0)return;if(_.focusedValue===void 0)return;if(z.find((P)=>P.value===_.focusedValue)?.disabled===!0)return;_.selectFocusedOption?.(),_.onChange?.(_.focusedValue)};if(_.onCancel)M["select:cancel"]=()=>{_.onCancel()};return M},[z,_,A,$,J,K]);c7(X,{context:"Select",isActive:!q}),Pq((M,D,P)=>{let W=rY6(M),Z=z.find((f)=>f.value===_.focusedValue),G=Z?.type==="input";if(D.tab&&O&&_.focusedValue!==void 0){O(_.focusedValue);return}if(G){if(j)return;if(D.downArrow&&H?.()){P.stopImmediatePropagation();return}if(D.downArrow||D.ctrl&&M==="n"){if(A){let f=z[z.length-1];if(f&&_.focusedValue===f.value){A(),P.stopImmediatePropagation();return}}_.focusNextOption(),P.stopImmediatePropagation();return}if(D.upArrow||D.ctrl&&M==="p"){if($&&_.visibleFromIndex===0){let f=z[0];if(f&&_.focusedValue===f.value){$(),P.stopImmediatePropagation();return}}_.focusPreviousOption(),P.stopImmediatePropagation();return}return}if(D.pageDown)_.focusNextPage();if(D.pageUp)_.focusPreviousPage();if(K!==!0){if(Y&&oY6(M)===" "&&_.focusedValue!==void 0){if(Z?.disabled!==!0)_.selectFocusedOption?.(),_.onChange?.(_.focusedValue)}if(K!=="numeric"&&/^[0-9]+$/.test(W)){let f=parseInt(W)-1;if(f>=0&&f<_.options.length){let v=_.options[f];if(v.disabled===!0)return;if(v.type==="input"){if((w?.get(v.value)??"").trim()){_.onChange?.(v.value);return}if(v.allowEmptySubmitToCancel){_.onChange?.(v.value);return}_.focusOption(v.value);return}_.onChange?.(v.value);return}}}},{isActive:!q})};',
        'var Pg1,Qbq=({isDisabled:q=!1,disableSelection:K=!1,state:_,options:z,isMultiSelect:Y=!1,onUpFromFirstItem:$,onDownFromLastItem:A,onInputModeToggle:O,inputValues:w,imagesSelected:j=!1,onEnterImageSelection:H,searchable:J6=!1,onSearchTextChange:Q6})=>{XJ("select",!!_.onCancel);let L6=Pg1.useRef(""),J=Pg1.useMemo(()=>{return z.find((D)=>D.value===_.focusedValue)?.type==="input"},[z,_.focusedValue]),X=Pg1.useMemo(()=>{let M={};if(!J)M["select:next"]=()=>{if(A){let D=z[z.length-1];if(D&&_.focusedValue===D.value){A();return}}_.focusNextOption()},M["select:previous"]=()=>{if($&&_.visibleFromIndex===0){let D=z[0];if(D&&_.focusedValue===D.value){$();return}}_.focusPreviousOption()},M["select:accept"]=()=>{if(K===!0)return;if(_.focusedValue===void 0)return;if(z.find((P)=>P.value===_.focusedValue)?.disabled===!0)return;_.selectFocusedOption?.(),_.onChange?.(_.focusedValue)};if(_.onCancel)M["select:cancel"]=()=>{_.onCancel()};return M},[z,_,A,$,J,K]);c7(X,{context:"Select",isActive:!q}),Pq((M,D,P)=>{let W=rY6(M),Z=z.find((f)=>f.value===_.focusedValue),G=Z?.type==="input";if(D.tab&&O&&_.focusedValue!==void 0){O(_.focusedValue);return}if(G){if(j)return;if(D.downArrow&&H?.()){P.stopImmediatePropagation();return}if(D.downArrow||D.ctrl&&M==="n"){if(A){let f=z[z.length-1];if(f&&_.focusedValue===f.value){A(),P.stopImmediatePropagation();return}}_.focusNextOption(),P.stopImmediatePropagation();return}if(D.upArrow||D.ctrl&&M==="p"){if($&&_.visibleFromIndex===0){let f=z[0];if(f&&_.focusedValue===f.value){$(),P.stopImmediatePropagation();return}}_.focusPreviousOption(),P.stopImmediatePropagation();return}return}if(J6&&!D.ctrl&&!D.meta&&!D.alt&&!D.tab&&!D.return&&!D.escape&&!D.upArrow&&!D.downArrow&&!D.pageDown&&!D.pageUp){let f;if(D.backspace)f=L6.current.slice(0,-1);else{let v=oY6(M);if(typeof v==="string"&&/^[\\w .\\-\\[\\]]$/i.test(v))f=(L6.current+v).toLowerCase()}if(f!==void 0){L6.current=f,Q6?.(f);if(f){let v=z.find(B6=>B6.type!=="input"&&B6.disabled!==!0&&`${typeof B6.label==="string"?B6.label:""} ${B6.description??""} ${B6.value??""}`.toLowerCase().includes(f));if(v){_.focusOption(v.value)}}P.stopImmediatePropagation();return}}if(D.pageDown)_.focusNextPage();if(D.pageUp)_.focusPreviousPage();if(K!==!0){if(Y&&oY6(M)===" "&&_.focusedValue!==void 0){if(Z?.disabled!==!0)_.selectFocusedOption?.(),_.onChange?.(_.focusedValue)}if(K!=="numeric"&&/^[0-9]+$/.test(W)){let f=parseInt(W)-1;if(f>=0&&f<_.options.length){let v=_.options[f];if(v.disabled===!0)return;if(v.type==="input"){if((w?.get(v.value)??"").trim()){_.onChange?.(v.value);return}if(v.allowEmptySubmitToCancel){_.onChange?.(v.value);return}_.focusOption(v.value);return}_.onChange?.(v.value);return}}}},{isActive:!q})};',
        'patch: modelSelectorSearch: failed to add searchable handler to Qbq'
      );

export const writeModelSelectorSearch = (oldFile: string): string | null => {
  const modelPicker2186 = isModelPicker2186(oldFile);

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

  newFile = threadSearchPropsThroughJ1(newFile, modelPicker2186);
  if (!newFile) {
    return null;
  }

  newFile = addSearchHandlerToSingleSelect(newFile, modelPicker2186);
  if (!newFile) {
    return null;
  }

  return newFile;
};
