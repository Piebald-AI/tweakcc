// Conversation title management patch for Claude Code
// Adds ability to set conversation titles and persist them

import { showDiff, getReactVar, getRequireFuncName } from './index';
import { writeSlashCommandDefinition as writeSlashCmd } from './slashCommands';

// ============================================================================
// SUB PATCH 1: Add /title slash command
// ============================================================================

/**
 * Sub-patch 1: Write the /title slash command definition
 */
export const writeTitleSlashCommand = (oldFile: string): string | null => {
  const reactVar = getReactVar(oldFile);
  if (!reactVar) {
    console.error('patch: conversationTitle: failed to find React variable');
    return null;
  }

  // Generate the slash command definition
  const commandDef = `, {
  type: "local",
  name: "title",
  description: "Set the conversation title",
  isEnabled: () => !0,
  isHidden: !1,
  async call(A, B, I) {
    if (!A)
      throw new Error("Please specify a conversation title.");
    CUR_CONVERSATION_TITLE = A;
    setTerminalTitleOverride(A);
    return {
      type: "text",
      value: \`Conversation title set to \\x1b[1m\${A}\\x1b[0m\`,
    }
  },
  userFacingName() {
    return "title";
  },
}`;

  return writeSlashCmd(oldFile, commandDef);
};

// ============================================================================
// SUB PATCH 2: Insert custom naming functions (175 lines from insertionCode.js)
// ============================================================================

/**
 * Sub-patch 2a: Find location to insert custom naming functions
 * Searches for the class definition with summaries, messages, checkpoints, fileHistorySnapshots
 */
export const findCustomNamingFunctionsLocation = (
  fileContents: string
): number | null => {
  // Match: class [$\w]+{summaries;customTitles;messages;fileHistorySnapshots;
  const classPattern =
    /class ([$\w]+)\{summaries;(?:customTitles;)?messages;(?:checkpoints;)?fileHistorySnapshots;/;
  const match = fileContents.match(classPattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: conversationTitle: findCustomNamingFunctionsLocation: failed to find class pattern'
    );
    return null;
  }

  return match.index;
};

/**
 * Sub-patch 2b: Write the custom naming functions (insertionCode.js content)
 */
