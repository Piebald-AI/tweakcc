// Please see the note about writing patches in ./index

import { showDiff } from './index';

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

const addSearchStateToModelPicker = (file: string): string | null =>
  replaceLiteralOnce(
    file,
    '[W,Z]=HB8.useState(!1),G=M8(F3Y),f;',
    '[W,Z]=HB8.useState(!1),[L7,b7]=HB8.useState(""),G=M8(F3Y),f;',
    'patch: modelSelectorSearch: failed to add model picker search state'
  );

const addSearchUiToModelPicker = (file: string): string | null => {
  let nextFile = replaceLiteralOnce(
    file,
    'let k6=$??p3Y,f6;if(K[49]!==J6||K[50]!==s||K[51]!==C||K[52]!==X||K[53]!==p||K[54]!==k6||K[55]!==g)f6=KK.createElement(B,{flexDirection:"column"},KK.createElement(J1,{defaultValue:X,defaultFocusValue:C,options:p,onChange:s,onFocus:J6,onCancel:k6,visibleOptionCount:g})),K[49]=J6,K[50]=s,K[51]=C,K[52]=X,K[53]=p,K[54]=k6,K[55]=g,K[56]=f6;else f6=K[56];let R6;if(K[57]!==F)R6=F>0&&KK.createElement(B,{paddingLeft:3},KK.createElement(T,{dimColor:!0},"and ",F," more…")),K[57]=F,K[58]=R6;else R6=K[58];let h6;if(K[59]!==f6||K[60]!==R6)h6=KK.createElement(B,{flexDirection:"column",marginBottom:1},f6,R6),K[59]=f6,K[60]=R6,K[61]=h6;else h6=K[61];',
    'let k6=$??p3Y,f6=KK.createElement(B,{flexDirection:"column"},p.length===0?KK.createElement(T,{dimColor:!0,italic:!0},"No models match \u201c",L7,"\u201d"):KK.createElement(J1,{defaultValue:X,defaultFocusValue:C,options:p,onChange:s,onFocus:J6,onCancel:k6,visibleOptionCount:g,searchable:!0,highlightText:L7,onSearchTextChange:b7}));let R6=F>0&&KK.createElement(B,{paddingLeft:3},KK.createElement(T,{dimColor:!0},"and ",F," more…"));let h6=KK.createElement(B,{flexDirection:"column",marginBottom:1},f6,R6);let n6=KK.createElement(B,{marginTop:1,width:"100%",minWidth:48,flexGrow:1},KK.createElement(mL,{query:L7,isFocused:!0,isTerminalFocused:!0,cursorOffset:L7.length,placeholder:"Search models..."+" ".repeat(48)}));',
    'patch: modelSelectorSearch: failed to update model picker J1 callsite'
  );

  if (!nextFile) {
    return null;
  }

  nextFile = replaceLiteralOnce(
    nextFile,
    'let d6;if(K[69]!==H6||K[70]!==h6||K[71]!==S6||K[72]!==a6)d6=KK.createElement(B,{flexDirection:"column"},H6,h6,S6,a6),K[69]=H6,K[70]=h6,K[71]=S6,K[72]=a6,K[73]=d6;else d6=K[73];',
    'let d6=KK.createElement(B,{flexDirection:"column",width:"100%"},H6,h6,S6,a6,n6);',
    'patch: modelSelectorSearch: failed to add model picker search box'
  );

  return nextFile;
};

