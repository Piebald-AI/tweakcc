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

const findEnclosingFunctionReturn = (
  oldFile: string,
  readyIdx: number
): number | null => {
  const functionStart = oldFile.lastIndexOf('function ', readyIdx);
  if (functionStart === -1) return null;

  const openBrace = oldFile.indexOf('{', functionStart);
  if (openBrace === -1 || openBrace > readyIdx) return null;

  let depth = 0;
  for (let index = openBrace; index < oldFile.length; index++) {
    const char = oldFile[index];
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) {
        const functionTail = oldFile.slice(openBrace, index + 1);
        const returnPattern = /return [$\w]+(?:\.default)?\.createElement/g;
        let match: RegExpExecArray | null;
        let lastMatch: RegExpExecArray | null = null;
        while ((match = returnPattern.exec(functionTail)) !== null) {
          lastMatch = match;
        }
        return lastMatch ? openBrace + lastMatch.index : null;
      }
    }
  }

  return null;
};

const patchPlanModePrompts = (file: string): string => {
  const replacements: Array<
    [RegExp, string | ((...args: string[]) => string)]
  > = [
    [
      /When ready, use \$\{([$\w]+)\} to present your plan for approval/g,
      (_match, toolName) =>
        `When ready, use \${${toolName}} to exit plan mode. The plan will be approved automatically.`,
    ],
    [
      /Use this tool when you are in plan mode and have finished writing your plan to the plan file and are ready for user approval\./g,
      'Use this tool when you are in plan mode and have finished writing your plan to the plan file. Calling this tool exits plan mode and approves the plan automatically.',
    ],
    [
      /This tool simply signals that you're done planning and ready for the user to review and approve/g,
      'This tool signals that you are done planning and that the plan should be approved automatically',
    ],
    [
      /Once your plan is finalized, use THIS tool to request approval/g,
      'Once your plan is finalized, use THIS tool to approve the plan and proceed',
    ],
    [
      /ExitPlanMode inherently requests user approval of your plan\./g,
      'ExitPlanMode inherently approves your plan and lets you proceed.',
    ],
    [
      /Present your plan to the user for approval/g,
      'Exit plan mode; the plan will be approved automatically',
    ],
    [
      /design an implementation approach for user approval/g,
      'design an implementation approach before automatic approval',
    ],
    [
      /This tool REQUIRES user approval - they must consent to entering plan mode/g,
      'This tool enters plan mode; plan exit approval is handled automatically when auto-accept plan mode is enabled',
    ],
    [
      /Claude has written up a plan and is ready to execute\. Would you like to proceed\?/g,
      'Claude has written up a plan and is ready to execute. The plan is approved automatically.',
    ],
    [
      /Call `\$\{([$\w]+)\}` to present the plan for approval\./g,
      (_match, toolName) =>
        `Call \`\${${toolName}}\` to exit plan mode; the plan will be approved automatically.`,
    ],
    [
      /## Phase 2: Spawn Workers \(After Plan Approval\)/g,
      '## Phase 2: Spawn Workers (After Automatic Plan Approval)',
    ],
    [
      /Once the plan is approved, spawn/g,
      'After the plan is approved automatically, spawn',
    ],
    [
      /searchHint:"present plan for approval and start coding \(plan mode only\)"/g,
      'searchHint:"approve plan and start coding (plan mode only)"',
    ],
    [
      /async description\(\)\{return"Prompts the user to exit plan mode and start coding"\}/g,
      'async description(){return"Exits plan mode and starts coding"}',
    ],
  ];

  let newFile = file;
  for (const [pattern, replacement] of replacements) {
    const before = newFile;
    newFile = newFile.replace(pattern, replacement as never);
    if (newFile !== before) {
      showDiff(file, newFile, String(replacement), 0, 0);
    }
  }

  const planExitPermissionUpdate =
    'permissionUpdates:[{type:"setMode",mode:"acceptEdits",destination:"session"}]';

  const permissionDefaultPattern =
    /kind:"permission_exit_plan_mode_v2",payload:([\s\S]{0,300}?),result:([\s\S]{0,180}?),default:\{behavior:"cancelled"\}/;
  const beforePermissionDefault = newFile;
  newFile = newFile.replace(
    permissionDefaultPattern,
    `kind:"permission_exit_plan_mode_v2",payload:$1,result:$2,default:{behavior:"allow",${planExitPermissionUpdate}}`
  );
  if (newFile !== beforePermissionDefault) {
    showDiff(file, newFile, 'permission_exit_plan_mode_v2 default allow', 0, 0);
  }

  const exitPlanCheckPermissionsPattern =
    /async checkPermissions\(([$\w]+),([$\w]+)\)\{if\(([$\w]+)\(\)\)return\{behavior:"allow",updatedInput:\1\};return\{behavior:"ask",message:"Exit plan mode\?",updatedInput:\1\}\}/;
  const beforeCheckPermissions = newFile;
  newFile = newFile.replace(
    exitPlanCheckPermissionsPattern,
    `async checkPermissions($1,$2){return{behavior:"allow",updatedInput:$1,${planExitPermissionUpdate}}}`
  );
  if (newFile !== beforeCheckPermissions) {
    showDiff(file, newFile, 'ExitPlanMode checkPermissions allow', 0, 0);
  }

  return newFile;
};

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
    /[$\w]+(?:\.current)?\("yes-accept-edits(?:-keep-context)?"\);return null;return/;
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
    const insertion = `${acceptFuncName}("yes-accept-edits-keep-context");return null;`;
    const replacement = legacyMatch[1] + insertion + legacyMatch[2];
    const startIndex = legacyMatch.index;
    const endIndex = startIndex + legacyMatch[0].length;

    const newFile =
      oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

    showDiff(oldFile, newFile, replacement, startIndex, endIndex);
    return patchPlanModePrompts(newFile);
  }

  // CC >=2.1.83: Find "return React.createElement(Box,{...title:"Ready to code?"
  // The return is preceded by various patterns, find it by searching backwards from readyIdx.
  // Newer bundles can place a long prop list before the title, so keep this
  // wider than the old 500-byte window and fall back to function-level search.
  const returnSearchStart = Math.max(0, readyIdx - 2500);
  const beforeReady = oldFile.slice(returnSearchStart, readyIdx);

  // Look for the return statement start
  const returnMatch = beforeReady.match(
    /(return [$\w]+\.default\.createElement\([$\w]+,\{flexDirection:"column",tabIndex:0,autoFocus:!0.{0,200}[$\w]+\.default\.createElement\([$\w]+,\{color:"planMode",title:")$/
  );

  if (!returnMatch) {
    // Simpler approach: find "return" before "Ready to code?" that starts the component tree
    const simpleReturnIdx = beforeReady.lastIndexOf('return ');
    if (simpleReturnIdx === -1) {
      const enclosingReturnIdx = findEnclosingFunctionReturn(oldFile, readyIdx);
      if (enclosingReturnIdx === null) {
        console.error(
          'patch: autoAcceptPlanMode: failed to find return before "Ready to code?"'
        );
        return null;
      }

      const insertion = `${acceptFuncName}("yes-accept-edits-keep-context");return null;`;
      const newFile =
        oldFile.slice(0, enclosingReturnIdx) +
        insertion +
        oldFile.slice(enclosingReturnIdx);

      showDiff(
        oldFile,
        newFile,
        insertion,
        enclosingReturnIdx,
        enclosingReturnIdx
      );
      return patchPlanModePrompts(newFile);
    }

    const absoluteReturnIdx = returnSearchStart + simpleReturnIdx;
    const insertion = `${acceptFuncName}("yes-accept-edits-keep-context");return null;`;

    const newFile =
      oldFile.slice(0, absoluteReturnIdx) +
      insertion +
      oldFile.slice(absoluteReturnIdx);

    showDiff(oldFile, newFile, insertion, absoluteReturnIdx, absoluteReturnIdx);
    return patchPlanModePrompts(newFile);
  }

  const absoluteStart = Math.max(0, readyIdx - 500) + returnMatch.index!;
  const insertion = `${acceptFuncName}("yes-accept-edits-keep-context");return null;`;

  const newFile =
    oldFile.slice(0, absoluteStart) + insertion + oldFile.slice(absoluteStart);

  showDiff(oldFile, newFile, insertion, absoluteStart, absoluteStart);
  return patchPlanModePrompts(newFile);
};