export const writeCustomNamingFunctions = (oldFile: string): string | null => {
  const location = findCustomNamingFunctionsLocation(oldFile);
  if (location === null) {
    console.error(
      'patch: conversationTitle: failed to find custom naming functions location'
    );
    return null;
  }

  const requireFunc = getRequireFuncName(oldFile);

  // The entire insertion code from insertionCode.js (175 lines)
  const insertionCode = `
function getTweakccBaseDir() {
  const { join: pathJoin } = ${requireFunc}('path');
  const { homedir: osHomedir } = ${requireFunc}('os');
  const { statSync: fsStatSync, mkdirSync: fsMkdirSync } = ${requireFunc}('fs');
  // Prioritize ~/.tweakcc which is the original and default.  Only respect
  // XDG_CONFIG_HOME if it doesn't exist.
  let dir;
  let homedirTweakcc = pathJoin(osHomedir(), ".tweakcc");
  try {
    if (fsStatSync(homedirTweakcc).isDirectory()) {
      dir = homedirTweakcc;
    }
  } catch (e) {
    if (e.code == "ENOENT") {
      // Doesn't exist.  Move on and see if the XDG one exists.
    } else {
      throw new Error('cannot stat ' + homedirTweakcc + ': ' + e);
    }
  }

  // Try XDG.
  if (process.env.XDG_CONFIG_HOME) {
    // XDG_CONFIG_HOME is set.  If it's set and ~/.tweakcc doesn't exist, prefer it.
    const xdgTweakcc = pathJoin(process.env.XDG_CONFIG_HOME, "tweakcc");
    dir = xdgTweakcc;
  }

  // Create the dir.
  fsMkdirSync(dir, { recursive: true });
  return dir;
}

const findSummaryEntryForLeafUuid = (filePath, messageUuid) => {
  const { readFileSync: fsReadFileSync, statSync: fsStatSync } = ${requireFunc}('fs');
  // Optimization: skip files that are certain to not be tweakcc summary files (which only contain 1 small line).
  if (fsStatSync(filePath).size > 1000) {
    return null;
  }
  const lines = fsReadFileSync(filePath, "utf8")
    .split("\\n")
    .map((l) => JSON.parse(l.trim()));
  for (const line of lines) {
    if (line.type == "summary" && line.uuid == messageUuid) {
      return line;
    }
  }
  return null;
};

const getSummaryFileForLeafMessage = (
  projectDirectory,
  projectSlug,
  messageUuid
) => {
  const { join: pathJoin } = ${requireFunc}('path');
  const { readFileSync: fsReadFileSync, readdirSync: fsReaddirSync } = ${requireFunc}('fs');
  try {
    // File contains the uuid
    const summaryFileId = fsReadFileSync(
      pathJoin(getTweakccBaseDir(), "named-sessions", projectSlug, messageUuid),
      "utf8"
    ).trim();
    return pathJoin(projectDirectory, summaryFileId + '.jsonl');
  } catch (e) {
    // File not found or can't be accessed, etc.  Ignore.
  }

  // Just read each file and try to find it.
  for (const file of fsReaddirSync(projectDirectory)) {
    try {
      const pth = pathJoin(projectDirectory, file);
      const summaryObj = findSummaryEntryForLeafUuid(pth);
      if (summaryObj != null && summaryObj.tweakcc != null) {
        // It needs to be a tweakcc one.
        return pth;
      }
    } catch {}
  }

  // It doesn't exist.
  return null;
};

const setTerminalTitleOverride = (title) => {
  process.env.CLAUDE_CODE_DISABLE_TERMINAL_TITLE = 1;
  if (process.platform === "win32") process.title = 'Claude: ' + title;
  else process.stdout.write('\\x1B]0;Claude: ' + title + '\\x07');
};

let CUR_CONVERSATION_TITLE = "";
function onNewMessage(projectDir, projectSlug, msg) {
  const { join: pathJoin } = ${requireFunc}('path');
  const { readFileSync: fsReadFileSync, writeFileSync: fsWriteFileSync, mkdirSync: fsMkdirSync, renameSync: fsRenameSync } = ${requireFunc}('fs');
  const { randomUUID: cryptoRandomUUID } = ${requireFunc}('crypto');
  const tweakcc = getTweakccBaseDir();

  if (msg.parentUuid) {
    const path = getSummaryFileForLeafMessage(
      projectDir,
      projectSlug,
      msg.parentUuid
    );
    if (path) {
      // There's an old file.  Update it to the new file.
      const summaryObj = findSummaryEntryForLeafUuid(path);
      summaryObj.leafUuid = msg.uuid;
      if (CUR_CONVERSATION_TITLE != "") {
        summaryObj.summary = CUR_CONVERSATION_TITLE;
      } else {
        CUR_CONVERSATION_TITLE = summaryObj.summary;
      }
      setTerminalTitleOverride(CUR_CONVERSATION_TITLE);
      fsWriteFileSync(path, JSON.stringify(summaryObj));

      // Update the cache; it points from message ID to summary file ID.
      fsMkdirSync(pathJoin(tweakcc, "named-sessions", projectSlug), {
        recursive: true,
      });
      const oldPath = pathJoin(
        tweakcc,
        "named-sessions",
        projectSlug,
        msg.parentUuid
      );
      const newPath = pathJoin(
        tweakcc,
        "named-sessions",
        projectSlug,
        msg.uuid
      );
      try {
        fsRenameSync(oldPath, newPath);
        return;
      } catch (e) {
        if (e.code == "ENOENT") {
          // named-sessions/{projectSlug} exists, so the error is because the old named-session doesn't exist.
          // So we need to create the new file later.
          // DO NOT return.
        } else {
          throw new Error('cannot rename ' + oldPath + ' -> ' + newPath + ': ' + e);
        }
      }
    }
  }

  // Only create our summary entry if a custom title has been set.  Because we want the auto
  // title generation to kick in if the user hasn't set a title, and the auto title generation
  // won't generate titles for sessions older than the most recently
  if (CUR_CONVERSATION_TITLE != "") {
    setTerminalTitleOverride(CUR_CONVERSATION_TITLE);
    const uuid = cryptoRandomUUID();

    // Create the summary file.
    const newFilePath = pathJoin(projectDir, uuid + '.jsonl');
    const summaryObj = {
      type: "summary",
      summary: CUR_CONVERSATION_TITLE,
      leafUuid: msg.uuid,
      // This is important.
      tweakcc: null,
    };
    fsWriteFileSync(newFilePath, JSON.stringify(summaryObj));

    fsMkdirSync(pathJoin(tweakcc, "named-sessions", projectSlug), {
      recursive: true,
    });
    fsWriteFileSync(
      pathJoin(tweakcc, "named-sessions", projectSlug, msg.uuid),
      uuid
    );
  }
}

`;

  const newFile =
    oldFile.slice(0, location) + insertionCode + oldFile.slice(location);

  showDiff(oldFile, newFile, insertionCode, location, location);

  return newFile;
};

