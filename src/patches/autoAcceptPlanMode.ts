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
  // Match the end of the "Exit plan mode?" conditional and the start of
  // the "Ready to code?" return. This is unique enough to not match elsewhere.
  //
  // The pattern matches:
  // - }}))));  - end of the if(Q) block's onCancel handler
  // - return   - the return keyword
  // - R8.default.createElement (or similar minified React var)
  // - (R8.default.Fragment,null,R8.default.createElement(
  // - fq (or similar minified component var)
  // - ,{color:"planMode",title:"Ready to code?"

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

  // Check if already patched
  if (oldFile.includes('e("yes-accept-edits");return null;return')) {
    console.log('patch: autoAcceptPlanMode: already patched, skipping');
    return oldFile;
  }

  // Insert auto-accept call between the if(Q) block and the return
  // e("yes-accept-edits") triggers the accept flow
  // return null prevents rendering the UI (component will unmount after state change)
  const insertion = 'e("yes-accept-edits");return null;';

  const newFile = oldFile.replace(pattern, (match, group1, group2) => {
    return group1 + insertion + group2;
  });

  console.log(
    `patch: autoAcceptPlanMode: patched ${matches.length} occurrence(s)`
  );

  return newFile;
};
