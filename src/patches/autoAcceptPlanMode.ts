// Auto-Accept Plan Mode Patch (tweakcc-compatible)
//
// Automatically accepts the plan when Claude finishes planning,
// selecting "Yes, clear context and auto-accept edits" without user interaction.
//
// The plan approval component shows "Ready to code?" with options.
// This patch inserts code that immediately calls e("yes-accept-edits")
// and returns null, bypassing the UI.
//
// Pattern (CC 2.1.31):
// ```diff
//  if(Q)return R8.default.createElement(fq,{...title:"Exit plan mode?"...});
// +e("yes-accept-edits");return null;
//  return R8.default.createElement(R8.default.Fragment,null,
//    R8.default.createElement(fq,{color:"planMode",title:"Ready to code?",...
// ```
//
// To use with tweakcc:
// 1. Copy this file to tweakcc/src/patches/autoAcceptPlanMode.ts
// 2. Add to tweakcc/src/patches/index.ts:
//    - Import: import { writeAutoAcceptPlanMode } from './autoAcceptPlanMode';
//    - Add to PATCH_DEFINITIONS array
//    - Add to patchImplementations object
// 3. Rebuild tweakcc and run it

// Note: This import is for tweakcc compatibility. Remove if using standalone.
// import { showDiff } from './index';

/**
 * Patch the plan approval component to auto-accept.
 *
 * Finds the "Ready to code?" return statement and inserts an early
 * call to e("yes-accept-edits") followed by return null.
 *
 * The binary may contain multiple copies of the same code, so we
 * replace all occurrences.
 */
export const writeAutoAcceptPlanMode = (oldFile: string): string | null => {
  // First, find the accept handler function name by looking at the onChange handler
  // near "Ready to code?". The pattern is: onChange:(X)=>FUNC(X),onCancel
  // The function name varies between minified versions (e.g., "e", "t", etc.)
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
  console.log(
    `patch: autoAcceptPlanMode: found accept function name: ${acceptFuncName}`
  );

  // Check if already patched (with any function name)
  const alreadyPatchedPattern = new RegExp(
    `[$\\w]+\\("yes-accept-edits"\\);return null;return`
  );
  if (alreadyPatchedPattern.test(oldFile)) {
    console.log('patch: autoAcceptPlanMode: already patched, skipping');
    return oldFile;
  }

  // Match the end of the "Exit plan mode?" conditional and the start of
  // the "Ready to code?" return.
  const pattern =
    /(\}\}\)\)\)\);)(return [$\w]+\.default\.createElement\([$\w]+\.default\.Fragment,null,[$\w]+\.default\.createElement\([$\w]+,\{color:"planMode",title:"Ready to code\?")/g;

  // Check if pattern exists
  const matches = [...oldFile.matchAll(pattern)];
  if (matches.length === 0) {
    console.error(
      'patch: autoAcceptPlanMode: failed to find "Ready to code?" return pattern'
    );
    return null;
  }

  // Insert auto-accept call between the if(Q) block and the return
  // The accept function triggers the accept flow
  // return null prevents rendering the UI (component will unmount after state change)
  const insertion = `${acceptFuncName}("yes-accept-edits");return null;`;

  const newFile = oldFile.replace(pattern, (match, group1, group2) => {
    return group1 + insertion + group2;
  });

  console.log(
    `patch: autoAcceptPlanMode: patched ${matches.length} occurrence(s)`
  );

  return newFile;
};