// ============================================================================
// SUB PATCH 3: Add message append entry interceptor
// ============================================================================

/**
 * Sub-patch 3a: Find location to insert append entry interceptor
 */
export const findAppendEntryInterceptorLocation = (
  fileContents: string
): { location: number; messageVar: string } | null => {
  // Match: if(![$\w]+\.has\(([$\w]+)\.uuid\)\){if([$\w]+\.appendFileSync(
  const pattern =
    /(if\(![$\w]+\.has\(([$\w]+)\.uuid\)\)\{)if\([$\w]+\.appendFileSync\(/;
  const match = fileContents.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: conversationTitle: findAppendEntryInterceptorLocation: failed to find pattern'
    );
    return null;
  }

  // Insertion point is after match[1], which means at match.index + match[1].length
  const location = match.index + match[1].length;
  const messageVar = match[2];

  return { location, messageVar };
};

/**
 * Sub-patch 3b: Write the append entry interceptor
 */
export const writeAppendEntryInterceptor = (oldFile: string): string | null => {
  const result = findAppendEntryInterceptorLocation(oldFile);
  if (!result) {
    console.error(
      'patch: conversationTitle: failed to find append entry interceptor location'
    );
    return null;
  }

  const requireFunc = getRequireFuncName(oldFile);

  const { location, messageVar } = result;

  // NOTE: appendEntry IS async so dynamic imports are okay.
  const code = `const { dirname: pathDirname, basename: pathBasename } = ${requireFunc}('path');
const projectDir = pathDirname(this.sessionFile);
const projectSlug = pathBasename(projectDir);
onNewMessage(projectDir, projectSlug, ${messageVar});
`;

  const newFile = oldFile.slice(0, location) + code + oldFile.slice(location);

  showDiff(oldFile, newFile, code, location, location);

  return newFile;
};

// ============================================================================
// SUB PATCH 4: Add tweakcc summary check
// ============================================================================

/**
 * Sub-patch 4a: Find tweakcc summary check locations
 */
export const findTweakccSummaryCheckLocations = (
  fileContents: string
): {
  orLocation: number;
  loopLocation: number;
  messageVar: string;
  fileListVar: string;
} | null => {
  // First, find the continue statement
  const continuePattern = /if\([$\w]+\.has\(([$\w]+)\.uuid\)\)continue;/;
  const continueMatch = fileContents.match(continuePattern);

  if (!continueMatch || continueMatch.index === undefined) {
    console.error(
      'patch: conversationTitle: findTweakccSummaryCheckLocations: failed to find continue pattern'
    );
    return null;
  }

  const messageVar = continueMatch[1];
  const orLocation =
    continueMatch.index + continueMatch[0].length - ')continue;'.length;

  // Now search in the past 200 chars for the for loop
  const searchStart = Math.max(0, continueMatch.index - 200);
  const searchText = fileContents.substring(searchStart, continueMatch.index);

  const loopPattern = /for\(let [$\w]+ of ([$\w]+)\)try/;
  const loopMatch = searchText.match(loopPattern);

  if (!loopMatch) {
    console.error(
      'patch: conversationTitle: findTweakccSummaryCheckLocations: failed to find loop pattern'
    );
    return null;
  }

  const fileListVar = loopMatch[1];
  const loopLocation = searchStart + (loopMatch.index ?? 0);

  return { orLocation, loopLocation, messageVar, fileListVar };
};

/**
 * Sub-patch 4b: Write tweakcc summary check
 */
export const writeTweakccSummaryCheck = (oldFile: string): string | null => {
  const locations = findTweakccSummaryCheckLocations(oldFile);
  if (!locations) {
    console.error(
      'patch: conversationTitle: failed to find tweakcc summary check locations'
    );
    return null;
  }

  const requireFunc = getRequireFuncName(oldFile);

  const { orLocation, loopLocation, messageVar, fileListVar } = locations;

  // Apply modifications in reverse order to preserve indices
  let newFile = oldFile;

  // First, insert at loopLocation (before the loop).
  // NOTE: The function this code is called in IS async so dynamic importing is okay.
  const loopCode = `const { readFileSync: fsReadFileSync } = ${requireFunc}('fs');
const tweakccSummaries = new Set();
for (const file of ${fileListVar}) {
    const contents = fsReadFileSync(file, "utf8").trim();
    if (contents.includes("\\n")) continue;
    let obj;
    try {
      obj = JSON.parse(contents);
    } catch {
      // Skip invalid files.
      continue;
    }
    if (obj.type != "summary" || !obj.hasOwnProperty("tweakcc")) continue;
    tweakccSummaries.add(obj.leafUuid);
}
`;

  newFile =
    newFile.slice(0, loopLocation) + loopCode + newFile.slice(loopLocation);

  showDiff(oldFile, newFile, loopCode, loopLocation, loopLocation);

  // Adjust orLocation for the insertion we just made
  const adjustedOrLocation = orLocation + loopCode.length;

  // Then, insert at orLocation (in the continue condition)
  const orCode = `||tweakccSummaries.has(${messageVar}.uuid)`;
  const newFile2 =
    newFile.slice(0, adjustedOrLocation) +
    orCode +
    newFile.slice(adjustedOrLocation);

  showDiff(newFile, newFile2, orCode, adjustedOrLocation, adjustedOrLocation);

  return newFile2;
};

// ============================================================================
// SUB PATCH 5: Enable rename conversation command
// ============================================================================

/**
 * Sub-patch 5: Enable the "rename conversation" slash command
 */
export const enableRenameConversationCommand = (
  oldFile: string
): string | null => {
  // Find: description:"Rename the current conversation",isEnabled:()=>!1,
  const pattern =
    /description:"Rename the current conversation",isEnabled:\(\)=>!1,/;
  const match = oldFile.match(pattern);

  if (!match) {
    console.error(
      'patch: conversationTitle: enableRenameConversationCommand: failed to find pattern'
    );
    return null;
  }

  if (match.index === undefined) {
    console.error(
      'patch: conversationTitle: enableRenameConversationCommand: match.index is undefined'
    );
    return null;
  }

  // Replace !1 with !0
  const oldPattern =
    'description:"Rename the current conversation",isEnabled:()=>!1,';
  const newPattern =
    'description:"Rename the current conversation",isEnabled:()=>!0,';

  const newFile = oldFile.replace(oldPattern, newPattern);

  if (newFile === oldFile) {
    console.error(
      'patch: conversationTitle: enableRenameConversationCommand: replacement failed'
    );
    return null;
  }

  showDiff(
    oldFile,
    newFile,
    newPattern,
    match.index,
    match.index + oldPattern.length
  );

  return newFile;
};

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Apply all conversation title patches to the file
 */
export const writeConversationTitle = (oldFile: string): string | null => {
  let result: string | null = oldFile;

  // Step 1: Write /title slash command
  result = writeTitleSlashCommand(result);
  if (!result) {
    console.error(
      'patch: conversationTitle: step 1 failed (writeTitleSlashCommand)'
    );
    return null;
  }

  // Step 2: Write custom naming functions
  result = writeCustomNamingFunctions(result);
  if (!result) {
    console.error(
      'patch: conversationTitle: step 2 failed (writeCustomNamingFunctions)'
    );
    return null;
  }

  // Step 3: Write append entry interceptor
  result = writeAppendEntryInterceptor(result);
  if (!result) {
    console.error(
      'patch: conversationTitle: step 3 failed (writeAppendEntryInterceptor)'
    );
    return null;
  }

  // Step 4: Write tweakcc summary check
  result = writeTweakccSummaryCheck(result);
  if (!result) {
    console.error(
      'patch: conversationTitle: step 4 failed (writeTweakccSummaryCheck)'
    );
    return null;
  }

  // Optional Step 5: Enable rename conversation command
  const tmp = enableRenameConversationCommand(result);
  if (tmp) {
    result = tmp;
  } else {
    console.log(
      'patch: conversationTitle: step 5 failed (enableRenameConversationCommand)'
    );
    // It's okay if it fails--we'll not abort the whole operation.
  }

  return result;
};
