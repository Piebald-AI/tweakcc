import { describe, expect, it, vi } from 'vitest';

import { writeSkipSkillShellValidation } from './skipSkillShellValidation';

// Real CC 2.1.295 excerpts from chunk-53bsrq2x.js.
const PLUGIN_CALLER =
  'Nt??Vh(ko.permissionLayers))),Sne())sn=RL(sn);else sn=await whe(sn,{...ko,getAppState:DM(ko,to())},`/${e}`,en);return[{t';
const SKILL_CALLER =
  '${CLAUDE_EFFORT}",$A(ibe(_e)??Mn.options.mainLoopModel,qh(Mn),nt??Vh(Mn.permissionLayers))),lTr(Me,Te)&&Sne())to=RL(to);else if(dTr(Me))to=await whe(to,{...Mn,getAppState:DM(Mn,nn())},`/${e}`,ct);return[{type:"text",text:to}]}};return so}as';
const EXPAND_FN =
  'async function whe(e,n,r,s){if(n.options.readOnlySkillLoad)return RL(e,qPe);let h=e;if(s==="bash"&&!Cl())throw Error(`Skill ${r} requires bash (\\`shell: bash\\` in frontmatter) but Git Bash was not found. Install Git for Windows (https://git-scm.com/downloads/win), or change the skill\'s frontmatter to \\`shell: powershell\\`.`);let y=s==="powershell"&&US()?_un():Cl()?vi:_un(),S=n.toolUseId??`${yun()}${jtt}`,w=pun(),H=un(n.options.tools,y.name)!==void 0,G=w&&de(n).mode==="auto"&&H?n.promptShellHandOff:void 0,V=w&&(G!==void 0||!0);if(de(n).servedCall===!0&&de(n).mode==="auto"&&G===void 0)return RL(e,qPe);let Y=H?n.options:{...n.options,tools:[...n.options.tools,y]},he=[];if(await Promise.all(tTr(e,y,r).map(async({raw:_e,command:ke,at:be},Te)=>{let Re={...n,innerCall:!0,toolUseId:`${S}${Plr}${Te}`,promptShellHandOff:void 0};try{let Ce={...n,options:Y,forPromptShellCommand:V,promptShellHandOff:void 0},Me=await Fu(y,{command:ke},Ce,Ec({content:[]}),""),Fe=Me.behavior==="ask"||Me.behavior==="deny"&&Me.decisionReason?.type==="asyncAgent",Ge=!1,Je=G!==void 0&&(Fe||Ge);if(i("tengu_prompt_shell_permission",{behavior:d(Me.behavior),mode:d(de(n).mode),evaluatedAs:d(de(Ce).mode),decisionReasonType:ue(Me.decisionReason?.type),handedToModel:Je,handedOffOnAllow:Ge}),Je){let ct={command:ke.trim(),tool:y.name};he.push({index:Te,at:be,entry:ct}),h=h.replace(_e,()=>f3e(Te));return}if(Me.behavior!=="allow"){if(t(`Shell command permission check failed for command in ${r}: ${ke}. Error: ${Me.message}`),co(Re.session))throw t(`prompt shell permission denial: ${Me.message||"Permission denied"}`,{level:"error"}),new OO(`Shell command permission check failed for pattern "${_e}" (detail withheld on this connection)`);throw new OO(`Shell command permission check failed for pattern "${_e}": ${Me.message||"Permission denied"}`)}let{data:tt}=await y.call({command:ke},Re),dt=await dqe(y,tt,yun(),rh(Re.session),Re.storageV5),nt=typeof dt.content==="string"?dt.content:kun(tt.stdout,tt.stderr);h=h.replace(_e,()=>nt)}';

const CHUNK = PLUGIN_CALLER + ';' + SKILL_CALLER + ';' + EXPAND_FN;

describe('writeSkipSkillShellValidation', () => {
  it('marks only the own-skill call and lets "ask" through for it', () => {
    const result = writeSkipSkillShellValidation(CHUNK);

    expect(result).not.toBeNull();
    expect(result).toContain(
      'else if(dTr(Me))to=await whe(to,{tweakccOwnSkill:!0,...Mn,getAppState:DM(Mn,nn())}'
    );
    expect(result).toContain(
      'else sn=await whe(sn,{...ko,getAppState:DM(ko,to())}'
    );
    expect(result).toContain(
      'if(Me.behavior!=="allow"&&!(n.tweakccOwnSkill&&Me.behavior==="ask")){if(t(`Shell command permission check failed'
    );
  });

  it('returns null for modules without the prompt-shell check', () => {
    expect(writeSkipSkillShellValidation(PLUGIN_CALLER)).toBeNull();
  });

  it('fails when the own-skill call is missing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(writeSkipSkillShellValidation(PLUGIN_CALLER + EXPAND_FN)).toBeNull();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