const addFuzzyFilteringToModelPicker = (file: string): string | null => {
  let nextFile = replaceLiteralOnce(
    file,
    'let p=I,u;if(K[14]!==X||K[15]!==p)u=p.some((Z6)=>Z6.value===X)?X:p[0]?.value??void 0,K[14]=X,K[15]=p,K[16]=u;else u=K[16];',
    'let p=L7.trim()?I.map((Z6)=>{let y6=L7.toLowerCase().trim(),c6=y6.replace(/[^a-z0-9]/g,""),g6=`${typeof Z6.label==="string"?Z6.label:""} ${Z6.value??""}`.toLowerCase(),F6=g6.replace(/[^a-z0-9]/g,""),B6=`${typeof Z6.label==="string"?Z6.label:""} ${Z6.description??""} ${Z6.value??""}`.toLowerCase().replace(/[^a-z0-9]/g,"");if(c6==="")return{option:Z6,score:3};let N6;if(F6===c6)N6=0;else if(F6.includes(c6))N6=1;else if(B6.includes(c6))N6=2;else{let e6=0;for(let t6 of c6){e6=B6.indexOf(t6,e6);if(e6===-1)return null;e6++;}N6=3}return{option:Z6,score:N6};}).filter((Z6)=>Z6!==null).sort((Z6,y6)=>Z6.score-y6.score).map((Z6)=>Z6.option):I,u=L7.trim()?p[0]?.value??void 0:p.some((Z6)=>Z6.value===X)?X:p[0]?.value??void 0;',
    'patch: modelSelectorSearch: failed to add fuzzy filtering'
  );

  if (!nextFile) {
    return null;
  }

  nextFile = replaceLiteralOnce(
    nextFile,
    'let C=u,g=Math.min(10,p.length),F=Math.max(0,p.length-g),Q;',
    'let C=u,g=Math.min(25,Math.max(1,p.length)),F=Math.max(0,p.length-g),Q;',
    'patch: modelSelectorSearch: failed to update filtered visible count'
  );

  return nextFile;
};

