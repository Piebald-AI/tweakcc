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

import { isGraphContextActive } from './graphContext';
import { showDiff } from './index';

// Fallback for layouts with no createElement anchor: walk the function enclosing the
// "Ready to code?" title and return the offset of its last top-level `return`.
// String-aware so braces inside strings/template literals don't skew the depth count.
/** Index just past the body `}` of the brace block opening at `open`. */
const blockEnd = (file: string, open: number): number => {
  let depth = 0;
  let inString: string | null = null;
  let escape = false;
  for (let index = open; index < file.length; index++) {
    const char = file[index];
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') inString = char;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return index + 1;
  }
  return -1;
};

/** Index of the body `{` of the function whose `function` keyword is at
 * `start`, skipping a parameter list that may itself contain braces
 * (`function X({payload:h,answer:M}){…}`). */
const functionBodyOpen = (file: string, start: number): number => {
  const paren = file.indexOf('(', start);
  if (paren === -1) return -1;
  let depth = 0;
  for (let index = paren; index < file.length; index++) {
    const char = file[index];
    if (char === '(') depth++;
    else if (char === ')' && --depth === 0) {
      return file[index + 1] === '{' ? index + 1 : -1;
    }
  }
  return -1;
};

/**
 * The innermost named `function X(…){…}` whose body contains `index`. Code-
 * split chunks put many components back to back, so "the next return after
 * the anchor" can belong to an unrelated component.
 */
const enclosingFunction = (
  file: string,
  index: number
): { start: number; open: number; end: number } | null => {
  let from = index;
  while (from > 0) {
    const start = file.lastIndexOf('function ', from);
    if (start === -1) return null;
    const open = functionBodyOpen(file, start);
    if (open !== -1 && open < index) {
      const end = blockEnd(file, open);
      if (end > index) return { start, open, end };
    }
    from = start - 1;
  }
  return null;
};

const findComponentReturnInjectionPoint = (
  oldFile: string,
  readyIdx: number
): number | null => {
  const fn = enclosingFunction(oldFile, readyIdx);
  if (!fn) return null;
  const openBrace = fn.open;

  let depth = 0;
  let inString: string | null = null;
  let escape = false;
  let lastTopLevelReturn = -1;
  for (let index = openBrace; index < oldFile.length; index++) {
    const char = oldFile[index];
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      continue;
    }
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) break;
    } else if (depth === 1 && oldFile.startsWith('return ', index)) {
      lastTopLevelReturn = index;
    }
  }

  return lastTopLevelReturn === -1 ? null : lastTopLevelReturn;
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
    // Code-split builds (CC 2.1.2xx) keep the plan-mode prompts and the
    // ExitPlanMode permission defaults in other modules than the dialog.
    if (isGraphContextActive()) {
      const promptsOnly = patchPlanModePrompts(oldFile);
      return promptsOnly === oldFile ? null : promptsOnly;
    }
    console.error(
      'patch: autoAcceptPlanMode: failed to find "Ready to code?" title'
    );
    return null;
  }

  // Check if already patched
  const alreadyPatchedPattern =
    /[$\w]+(?:\.current)?\("yes-accept-edits(?:-keep-context)?"\);return null;return|globalThis\.__tweakccPlanAccept=/;
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

  // CC 2.1.2xx: onChange:(X)=>void FUNC(X),onCancel
  const voidOnChange = afterReady.match(
    /onChange:\([$\w]+\)=>void ([$\w]+)\([$\w]+\),onCancel/
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
  } else if (voidOnChange) {
    acceptFuncName = voidOnChange[1];
  } else {
    console.error('patch: autoAcceptPlanMode: failed to find onChange handler');
    return null;
  }

  // Inject just before the component's top-level return. Primary: the
  // React-Compiler-memoized tail `else <v>=<cache>[<n>];return <v>}`
  // (backreference avoids an unrelated memo slot; the cache array is `t` in
  // older builds, any minified name in CC 2.1.2xx); fallback: the enclosing
  // function's last top-level return. Both must stay inside the dialog's own
  // function: in code-split chunks the next component starts right after it,
  // and injecting there left the dialog unpatched.
  const dialogFn = enclosingFunction(oldFile, readyIdx);
  const memoTailMatch = afterReady.match(
    /else ([$\w]+)=[$\w]+\[\d+\];return \1\}/
  );
  const memoTailIdx =
    memoTailMatch && memoTailMatch.index !== undefined
      ? readyIdx + memoTailMatch.index + memoTailMatch[0].indexOf('return ')
      : null;

  const injectionIdx =
    memoTailIdx !== null && (!dialogFn || memoTailIdx < dialogFn.end)
      ? memoTailIdx
      : findComponentReturnInjectionPoint(oldFile, readyIdx);

  if (injectionIdx === null) {
    console.error(
      'patch: autoAcceptPlanMode: failed to find component return before "Ready to code?"'
    );
    return null;
  }

  // Older builds tolerate calling the handler during render. In CC 2.1.2xx
  // the handler sets state synchronously (React error #301 if called while
  // rendering) and silently refuses input until the dialog has been on
  // screen for a moment (a mount-age guard: `if(Ur()||Yr()){Wn();return}`),
  // so one early call is dropped and nothing re-renders. There, keep the
  // dialog rendered, publish its latest handler on every render, and poll it
  // every 250ms until the dialog stops rendering (accepted) or 10s pass.
  // CC 2.1.2xx builds the option list per session; a value it does not offer
  // (e.g. a keep-context row it omitted) is treated as "No". Accept with the
  // dialog's default focus (what Enter would pick), else its first option.
  const optionsVar = afterReady.match(
    /options:([$\w]+),defaultFocusValue:([$\w]+)/
  );
  const acceptValue = optionsVar
    ? `(${optionsVar[2]}??${optionsVar[1]}?.[0]?.value??"yes-accept-edits-keep-context")`
    : '"yes-accept-edits-keep-context"';
  const insertion = isGraphContextActive()
    ? `globalThis.__tweakccPlanAccept=()=>${acceptFuncName}(${acceptValue});globalThis.__tweakccPlanAcceptSeen=Date.now();` +
      `if(!globalThis.__tweakccPlanAcceptTimer){let tweakccStarted=Date.now();globalThis.__tweakccPlanAcceptTimer=setInterval(()=>{` +
      `if(Date.now()-tweakccStarted>10000||Date.now()-globalThis.__tweakccPlanAcceptSeen>2000){clearInterval(globalThis.__tweakccPlanAcceptTimer);globalThis.__tweakccPlanAcceptTimer=null;return}` +
      `try{globalThis.__tweakccPlanAccept?.()}catch{}},250)}`
    : `${acceptFuncName}("yes-accept-edits-keep-context");return null;`;
  const newFile =
    oldFile.slice(0, injectionIdx) + insertion + oldFile.slice(injectionIdx);

  showDiff(oldFile, newFile, insertion, injectionIdx, injectionIdx);
  return patchPlanModePrompts(newFile);
};
