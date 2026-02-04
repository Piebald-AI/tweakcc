// Please see the note about writing patches in ./index
//
// Auto-Accept Plan Mode Patch - Skip the plan approval prompt
//
// When Claude finishes writing a plan and calls ExitPlanMode, the user is shown
// a "Ready to code?" dialog with options to approve or continue editing the plan.
// This patch automatically selects "Yes, clear context and auto-accept edits"
// without requiring user interaction.
//
// The accept handler function name varies between minified versions (e.g., "e"
// in 2.1.31, "t" in 2.1.22), so we detect it dynamically from the onChange prop.
//
// CC 2.1.22:
// ```diff
//  if(Q)return F5.default.createElement(Sw,{...title:"Exit plan mode?"...});
// +t("yes-accept-edits");return null;
//  return F5.default.createElement(F5.default.Fragment,null,
//    F5.default.createElement(Sw,{color:"planMode",title:"Ready to code?",...
// ```
//
// CC 2.1.31:
// ```diff
//  if(Q)return R8.default.createElement(fq,{...title:"Exit plan mode?"...});
// +e("yes-accept-edits");return null;
//  return R8.default.createElement(R8.default.Fragment,null,
//    R8.default.createElement(fq,{color:"planMode",title:"Ready to code?",...
// ```

import { showDiff } from './index';

/**
 * Patch the plan approval component to auto-accept.
 *
 * Finds the "Ready to code?" return statement and inserts an early
 * call to the accept handler function, bypassing the approval UI.
 */
export const writeAutoAcceptPlanMode = (oldFile: string): string | null => {
  // First, find the accept handler function name by looking at the onChange handler
  // near "Ready to code?". The pattern is: onChange:(X)=>FUNC(X),onCancel
  const readyIdx = oldFile.indexOf('title:"Ready to code?"');
  if (readyIdx === -1) {
    console.error(
      'patch: autoAcceptPlanMode: failed to find "Ready to code?" title'
    );
    return null;
  }

  // Look for onChange handler after Ready to code
  const afterReady = oldFile.slice(readyIdx, readyIdx + 3000);
  const onChangeMatch = afterReady.match(
    /onChange:\([$\w]+\)=>([$\w]+)\([$\w]+\),onCancel/
  );
  if (!onChangeMatch) {
    console.error('patch: autoAcceptPlanMode: failed to find onChange handler');
    return null;
  }

  const acceptFuncName = onChangeMatch[1];

  // Check if already patched (with any function name)
  const alreadyPatchedPattern = new RegExp(
    `[$\\w]+\\("yes-accept-edits"\\);return null;return`
  );
  if (alreadyPatchedPattern.test(oldFile)) {
    return oldFile;
  }

  // Match the end of the "Exit plan mode?" conditional and the start of
  // the "Ready to code?" return.
  const pattern =
    /(\}\}\)\)\)\);)(return [$\w]+\.default\.createElement\([$\w]+\.default\.Fragment,null,[$\w]+\.default\.createElement\([$\w]+,\{color:"planMode",title:"Ready to code\?")/;

  const match = oldFile.match(pattern);
  if (!match || match.index === undefined) {
    console.error(
      'patch: autoAcceptPlanMode: failed to find "Ready to code?" return pattern'
    );
    return null;
  }

  // Insert auto-accept call between the if(Q) block and the return
  // The accept function triggers the accept flow with "yes-accept-edits"
  // return null prevents rendering the UI (component will unmount after state change)
  const insertion = `${acceptFuncName}("yes-accept-edits");return null;`;
  const replacement = match[1] + insertion + match[2];

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);

  return newFile;
};
