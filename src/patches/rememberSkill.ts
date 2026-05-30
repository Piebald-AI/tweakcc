// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Registers the builtin "/remember" skill that allows users to review session memories
 * and update CLAUDE.local.md with learnings from past sessions.
 *
 * Pattern 1 - Find skill registration function:
 * ```
 * {SKILL_REG_FN({name:"claude-in-chrome"...
 * ```
 *
 * Pattern 2 - Find injection point:
 * ```diff
 *  function SESSION_MEM_LOADER(...){...}function XX(){
 * +  SKILL_REG_FN({name:"remember",...});
 *    return
 *  }var SKILL_DATA_VAR=`# Remember Skill...
 * ```
 */

const findSkillRegistrationFn = (file: string): string | null => {
  const ident = '[A-Za-z_$][\\w$]*';
  const patterns = [
    new RegExp(
      `function\\s+(${ident})\\((${ident})\\)\\{let\\{files:(${ident})\\}=\\2,`
    ), // CC 2.1.150 bundled-skill helper
    /\{([A-Za-z_$][\w$]*)\(\{name:"claude-in-chrome"/,
  ];

  for (const pattern of patterns) {
    const match = file.match(pattern);
    if (match) return match[1];
  }

  console.error(
    'patch: rememberSkill: failed to find skill registration function'
  );
  return null;
};

const writeBundledRememberSkill = (
  oldFile: string,
  skillRegistrationFn: string
): string | null => {
  const markerPattern = new RegExp(
    `function\\s+[$\\w]+\\(\\)\\{${skillRegistrationFn}\\(\\{name:"update-config"`
  );
  const match = oldFile.match(markerPattern);

  if (!match || match.index === undefined) return null;

  const openBraceIndex = oldFile.indexOf('{', match.index);
  if (openBraceIndex === -1) return null;

  const insertIndex = openBraceIndex + 1;
  const insertCode = `${skillRegistrationFn}({name:"remember",description:"Review session memories and update CLAUDE.local.md with learnings from past sessions.",whenToUse:"When the user asks to remember something, save a learning, or review session memories.",userInvocable:!0,isEnabled:()=>!0,async getPromptForCommand(H){let $="# Remember Skill\\n\\nReview the current conversation and any relevant session memory files, then update CLAUDE.local.md with durable learnings that should carry forward to future sessions. Keep entries concise and actionable.";if(H&&H.trim())$+="\\n\\n## User Request\\n"+H.trim();return[{type:"text",text:$}]}});`;

  const newFile =
    oldFile.slice(0, insertIndex) + insertCode + oldFile.slice(insertIndex);

  showDiff(oldFile, newFile, insertCode, insertIndex, insertIndex);
  return newFile;
};

export const writeRememberSkill = (oldFile: string): string | null => {
  // Find the skill registration function name
  const skillRegistrationFn = findSkillRegistrationFn(oldFile);
  if (!skillRegistrationFn) {
    return null;
  }

  const bundledResult = writeBundledRememberSkill(oldFile, skillRegistrationFn);
  if (bundledResult) return bundledResult;

  // Find the injection point pattern
  const pattern =
    /(function ([$\w]+)\(.{0,500}\}function [$\w]+\(\)\{)return(\}.{0,10}[, ]([$\w]+)=`# Remember Skill)/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: rememberSkill: failed to find injection point pattern'
    );
    return null;
  }

  const [fullMatch, pre, sessionMemLoaderFn, post, skillDataVar] = match;

  // Build the insertion code
  const insertCode = `
${skillRegistrationFn}({
  name: "remember",
  description: "Review session memories and update CLAUDE.local.md with learnings",
  whenToUse: "When the user wants to save learnings from past sessions",
  userInvocable: true,
  isEnabled: () => true,
  async getPromptForCommand(A) {
    let content = ${skillDataVar};
    let sessionMemFiles = ${sessionMemLoaderFn}(null);
    content += "\\n\\n## Session Memory Files to Review\\n\\n" + (sessionMemFiles.length ? sessionMemFiles.join("\\n") : "None found");
    if (A) content += "\\n\\n## User Arguments\\n\\n" + A;
    return [{ type: "text", text: content }];
  },
});
`;

  const replacement = pre + insertCode + 'return' + post;
  const startIndex = match.index;
  const endIndex = startIndex + fullMatch.length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);
  return newFile;
};
