// Please see the note about writing patches in ./index
//
// /plan exit — open the ExitPlanMode approval dialog without asking the model
// (https://github.com/Piebald-AI/tweakcc/issues/777).
//
// Reaching the plan-approval dialog (and its "Yes, clear context" option)
// normally takes a model turn that calls the ExitPlanMode tool. This patch
// teaches the `/plan` command an `exit` argument that renders that same dialog
// directly. The dialog applies its own choice the way it does for the tool:
// "clear context" options queue the "Implement the following plan" message
// themselves; for the keep-context options this patch queues it, switching to
// the chosen mode; "Tell Claude what to change" sends the feedback while
// staying in plan mode.
//
// ```diff
//  async function se(i,o,f){let{getAppState:y,setAppState:E}=o,h=y().toolPermissionContext.mode,d=h!=="plan";
// +if(f.trim()==="exit"){if(d)return i("Not in plan mode."),null;…return e(PlanApproval,{payload,answer,wouldTakeAnswer})}
//  if(d)vpe(h,"plan"),…
// ```
//
// In code-split builds the dialog component lives in the REPL chunk and is not
// exported, so it is reached through the cross-module bridge.

import {
  graphMemo,
  graphSources,
  isGraphContextActive,
  requestImport,
} from './graphContext';
import { showDiff } from './index';

/** The ExitPlanMode dialog: function Bot({payload:h,answer:A,wouldTakeAnswer:L}){…showClearContextOnPlanAccept */
const DIALOG_PATTERN =
  /function ([$\w]+)\(\{payload:[$\w]+,answer:[$\w]+,wouldTakeAnswer:[$\w]+\}\)\{[^]{0,800}?\.showClearContextOnPlanAccept\)/;

/** Start of the /plan handler, up to "already in plan mode?". */
const HANDLER_PATTERN =
  /async function [$\w]+\(([$\w]+),([$\w]+),([$\w]+)\)\{let\{getAppState:[$\w]+,setAppState:([$\w]+)\}=\2,([$\w]+)=[$\w]+\(\)\.toolPermissionContext\.mode,([$\w]+)=\5!=="plan";/;

/** Plan path and contents: let c=gv();Wh(c);let C=await YKe(void 0,o.storageV5); */
const PLAN_PATTERN =
  /let ([$\w]+)=([$\w]+)\(\);[$\w]+\(\1\);let ([$\w]+)=await ([$\w]+)\(void 0,[$\w]+\.storageV5\);/;

/** createUserMessage: xe({content:l,origin:{kind:"human"}}) */
const USER_MESSAGE_PATTERN =
  /([$\w]+)\(\{content:[$\w]+,origin:\{kind:"human"\}\}\)/;

/** JSX factory: e(b,{planContent:… */
const JSX_PATTERN = /([$\w]+)\([$\w]+,\{planContent:/;

const PATCHED_MARKER = '.trim()==="exit"){if(';

const ARGUMENT_HINT =
  'name:"plan",description:"Enable plan mode or view the current session plan",argumentHint:"[open|';

const dialogReference = (file: string): string | null => {
  const local = file.match(DIALOG_PATTERN)?.[1];
  if (local) return local;
  if (!isGraphContextActive()) return null;
  const owner = graphMemo('plan-exit-dialog', () => {
    for (const [module, source] of graphSources() ?? []) {
      const found = source.match(DIALOG_PATTERN)?.[1];
      if (found) return { module, local: found };
    }
    return null;
  });
  // Not exported: the owner publishes its local name on the bridge.
  return owner ? requestImport(owner.local, owner.module) : null;
};

const patchHandler = (file: string): string | null => {
  if (file.includes(PATCHED_MARKER)) return file;
  const handler = file.match(HANDLER_PATTERN);
  const plan = file.match(PLAN_PATTERN);
  const userMessage = file.match(USER_MESSAGE_PATTERN)?.[1];
  const jsx = file.match(JSX_PATTERN)?.[1];
  if (
    !handler ||
    handler.index === undefined ||
    !plan ||
    !userMessage ||
    !jsx
  ) {
    console.error('patch: planExitCommand: failed to find the /plan handler');
    return null;
  }
  const dialog = dialogReference(file);
  if (!dialog) {
    console.error(
      'patch: planExitCommand: failed to find the plan approval dialog'
    );
    return null;
  }

  const [, done, ctx, args, setAppState, , notPlan] = handler;
  const [, , planPath, , readPlan] = plan;
  const insertion =
    `if(${args}.trim()==="exit"){` +
    `if(${notPlan})return ${done}("Not in plan mode."),null;` +
    `let tccPath=${planPath}(),tccPlan=await ${readPlan}(void 0,${ctx}.storageV5);` +
    `if(!tccPlan)return ${done}("No plan written yet. Use shift+tab to leave plan mode."),null;` +
    `return ${jsx}(${dialog},{` +
    `payload:{plan:tccPlan,planFilePath:tccPath,usage:${ctx}.messages?.findLast((tccMsg)=>tccMsg.type==="assistant"&&tccMsg.message?.usage)?.message.usage},` +
    `wouldTakeAnswer:()=>!0,` +
    `answer:(tccAnswer)=>{` +
    // "Yes, clear context" options queue their own message and return deny.
    `if(tccAnswer.behavior==="allow"){let tccMode=tccAnswer.permissionUpdates?.find((tccUpdate)=>tccUpdate.type==="setMode")?.mode;` +
    `${setAppState}((tccState)=>({...tccState,initialMessage:{message:${userMessage}({content:"Implement the following plan:\\n\\n"+(tccAnswer.updatedInput?.plan??tccPlan),origin:{kind:"auto-continuation"}}),...tccMode&&{mode:tccMode}}}))}` +
    `else if(tccAnswer.feedback)${setAppState}((tccState)=>({...tccState,initialMessage:{message:${userMessage}({content:tccAnswer.feedback,origin:{kind:"human"}})}}));` +
    `${done}(void 0,{display:"skip"});return!0}})}`;

  const insertIndex = handler.index + handler[0].length;
  const newFile =
    file.slice(0, insertIndex) + insertion + file.slice(insertIndex);
  showDiff(file, newFile, insertion, insertIndex, insertIndex);
  return newFile;
};

/** Advertise the new argument: argumentHint:"[open|<description>]" */
const patchArgumentHint = (file: string): string | null => {
  const index = file.indexOf(ARGUMENT_HINT);
  if (index === -1) return null;
  const insertIndex = index + ARGUMENT_HINT.length;
  if (file.startsWith('exit|', insertIndex)) return file;
  const newFile =
    file.slice(0, insertIndex) + 'exit|' + file.slice(insertIndex);
  showDiff(file, newFile, 'exit|', insertIndex, insertIndex);
  return newFile;
};

export const writePlanExitCommand = (oldFile: string): string | null => {
  if (isGraphContextActive()) {
    // The handler, the dialog and the command definition are separate
    // modules; patch whichever this module holds, but only if the handler
    // can be patched somewhere.
    const hasHandler = graphMemo('plan-exit-handler', () =>
      [...(graphSources()?.values() ?? [])].some(source =>
        HANDLER_PATTERN.test(source)
      )
    );
    if (!hasHandler) {
      console.error('patch: planExitCommand: failed to find the /plan handler');
      return null;
    }
    const handled = HANDLER_PATTERN.test(oldFile)
      ? patchHandler(oldFile)
      : null;
    return patchArgumentHint(handled ?? oldFile) ?? handled;
  }

  const patched = patchHandler(oldFile);
  if (!patched) return null;
  return patchArgumentHint(patched) ?? patched;
};
