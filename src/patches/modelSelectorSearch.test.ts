import { describe, expect, it, vi } from 'vitest';

import { writeModelSelectorSearch } from './modelSelectorSearch';

describe('writeModelSelectorSearch', () => {
  it('supports the Claude Code 2.1.86 model picker shape', () => {
    const file =
      '[M,D]=SB8.useState(X),P=M8(IYz),[W,Z]=SB8.useState(!1),f=M8(bYz),G;if(K[0]!==f)G=f!==void 0?n26(f):void 0,K[0]=f,K[1]=G;else G=K[1];let[T,V]=SB8.useState(G),N=P??!1,L;' +
      'let p=I,B;if(K[14]!==X||K[15]!==p)B=p.some((A6)=>A6.value===X)?X:p[0]?.value??void 0,K[14]=X,K[15]=p,K[16]=B;else B=K[16];' +
      'let C=B,F=Math.min(10,p.length),g=Math.max(0,p.length-F),Q;' +
      'let E6=A??SYz,T6;if(K[49]!==J6||K[50]!==a||K[51]!==C||K[52]!==X||K[53]!==p||K[54]!==E6||K[55]!==F)T6=zK.createElement(m,{flexDirection:"column"},zK.createElement(J1,{defaultValue:X,defaultFocusValue:C,options:p,onChange:a,onFocus:J6,onCancel:E6,visibleOptionCount:F})),K[49]=J6,K[50]=a,K[51]=C,K[52]=X,K[53]=p,K[54]=E6,K[55]=F,K[56]=T6;else T6=K[56];let R6;if(K[57]!==g)R6=g>0&&zK.createElement(m,{paddingLeft:3},zK.createElement(v,{dimColor:!0},"and ",g," more…")),K[57]=g,K[58]=R6;else R6=K[58];let y6;if(K[59]!==T6||K[60]!==R6)y6=zK.createElement(m,{flexDirection:"column",marginBottom:1},T6,R6),K[59]=T6,K[60]=R6,K[61]=y6;else y6=K[61];' +
      'let K8;if(K[69]!==f6||K[70]!==y6||K[71]!==S6||K[72]!==s6)K8=zK.createElement(m,{flexDirection:"column"},f6,y6,S6,s6),K[69]=f6,K[70]=y6,K[71]=S6,K[72]=s6,K[73]=K8;else K8=K[73];';

    const result = writeModelSelectorSearch(file);

    expect(result).not.toBeNull();
    expect(result).toContain('[L7,b7]=SB8.useState("")');
    expect(result).toContain('let p=L7.trim()?I.map((A6)=>{');
    expect(result).toContain('highlightText:L7');
    expect(result).toContain('replace(/[^a-z0-9]/g,"")');
    expect(result).toContain('Math.min(25,Math.max(1,p.length))');
    expect(result).toContain(
      'let n6=zK.createElement(m,{marginTop:1,width:"100%",minWidth:48,flexGrow:1,borderStyle:"round",borderColor:"suggestion",paddingX:1,flexDirection:"row"}'
    );
    expect(result).toContain('zK.createElement(v,{dimColor:!0},"⌕ ")');
    expect(result).toContain(
      'createElement(x3,{value:L7,onChange:b7,onSubmit:()=>{if(C!==void 0)a(C)},onExit:E6,placeholder:"Search models..."+" ".repeat(48)'
    );
    expect(result).toContain(
      'onChangeCursorOffset:()=>{},columns:Math.max(42,(process.stdout.columns||80)-10)}'
    );
    expect(result).toContain(
      'let K8=zK.createElement(m,{flexDirection:"column",width:"100%"},f6,y6,S6,s6,n6);'
    );
    expect(result).not.toContain('searchable:!0');
    expect(result).not.toContain('onSearchTextChange:b7');
  });

  it('supports the Claude Code 2.1.87 model picker shape', () => {
    const file =
      '[M,D]=SB8.useState(X),P=M8(bYz),[W,Z]=SB8.useState(!1),f=M8(CYz),G;if(K[0]!==f)G=f!==void 0?n26(f):void 0,K[0]=f,K[1]=G;else G=K[1];let[T,V]=SB8.useState(G),N=P??!1,L;' +
      'let p=I,B;if(K[14]!==X||K[15]!==p)B=p.some((A6)=>A6.value===X)?X:p[0]?.value??void 0,K[14]=X,K[15]=p,K[16]=B;else B=K[16];' +
      'let C=B,F=Math.min(10,p.length),g=Math.max(0,p.length-F),Q;' +
      'let E6=A??hYz,T6;if(K[49]!==J6||K[50]!==a||K[51]!==C||K[52]!==X||K[53]!==p||K[54]!==E6||K[55]!==F)T6=zK.createElement(m,{flexDirection:"column"},zK.createElement(J1,{defaultValue:X,defaultFocusValue:C,options:p,onChange:a,onFocus:J6,onCancel:E6,visibleOptionCount:F})),K[49]=J6,K[50]=a,K[51]=C,K[52]=X,K[53]=p,K[54]=E6,K[55]=F,K[56]=T6;else T6=K[56];let R6;if(K[57]!==g)R6=g>0&&zK.createElement(m,{paddingLeft:3},zK.createElement(v,{dimColor:!0},"and ",g," more…")),K[57]=g,K[58]=R6;else R6=K[58];let y6;if(K[59]!==T6||K[60]!==R6)y6=zK.createElement(m,{flexDirection:"column",marginBottom:1},T6,R6),K[59]=T6,K[60]=R6,K[61]=y6;else y6=K[61];' +
      'let K8;if(K[69]!==f6||K[70]!==y6||K[71]!==S6||K[72]!==s6)K8=zK.createElement(m,{flexDirection:"column"},f6,y6,S6,s6),K[69]=f6,K[70]=y6,K[71]=S6,K[72]=s6,K[73]=K8;else K8=K[73];';

    const result = writeModelSelectorSearch(file);

    expect(result).not.toBeNull();
    expect(result).toContain('[L7,b7]=SB8.useState("")');
    expect(result).toContain(
      '[W,Z]=SB8.useState(!1),[L7,b7]=SB8.useState(""),f=M8(CYz),G;if('
    );
    expect(result).toContain('let p=L7.trim()?I.map((A6)=>{');
    expect(result).toContain('highlightText:L7');
    expect(result).toContain(
      'let E6=A??hYz,T6=zK.createElement(m,{flexDirection:"column"},p.length===0?zK.createElement(v,{dimColor:!0,italic:!0},"No models match'
    );
    expect(result).toContain(
      'let n6=zK.createElement(m,{marginTop:1,width:"100%",minWidth:48,flexGrow:1,borderStyle:"round",borderColor:"suggestion",paddingX:1,flexDirection:"row"}'
    );
    expect(result).toContain('zK.createElement(v,{dimColor:!0},"⌕ ")');
    expect(result).toContain(
      'onChangeCursorOffset:()=>{},columns:Math.max(42,(process.stdout.columns||80)-10)}'
    );
    expect(result).toContain(
      'let K8=zK.createElement(m,{flexDirection:"column",width:"100%"},f6,y6,S6,s6,n6);'
    );
  });

  it('returns null for the older pre-2.1.86 model picker shape', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const file =
      '[W,Z]=HB8.useState(!1),G=M8(F3Y),f;' +
      'let p=I,u;if(K[14]!==X||K[15]!==p)u=p.some((Z6)=>Z6.value===X)?X:p[0]?.value??void 0,K[14]=X,K[15]=p,K[16]=u;else u=K[16];' +
      'let C=u,g=Math.min(10,p.length),F=Math.max(0,p.length-g),Q;' +
      'let k6=$??p3Y,f6;if(K[49]!==J6||K[50]!==s||K[51]!==C||K[52]!==X||K[53]!==p||K[54]!==k6||K[55]!==g)f6=KK.createElement(B,{flexDirection:"column"},KK.createElement(J1,{defaultValue:X,defaultFocusValue:C,options:p,onChange:s,onFocus:J6,onCancel:k6,visibleOptionCount:g})),K[49]=J6,K[50]=s,K[51]=C,K[52]=X,K[53]=p,K[54]=k6,K[55]=g,K[56]=f6;else f6=K[56];';

    try {
      expect(writeModelSelectorSearch(file)).toBeNull();
      expect(consoleError).toHaveBeenCalledWith(
        'patch: modelSelectorSearch: only supported on Claude Code 2.1.86 or 2.1.87'
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('returns null when the model picker callsite is missing', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      expect(writeModelSelectorSearch('const nope=1;')).toBeNull();
      expect(consoleError).toHaveBeenCalledWith(
        'patch: modelSelectorSearch: only supported on Claude Code 2.1.86 or 2.1.87'
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
