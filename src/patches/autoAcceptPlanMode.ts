// Please see the note about writing patches in ./index
//
// Auto-Accept Plan Mode Patch - Skip the plan approval prompt
//
// When Claude finishes writing a plan and calls ExitPlanMode, the user is shown
// a "Ready to code?" dialog with options to approve or continue editing the plan.
// This patch automatically selects "Yes, clear context and auto-accept edits"
// without requiring user interaction.
//
// Supports multiple CC versions:
// - CC <=2.1.69: onChange:(X)=>FUNC(X),onCancel pattern
// - CC >=2.1.83: onChange:a or onChange:(X)=>void REF.current(X) pattern
//   where 'a' is the async handler defined earlier in the component

import { showDiff } from './index';

export const writeAutoAcceptPlanMode = (oldFile: string): string | null => {
  const readyIdx = oldFile.indexOf('title:"Ready to code?"');
  if (readyIdx === -1) {
    console.error(
      'patch: autoAcceptPlanMode: failed to find "Ready to code?" title'
    );
    return null;
  }

  // Check if already patched
  const alreadyPatchedPattern =
    /[$\w]+\("yes-accept-edits"\);return null;return/;
  if (alreadyPatchedPattern.test(oldFile)) {
    return oldFile;
  }

  // Look for onChange handler after Ready to code
  const afterReady = oldFile.slice(readyIdx, readyIdx + 3000);

  // Try legacy pattern first: onChange:(X)=>FUNC(X),onCancel
  const legacyOnChange = afterReady.match(
    /onChange:\([$\w]+\)=>([$\w]+)\([$\w]+\),onCancel/
  );

  // Try new pattern: onChange:FUNC, where FUNC is a direct reference
  const directOnChange = afterReady.match(/onChange:([$\w]+),onCancel/);

  // Try ref pattern: onChange:(X)=>void REF.current(X),onCancel
  const refOnChange = afterReady.match(
    /onChange:\([$\w]+\)=>void ([$\w]+)\.current\([$\w]+\),onCancel/
  );

  let acceptFuncName: string;

  if (legacyOnChange) {
    acceptFuncName = legacyOnChange[1];
  } else if (directOnChange) {
    acceptFuncName = directOnChange[1];
  } else if (refOnChange) {
    // The ref pattern uses REF.current which holds the actual handler
    // We need to call REF.current("yes-accept-edits") or find the actual function
    acceptFuncName = `${refOnChange[1]}.current`;
  } else {
    console.error('patch: autoAcceptPlanMode: failed to find onChange handler');
    return null;
  }

  // Find the injection point: just before the return that renders "Ready to code?"
  // Look for the return statement with createElement containing title:"Ready to code?"
  //
  // CC <=2.1.69: }}}))))});return React.createElement(Fragment,null,React.createElement(COMP,{color:"planMode",title:"Ready to code?"
  // CC >=2.1.83: return React.createElement(Box,{...},React.createElement(COMP,{color:"planMode",title:"Ready to code?"

  // Try the legacy pattern (after Exit plan mode conditional)
  const legacyReturnPattern =
    /(\}\}\)\)\)\);)(return [$\w]+\.default\.createElement\([$\w]+\.default\.Fragment,null,[$\w]+\.default\.createElement\([$\w]+,\{color:"planMode",title:"Ready to code\?")/;

  const legacyMatch = oldFile.match(legacyReturnPattern);

  if (legacyMatch && legacyMatch.index !== undefined) {
    const insertion = `${acceptFuncName}("yes-accept-edits");return null;`;
    const replacement = legacyMatch[1] + insertion + legacyMatch[2];
    const startIndex = legacyMatch.index;
    const endIndex = startIndex + legacyMatch[0].length;

    const newFile =
      oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

    showDiff(oldFile, newFile, replacement, startIndex, endIndex);
    return newFile;
  }

  // CC >=2.1.83: Find "return React.createElement(Box,{...title:"Ready to code?"
  // The return is preceded by various patterns, find it by searching backwards from readyIdx
  const beforeReady = oldFile.slice(Math.max(0, readyIdx - 500), readyIdx);

  // Look for the return statement start
  const returnMatch = beforeReady.match(
    /(return [$\w]+\.default\.createElement\([$\w]+,\{flexDirection:"column",tabIndex:0,autoFocus:!0.{0,200}[$\w]+\.default\.createElement\([$\w]+,\{color:"planMode",title:")$/
  );

  if (!returnMatch) {
    // Simpler approach: find "return" before "Ready to code?" that starts the component tree
    const simpleReturnIdx = beforeReady.lastIndexOf('return ');
    if (simpleReturnIdx === -1) {
      console.error(
        'patch: autoAcceptPlanMode: failed to find return before "Ready to code?"'
      );
      return null;
    }

    const absoluteReturnIdx = Math.max(0, readyIdx - 500) + simpleReturnIdx;
    const insertion = `${acceptFuncName}("yes-accept-edits");return null;`;

    const newFile =
      oldFile.slice(0, absoluteReturnIdx) +
      insertion +
      oldFile.slice(absoluteReturnIdx);

    showDiff(oldFile, newFile, insertion, absoluteReturnIdx, absoluteReturnIdx);
    return newFile;
  }

  const absoluteStart = Math.max(0, readyIdx - 500) + returnMatch.index!;
  const insertion = `${acceptFuncName}("yes-accept-edits");return null;`;

  const newFile =
    oldFile.slice(0, absoluteStart) + insertion + oldFile.slice(absoluteStart);

  showDiff(oldFile, newFile, insertion, absoluteStart, absoluteStart);
  return newFile;
};
