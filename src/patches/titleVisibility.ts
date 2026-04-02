import { showDiff } from './index';
import { writeSlashCommandDefinition as writeSlashCmd } from './slashCommands';

export const writeTitleVisibilityToggle = (oldFile: string): string | null => {
  let content = oldFile;

  // Step 1: Add /hidetitle slash command
  const commandDef = `, {
  type: "local",
  name: "session-title",
  description: "Toggle session title visibility in the prompt bar",
  isEnabled: () => !0,
  isHidden: !1,
  load: () => Promise.resolve({
    call: async (A, B) => {
      TWEAKCC_HIDE_TITLE = !TWEAKCC_HIDE_TITLE;
      return {
        type: "text",
        value: TWEAKCC_HIDE_TITLE
          ? "Session title hidden from prompt bar"
          : "Session title visible in prompt bar",
      }
    },
  }),
  userFacingName() {
    return "session-title";
  },
}`;

  const slashResult = writeSlashCmd(content, commandDef);
  if (!slashResult) {
    console.error('patch: titleVisibility: step 1 failed (writeSlashCmd)');
    return null;
  }
  content = slashResult;

  // Step 2: Find the name-extraction function and add global variable
  // Pattern: function X(_){if(Y())return;return _.standaloneAgentContext?.name}
  const nameExtractPattern =
    /function ([$\w]+)\(([$\w]+)\)\{if\(([$\w]+)\(\)\)return;return \2\.standaloneAgentContext\?\.name\}/;
  const nameExtractMatch = content.match(nameExtractPattern);
  if (!nameExtractMatch || nameExtractMatch.index === undefined) {
    console.error(
      'patch: titleVisibility: failed to find name extract function'
    );
    return null;
  }

  const funcName = nameExtractMatch[1];
  const argVar = nameExtractMatch[2];
  const checkFunc = nameExtractMatch[3];

  // Insert global variable before the function
  const globalDecl = 'let TWEAKCC_HIDE_TITLE=!1;\n';
  let prevContent = content;
  content =
    content.slice(0, nameExtractMatch.index) +
    globalDecl +
    content.slice(nameExtractMatch.index);

  showDiff(
    prevContent,
    content,
    globalDecl,
    nameExtractMatch.index,
    nameExtractMatch.index
  );

  // Step 3: Modify the function to check TWEAKCC_HIDE_TITLE
  const oldFunc = nameExtractMatch[0];
  const newFunc =
    `function ${funcName}(${argVar}){if(${checkFunc}())return;` +
    `if(TWEAKCC_HIDE_TITLE)return;` +
    `return ${argVar}.standaloneAgentContext?.name}`;

  const funcIdx = content.indexOf(oldFunc);
  if (funcIdx === -1) {
    console.error(
      'patch: titleVisibility: failed to find function after insert'
    );
    return null;
  }

  prevContent = content;
  content =
    content.slice(0, funcIdx) +
    newFunc +
    content.slice(funcIdx + oldFunc.length);

  showDiff(prevContent, content, newFunc, funcIdx, funcIdx + oldFunc.length);

  // Step 4: Also suppress the color when title is hidden
  // The rendering function has one of:
  //   let R=Yy9(K.getState()),A=T?.color;if(R||A){...}  (older CC)
  //   let w=jp7(T),f=_?.color;if(w||f)...               (CC 2.1.90+)
  // We wrap the condition: if(!TWEAKCC_HIDE_TITLE&&(R||A))
  const funcNameEscaped = funcName.replace(/\$/g, '\\$');
  const colorBranchPattern = new RegExp(
    `(let ([$\\w]+)=${funcNameEscaped}\\(` +
      `[$\\w]+(?:\\.getState\\(\\))?\\),` +
      `([$\\w]+)=([$\\w]+)\\?\\.color;)` +
      `if\\(([$\\w]+)\\|\\|([$\\w]+)\\)`
  );
  const colorBranchMatch = content.match(colorBranchPattern);
  if (!colorBranchMatch || colorBranchMatch.index === undefined) {
    console.error('patch: titleVisibility: failed to find color branch');
    return null;
  }

  const letClause = colorBranchMatch[1];
  const condLeft = colorBranchMatch[5];
  const condRight = colorBranchMatch[6];
  const oldBranch = colorBranchMatch[0];
  const newBranch =
    `${letClause}if(!TWEAKCC_HIDE_TITLE&&(${condLeft}||${condRight}))`;

  prevContent = content;
  content =
    content.slice(0, colorBranchMatch.index) +
    newBranch +
    content.slice(colorBranchMatch.index + oldBranch.length);

  showDiff(
    prevContent,
    content,
    newBranch,
    colorBranchMatch.index,
    colorBranchMatch.index + oldBranch.length
  );

  return content;
};