const threadSearchPropsThroughJ1 = (file: string): string | null => {
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

const addSearchHandlerToSingleSelect = (file: string): string | null =>
  replaceLiteralOnce(
    file,
    'var Pg1,Qbq=({isDisabled:q=!1,disableSelection:K=!1,state:_,options:z,isMultiSelect:Y=!1,onUpFromFirstItem:$,onDownFromLastItem:A,onInputModeToggle:O,inputValues:w,imagesSelected:j=!1,onEnterImageSelection:H})=>{XJ("select",!!_.onCancel);let J=Pg1.useMemo(()=>{return z.find((D)=>D.value===_.focusedValue)?.type==="input"},[z,_.focusedValue]),X=Pg1.useMemo(()=>{let M={};if(!J)M["select:next"]=()=>{if(A){let D=z[z.length-1];if(D&&_.focusedValue===D.value){A();return}}_.focusNextOption()},M["select:previous"]=()=>{if($&&_.visibleFromIndex===0){let D=z[0];if(D&&_.focusedValue===D.value){$();return}}_.focusPreviousOption()},M["select:accept"]=()=>{if(K===!0)return;if(_.focusedValue===void 0)return;if(z.find((P)=>P.value===_.focusedValue)?.disabled===!0)return;_.selectFocusedOption?.(),_.onChange?.(_.focusedValue)};if(_.onCancel)M["select:cancel"]=()=>{_.onCancel()};return M},[z,_,A,$,J,K]);c7(X,{context:"Select",isActive:!q}),Pq((M,D,P)=>{let W=rY6(M),Z=z.find((f)=>f.value===_.focusedValue),G=Z?.type==="input";if(D.tab&&O&&_.focusedValue!==void 0){O(_.focusedValue);return}if(G){if(j)return;if(D.downArrow&&H?.()){P.stopImmediatePropagation();return}if(D.downArrow||D.ctrl&&M==="n"){if(A){let f=z[z.length-1];if(f&&_.focusedValue===f.value){A(),P.stopImmediatePropagation();return}}_.focusNextOption(),P.stopImmediatePropagation();return}if(D.upArrow||D.ctrl&&M==="p"){if($&&_.visibleFromIndex===0){let f=z[0];if(f&&_.focusedValue===f.value){$(),P.stopImmediatePropagation();return}}_.focusPreviousOption(),P.stopImmediatePropagation();return}return}if(D.pageDown)_.focusNextPage();if(D.pageUp)_.focusPreviousPage();if(K!==!0){if(Y&&oY6(M)===" "&&_.focusedValue!==void 0){if(Z?.disabled!==!0)_.selectFocusedOption?.(),_.onChange?.(_.focusedValue)}if(K!=="numeric"&&/^[0-9]+$/.test(W)){let f=parseInt(W)-1;if(f>=0&&f<_.options.length){let v=_.options[f];if(v.disabled===!0)return;if(v.type==="input"){if((w?.get(v.value)??"").trim()){_.onChange?.(v.value);return}if(v.allowEmptySubmitToCancel){_.onChange?.(v.value);return}_.focusOption(v.value);return}_.onChange?.(v.value);return}}}},{isActive:!q})};',
    'var Pg1,Qbq=({isDisabled:q=!1,disableSelection:K=!1,state:_,options:z,isMultiSelect:Y=!1,onUpFromFirstItem:$,onDownFromLastItem:A,onInputModeToggle:O,inputValues:w,imagesSelected:j=!1,onEnterImageSelection:H,searchable:J6=!1,onSearchTextChange:Q6})=>{XJ("select",!!_.onCancel);let L6=Pg1.useRef(""),J=Pg1.useMemo(()=>{return z.find((D)=>D.value===_.focusedValue)?.type==="input"},[z,_.focusedValue]),X=Pg1.useMemo(()=>{let M={};if(!J)M["select:next"]=()=>{if(A){let D=z[z.length-1];if(D&&_.focusedValue===D.value){A();return}}_.focusNextOption()},M["select:previous"]=()=>{if($&&_.visibleFromIndex===0){let D=z[0];if(D&&_.focusedValue===D.value){$();return}}_.focusPreviousOption()},M["select:accept"]=()=>{if(K===!0)return;if(_.focusedValue===void 0)return;if(z.find((P)=>P.value===_.focusedValue)?.disabled===!0)return;_.selectFocusedOption?.(),_.onChange?.(_.focusedValue)};if(_.onCancel)M["select:cancel"]=()=>{_.onCancel()};return M},[z,_,A,$,J,K]);c7(X,{context:"Select",isActive:!q}),Pq((M,D,P)=>{let W=rY6(M),Z=z.find((f)=>f.value===_.focusedValue),G=Z?.type==="input";if(D.tab&&O&&_.focusedValue!==void 0){O(_.focusedValue);return}if(G){if(j)return;if(D.downArrow&&H?.()){P.stopImmediatePropagation();return}if(D.downArrow||D.ctrl&&M==="n"){if(A){let f=z[z.length-1];if(f&&_.focusedValue===f.value){A(),P.stopImmediatePropagation();return}}_.focusNextOption(),P.stopImmediatePropagation();return}if(D.upArrow||D.ctrl&&M==="p"){if($&&_.visibleFromIndex===0){let f=z[0];if(f&&_.focusedValue===f.value){$(),P.stopImmediatePropagation();return}}_.focusPreviousOption(),P.stopImmediatePropagation();return}return}if(J6&&!D.ctrl&&!D.meta&&!D.alt&&!D.tab&&!D.return&&!D.escape&&!D.upArrow&&!D.downArrow&&!D.pageDown&&!D.pageUp){let f;if(D.backspace)f=L6.current.slice(0,-1);else{let v=oY6(M);if(typeof v==="string"&&/^[\\w .\\-\\[\\]]$/i.test(v))f=(L6.current+v).toLowerCase()}if(f!==void 0){L6.current=f,Q6?.(f);if(f){let v=z.find(B6=>B6.type!=="input"&&B6.disabled!==!0&&`${typeof B6.label==="string"?B6.label:""} ${B6.description??""} ${B6.value??""}`.toLowerCase().includes(f));if(v){_.focusOption(v.value)}}P.stopImmediatePropagation();return}}if(D.pageDown)_.focusNextPage();if(D.pageUp)_.focusPreviousPage();if(K!==!0){if(Y&&oY6(M)===" "&&_.focusedValue!==void 0){if(Z?.disabled!==!0)_.selectFocusedOption?.(),_.onChange?.(_.focusedValue)}if(K!=="numeric"&&/^[0-9]+$/.test(W)){let f=parseInt(W)-1;if(f>=0&&f<_.options.length){let v=_.options[f];if(v.disabled===!0)return;if(v.type==="input"){if((w?.get(v.value)??"").trim()){_.onChange?.(v.value);return}if(v.allowEmptySubmitToCancel){_.onChange?.(v.value);return}_.focusOption(v.value);return}_.onChange?.(v.value);return}}}},{isActive:!q})};',
    'patch: modelSelectorSearch: failed to add searchable handler to Qbq'
  );

export const writeModelSelectorSearch = (oldFile: string): string | null => {
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

  newFile = threadSearchPropsThroughJ1(newFile);
  if (!newFile) {
    return null;
  }

  newFile = addSearchHandlerToSingleSelect(newFile);
  if (!newFile) {
    return null;
  }

  return newFile;
};
