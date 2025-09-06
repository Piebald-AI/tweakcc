import figlet from 'figlet';
import * as fs from 'node:fs/promises';
import { restoreClijsFromBackup, updateConfigFile } from './config.js';
import { ClaudeCodeInstallationInfo, Theme, TweakccConfig } from './types.js';
import { isDebug } from './misc.js';
import { buildChalkChain } from './misc.js';

export interface LocationResult {
  startIndex: number;
  endIndex: number;
  identifiers?: string[];
}

export interface ModificationEdit {
  startIndex: number;
  endIndex: number;
  newContent: string;
}

// Heuristic functions for finding elements in cli.js
export function getSigninBannerTextLocation(
  oldFile: string
): LocationResult | null {
  // Look for the exact banner text from the document
  const bannerText = ` ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
 ██████╗ ██████╗ ██████╗ ███████╗
██╔════╝██╔═══██╗██╔══██╗██╔════╝
██║     ██║   ██║██║  ██║█████╗
██║     ██║   ██║██║  ██║██╔══╝
╚██████╗╚██████╔╝██████╔╝███████╗
 ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝`;

  const index = oldFile.indexOf(bannerText);
  if (index !== -1) {
    return {
      startIndex: index - 1, // -1 for the opening back tick.
      endIndex: index + bannerText.length + 1, // +1 for the closing back tick.
    };
  }
  return null;
}

export function writeSigninBannerText(
  oldFile: string,
  newBannerText: string
): string {
  const location = getSigninBannerTextLocation(oldFile);
  if (!location) {
    return oldFile;
  }

  const newContent = JSON.stringify(newBannerText);
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newContent +
    oldFile.slice(location.endIndex);

  showDiff(
    oldFile,
    newFile,
    newContent,
    location.startIndex,
    location.endIndex
  );
  return newFile;
}

export function getWelcomeMessageLocation(
  oldFile: string
): LocationResult | null {
  // Pattern: " Welcome to ",q9.createElement(T,{bold:!0},"Claude Code"),"!"
  const pattern =
    /" Welcome to ",[$\w]+\.createElement\([^,]+,\{bold:!0\},"Claude Code"\),"!"/;
  const match = oldFile.match(pattern);

  if (match && match.index !== undefined) {
    const claudeCodeIndex = match[0].indexOf('"Claude Code"');
    if (claudeCodeIndex !== -1) {
      return {
        startIndex: match.index + claudeCodeIndex,
        endIndex: match.index + claudeCodeIndex + '"Claude Code"'.length,
      };
    }
  }

  return null;
}

export function writeWelcomeMessage(
  oldFile: string,
  customText: string
): string | null {
  const location = getWelcomeMessageLocation(oldFile);
  if (!location) {
    console.error('patch: welcome message: failed to find location');
    return null;
  }

  // Simple replacement with the custom text
  const newContent = `"${customText}"`;

  const newFile =
    oldFile.slice(0, location.startIndex) +
    newContent +
    oldFile.slice(location.endIndex);

  showDiff(
    oldFile,
    newFile,
    newContent,
    location.startIndex,
    location.endIndex
  );

  return newFile;
}

export function getThemesLocation(oldFile: string): {
  switchStatement: LocationResult;
  objArr: LocationResult;
  obj: LocationResult;
} | null {
  // Look for switch statement pattern: switch(A){case"light":return ...;}
  const switchPattern =
    /switch\s*\(([^)]+)\)\s*\{[^}]*case\s*["']light["'][^}]+\}/s;
  const switchMatch = oldFile.match(switchPattern);

  if (!switchMatch || switchMatch.index == undefined) {
    console.error('patch: themes: failed to find switchMatch');
    return null;
  }

  const objArrPat = /\[(?:\{label:"(?:Dark|Light).+?",value:".+?"\},?)+\]/;
  const objPat = /return\{(?:[\w$]+?:"(?:Dark|Light).+?",?)+\}/;
  const objArrMatch = oldFile.match(objArrPat);
  const objMatch = oldFile.match(objPat);

  if (!objArrMatch || objArrMatch.index == undefined) {
    console.error('patch: themes: failed to find objArrMatch');
    return null;
  }

  if (!objMatch || objMatch.index == undefined) {
    console.error('patch: themes: failed to find objMatch');
    return null;
  }

  return {
    switchStatement: {
      startIndex: switchMatch.index,
      endIndex: switchMatch.index + switchMatch[0].length,
      identifiers: [switchMatch[1].trim()],
    },
    objArr: {
      startIndex: objArrMatch.index,
      endIndex: objArrMatch.index + objArrMatch[0].length,
    },
    obj: {
      startIndex: objMatch.index,
      endIndex: objMatch.index + objMatch[0].length,
    },
  };
}

export const writeThemes = (
  oldFile: string,
  themes: Theme[]
): string | null => {
  const locations = getThemesLocation(oldFile);
  if (!locations) {
    return null;
  }

  if (themes.length === 0) {
    return oldFile;
  }

  let newFile = oldFile;

  // Process in reverse order to avoid index shifting

  // Update theme mapping object (obj)
  const obj =
    'return' +
    JSON.stringify(
      Object.fromEntries(themes.map(theme => [theme.id, theme.name]))
    );
  newFile =
    newFile.slice(0, locations.obj.startIndex) +
    obj +
    newFile.slice(locations.obj.endIndex);
  showDiff(
    oldFile,
    newFile,
    obj,
    locations.obj.startIndex,
    locations.obj.endIndex
  );
  oldFile = newFile;

  // Update theme options array (objArr)
  const objArr = JSON.stringify(
    themes.map(theme => ({ label: theme.name, value: theme.id }))
  );
  newFile =
    newFile.slice(0, locations.objArr.startIndex) +
    objArr +
    newFile.slice(locations.objArr.endIndex);
  showDiff(
    oldFile,
    newFile,
    objArr,
    locations.objArr.startIndex,
    locations.objArr.endIndex
  );
  oldFile = newFile;

  // Update switch statement
  let switchStatement = `switch(${locations.switchStatement.identifiers?.[0]}){\n`;
  themes.forEach(theme => {
    switchStatement += `case"${theme.id}":return${JSON.stringify(
      theme.colors
    )};\n`;
  });
  switchStatement += `default:return${JSON.stringify(themes[0].colors)};\n}`;

  newFile =
    newFile.slice(0, locations.switchStatement.startIndex) +
    switchStatement +
    newFile.slice(locations.switchStatement.endIndex);
  showDiff(
    oldFile,
    newFile,
    switchStatement,
    locations.switchStatement.startIndex,
    locations.switchStatement.endIndex
  );

  return newFile;
};

const getThinkerSymbolCharsLocation = (oldFile: string) => {
  const results = [];

  // Find all arrays that look like symbol arrays with the dot character
  const arrayPattern = /\["[·✢*✳✶✻✽]",\s*(?:"[·✢*✳✶✻✽]",?\s*)+\]/g;
  let match;
  while ((match = arrayPattern.exec(oldFile)) !== null) {
    results.push({
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return results;
};

export const writeThinkerSymbolChars = (
  oldFile: string,
  symbols: string[]
): string | null => {
  const locations = getThinkerSymbolCharsLocation(oldFile);
  if (locations.length === 0) {
    return null;
  }

  const symbolsJson = JSON.stringify(symbols);

  // Sort locations by start index in descending order to apply from end to beginning.
  const sortedLocations = locations.sort((a, b) => b.startIndex - a.startIndex);

  let newFile = oldFile;
  for (let i = 0; i < sortedLocations.length; i++) {
    const updatedFile =
      newFile.slice(0, sortedLocations[i].startIndex) +
      symbolsJson +
      newFile.slice(sortedLocations[i].endIndex);

    showDiff(
      newFile,
      updatedFile,
      symbolsJson,
      sortedLocations[i].startIndex,
      sortedLocations[i].endIndex
    );
    newFile = updatedFile;
  }

  return newFile;
};

const getThinkerSymbolSpeedLocation = (
  oldFile: string
): LocationResult | null => {
  // Use the original full regex to find the exact pattern
  const speedPattern =
    /[\w$]+\(\(\)=>\{if\(![\w$]+\)\{[\w$]+\(\d+\);return\}[\w$]+\(\([^)]+\)=>[^)]+\+1\)\},(\d+)\)/;
  const match = oldFile.match(speedPattern);

  if (!match || match.index == undefined) {
    console.error('patch: thinker symbol speed: failed to find match');
    return null;
  }

  // Find where the captured number starts and ends within the full match
  const fullMatchText = match[0];
  const capturedNumber = match[1];

  // Find the number within the full match
  const numberIndex = fullMatchText.lastIndexOf(capturedNumber);
  const startIndex = match.index + numberIndex;
  const endIndex = startIndex + capturedNumber.length;

  return {
    startIndex: startIndex,
    endIndex: endIndex,
  };
};

export const writeThinkerSymbolSpeed = (
  oldFile: string,
  speed: number
): string | null => {
  const location = getThinkerSymbolSpeedLocation(oldFile);
  if (!location) {
    return null;
  }

  const speedStr = JSON.stringify(speed);

  const newContent =
    oldFile.slice(0, location.startIndex) +
    speedStr +
    oldFile.slice(location.endIndex);

  showDiff(
    oldFile,
    newContent,
    speedStr,
    location.startIndex,
    location.endIndex
  );
  return newContent;
};

const getSpinnerNoFreezeLocation = (oldFile: string): LocationResult | null => {
  const wholePattern =
    /[\w$]+\(\(\)=>\{if\(![\w$]+\)\{[\w$]+\(\d+\);return\}[\w$]+\(\([^)]+\)=>[^)]+\+1\)\},\d+\)/;
  const wholeMatch = oldFile.match(wholePattern);

  if (!wholeMatch || wholeMatch.index === undefined) {
    console.error('patch: spinner no-freeze: failed to find wholeMatch');
    return null;
  }

  const freezeBranchPattern = /if\(![\w$]+\)\{[\w$]+\(\d+\);return\}/;
  const condMatch = wholeMatch[0].match(freezeBranchPattern);

  if (!condMatch || condMatch.index === undefined) {
    console.error('patch: spinner no-freeze: failed to find freeze condition');
    return null;
  }

  const startIndex = wholeMatch.index + condMatch.index;
  const endIndex = startIndex + condMatch[0].length;

  return {
    startIndex: startIndex,
    endIndex: endIndex,
  };
};

export const writeSpinnerNoFreeze = (oldFile: string): string | null => {
  const location = getSpinnerNoFreezeLocation(oldFile);
  if (!location) {
    return null;
  }

  const newFile =
    oldFile.slice(0, location.startIndex) + oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, '', location.startIndex, location.endIndex);
  return newFile;
};

const getThinkerVerbsLocation = (oldFile: string): LocationResult | null => {
  // This finds the folowing pattern:
  // ```js
  // kW8 = {
  //   words: [
  //     "Actualizing",
  //     "Baking"
  //   ]
  // }
  // ```
  // To write, we just do `{varname} = {JSON.stringify({words: verbs})}`.
  const verbsPattern =
    /([$\w]+)=\{words:\[(?:"[^"{}()]+ing",)+"[^"{}()]+ing"\]\}/s;

  const verbsMatch = oldFile.match(verbsPattern);
  if (!verbsMatch || verbsMatch.index == undefined) {
    console.error('patch: thinker verbs: failed to find verbsMatch');
    return null;
  }

  return {
    startIndex: verbsMatch.index,
    endIndex: verbsMatch.index + verbsMatch[0].length,
    identifiers: [verbsMatch[1]],
  };
};

const getThinkerVerbsUseLocation = (oldFile: string): LocationResult | null => {
  // This is brittle but it's easy.
  // It's a function that returns either new verbs from Statsig (a/b testing) or the default verbs.
  // When we write the file we'll just write a new function.
  const pattern =
    /function ([$\w]+)\(\)\{return [$\w]+\("tengu_spinner_words",[$\w]+\)\.words\}/;
  const match = oldFile.match(pattern);

  if (!match || match.index == undefined) {
    console.error('patch: thinker verbs: failed to find match');
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    identifiers: [match[1]],
  };
};

export const writeThinkerVerbs = (
  oldFile: string,
  verbs: string[]
): string | null => {
  const location1 = getThinkerVerbsLocation(oldFile);
  if (!location1) {
    return null;
  }
  const verbsLocation = location1;
  const varName = verbsLocation.identifiers?.[0];

  const verbsJson = `${varName}=${JSON.stringify({ words: verbs })}`;
  const newFile1 =
    oldFile.slice(0, verbsLocation.startIndex) +
    verbsJson +
    oldFile.slice(verbsLocation.endIndex);

  showDiff(
    oldFile,
    newFile1,
    verbsJson,
    verbsLocation.startIndex,
    verbsLocation.endIndex
  );

  // Update the the function that returns the spinner verbs to always return the hard-coded verbs
  // and not use any Statsig ones.  That also prevents `undefined...` from showing up in the UI.
  const location2 = getThinkerVerbsUseLocation(newFile1);
  if (!location2) {
    return null;
  }
  const useLocation = location2;
  const funcName = useLocation.identifiers?.[0];

  const newFn = `function ${funcName}(){return ${varName}.words}`;
  const newFile2 =
    newFile1.slice(0, useLocation.startIndex) +
    newFn +
    newFile1.slice(useLocation.endIndex);

  showDiff(
    newFile1,
    newFile2,
    newFn,
    useLocation.startIndex,
    useLocation.endIndex
  );

  return newFile2;
};

const getThinkerFormatLocation = (oldFile: string): LocationResult | null => {
  const approxAreaPattern =
    /spinnerTip:[$\w]+,(?:[$\w]+:[$\w]+,)*overrideMessage:[$\w]+,.{300}/;
  const approxAreaMatch = oldFile.match(approxAreaPattern);

  if (!approxAreaMatch || approxAreaMatch.index == undefined) {
    console.error('patch: thinker format: failed to find approxAreaMatch');
    return null;
  }

  // Search within a range of 600 characters
  const searchSection = oldFile.slice(
    approxAreaMatch.index,
    approxAreaMatch.index + 600
  );

  // New nullish format: N=(Y??C?.activeForm??L)+"…"
  const formatPattern = /([$\w]+)(=\(([^;]{1,200}?)\)\+"…")/;
  const formatMatch = searchSection.match(formatPattern);

  if (!formatMatch || formatMatch.index == undefined) {
    console.error('patch: thinker format: failed to find formatMatch');
    return null;
  }

  return {
    startIndex:
      approxAreaMatch.index + formatMatch.index + formatMatch[1].length,
    endIndex:
      approxAreaMatch.index +
      formatMatch.index +
      formatMatch[1].length +
      formatMatch[2].length,
    identifiers: [formatMatch[3]],
  };
};

export const writeThinkerFormat = (
  oldFile: string,
  format: string
): string | null => {
  const location = getThinkerFormatLocation(oldFile);
  if (!location) {
    return null;
  }
  const fmtLocation = location;

  // See `getThinkerFormatLocation` for an explanation of this.
  const serializedFormat = format.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
  const curExpr = fmtLocation.identifiers?.[0];
  const curFmt =
    '`' + serializedFormat.replace(/\{\}/g, '${' + curExpr + '}') + '`';
  const formatDecl = `=${curFmt}`;

  const newFile =
    oldFile.slice(0, fmtLocation.startIndex) +
    formatDecl +
    oldFile.slice(fmtLocation.endIndex);

  showDiff(
    oldFile,
    newFile,
    formatDecl,
    fmtLocation.startIndex,
    fmtLocation.endIndex
  );
  return newFile;
};

const getThinkerSymbolMirrorOptionLocation = (
  oldFile: string
): LocationResult | null => {
  const mirrorPattern =
    /=\s*\[\.\.\.([$\w]+),\s*\.\.\.?\[\.\.\.\1\]\.reverse\(\)\]/;
  const match = oldFile.match(mirrorPattern);

  if (!match || match.index == undefined) {
    console.error('patch: thinker symbol mirror option: failed to find match');
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    identifiers: [match[1]],
  };
};

export const writeThinkerSymbolMirrorOption = (
  oldFile: string,
  enableMirror: boolean
): string | null => {
  const location = getThinkerSymbolMirrorOptionLocation(oldFile);
  if (!location) {
    return null;
  }

  const varName = location.identifiers?.[0];
  const newArray = enableMirror
    ? `=[...${varName},...[...${varName}].reverse()]`
    : `=[...${varName}]`;

  const newFile =
    oldFile.slice(0, location.startIndex) +
    newArray +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newArray, location.startIndex, location.endIndex);
  return newFile;
};

const getThinkerSymbolWidthLocation = (
  oldFile: string
): LocationResult | null => {
  const widthPattern = /\{flexWrap:"wrap",height:1,width:2\}/;
  const match = oldFile.match(widthPattern);

  if (!match || match.index == undefined) {
    console.error('patch: thinker symbol width: failed to find match');
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
  };
};

export const writeThinkerSymbolWidthLocation = (
  oldFile: string,
  width: number
): string | null => {
  const location = getThinkerSymbolWidthLocation(oldFile);
  if (!location) {
    return null;
  }

  const newCss = `{flexWrap:"wrap",height:1,width:${width}}`;
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newCss +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newCss, location.startIndex, location.endIndex);
  return newFile;
};

// Debug function for showing diffs (currently disabled)
function showDiff(
  oldFileContents: string,
  newFileContents: string,
  injectedText: string,
  startIndex: number,
  endIndex: number
): void {
  const contextStart = Math.max(0, startIndex - 20);
  const contextEndOld = Math.min(oldFileContents.length, endIndex + 20);
  const contextEndNew = Math.min(
    newFileContents.length,
    startIndex + injectedText.length + 20
  );

  const oldBefore = oldFileContents.slice(contextStart, startIndex);
  const oldChanged = oldFileContents.slice(startIndex, endIndex);
  const oldAfter = oldFileContents.slice(endIndex, contextEndOld);

  const newBefore = newFileContents.slice(contextStart, startIndex);
  const newChanged = newFileContents.slice(
    startIndex,
    startIndex + injectedText.length
  );
  const newAfter = newFileContents.slice(
    startIndex + injectedText.length,
    contextEndNew
  );

  if (isDebug()) {
    console.log('\n--- Diff ---');
    console.log('OLD:', oldBefore + `\x1b[31m${oldChanged}\x1b[0m` + oldAfter);
    console.log('NEW:', newBefore + `\x1b[32m${newChanged}\x1b[0m` + newAfter);
    console.log('--- End Diff ---\n');
  }
}

const getVerbosePropertyLocation = (oldFile: string): LocationResult | null => {
  const createElementPattern =
    /createElement\([$\w]+,\{[^}]+spinnerTip[^}]+overrideMessage[^}]+\}/;
  const createElementMatch = oldFile.match(createElementPattern);

  if (!createElementMatch || createElementMatch.index === undefined) {
    console.error(
      'patch: verbose: failed to find createElement with spinnerTip and overrideMessage'
    );
    return null;
  }

  const extractedString = createElementMatch[0];

  const verbosePattern = /verbose:[^,}]+/;
  const verboseMatch = extractedString.match(verbosePattern);

  if (!verboseMatch || verboseMatch.index === undefined) {
    console.error('patch: verbose: failed to find verbose property');
    return null;
  }

  // Calculate absolute positions in the original file
  const absoluteVerboseStart = createElementMatch.index + verboseMatch.index;
  const absoluteVerboseEnd = absoluteVerboseStart + verboseMatch[0].length;

  return {
    startIndex: absoluteVerboseStart,
    endIndex: absoluteVerboseEnd,
  };
};

export const writeVerboseProperty = (oldFile: string): string | null => {
  const location = getVerbosePropertyLocation(oldFile);
  if (!location) {
    return null;
  }

  const newCode = 'verbose:true';
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newCode +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newCode, location.startIndex, location.endIndex);
  return newFile;
};

const getContextLimitLocation = (oldFile: string): LocationResult | null => {
  // Pattern: function funcName(paramName){if(paramName.includes("[1m]"))return 1e6;return 200000}
  // Or: function funcName(paramName){return 200000}
  const pattern =
    /function ([$\w]+)\(([$\w]*)\)\{((?:if\([$\w]+\.includes\("\[1m\]"\)\)return 1e6;)?return 200000)\}/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error('patch: context limit: failed to find match');
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    identifiers: [match[1], match[2], match[3]], // funcName, paramName, oldBody
  };
};

export const writeContextLimit = (oldFile: string): string | null => {
  const location = getContextLimitLocation(oldFile);
  if (!location) {
    return null;
  }

  const funcName = location.identifiers?.[0];
  const paramName = location.identifiers?.[1];
  const oldBody = location.identifiers?.[2];

  const newFnDef = `function ${funcName}(${paramName}){if(process.env.CLAUDE_CODE_CONTEXT_LIMIT)return Number(process.env.CLAUDE_CODE_CONTEXT_LIMIT);${oldBody}}`;

  const newFile =
    oldFile.slice(0, location.startIndex) +
    newFnDef +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newFnDef, location.startIndex, location.endIndex);
  return newFile;
};

export const findChalkVar = (fileContents: string): string | undefined => {
  // Find chalk variable using the counting method
  const chalkPattern =
    /([$\w]+)(?:\.(?:cyan|gray|green|red|yellow|ansi256|bgAnsi256|bgHex|bgRgb|hex|rgb|bold|dim|inverse|italic|strikethrough|underline)\b)+\(/g;
  const chalkMatches = Array.from(fileContents.matchAll(chalkPattern));

  // Count occurrences of each variable
  const chalkCounts: Record<string, number> = {};
  for (const match of chalkMatches) {
    const varName = match[1];
    chalkCounts[varName] = (chalkCounts[varName] || 0) + 1;
  }

  // Find the variable with the most occurrences
  let chalkVar;
  let maxCount = 0;
  for (const [varName, count] of Object.entries(chalkCounts)) {
    if (count > maxCount) {
      maxCount = count;
      chalkVar = varName;
    }
  }
  return chalkVar;
};

const getUserMessageDisplayLocation = (
  oldFile: string
): {
  minWidthLocation: LocationResult | null;
  prefixLocation: LocationResult | null;
  messageLocation: LocationResult | null;
} | null => {
  // Search for the exact error message to find the component
  const errorPattern = /No content found in user prompt message/;
  const errorMatch = oldFile.match(errorPattern);

  if (!errorMatch || errorMatch.index === undefined) {
    console.error('patch: userMessageDisplay: failed to find error message');
    return null;
  }

  // Get 400 characters after the error message as instructed
  const searchStart = errorMatch.index;
  const searchEnd = Math.min(oldFile.length, searchStart + 400);
  const searchSection = oldFile.slice(searchStart, searchEnd);

  // Find the minWidth pattern: {minWidth:2,width:2} (no spaces in minified code)
  const minWidthPattern = /\{minWidth:(\d+),width:\d+\}/;
  const minWidthMatch = searchSection.match(minWidthPattern);

  if (!minWidthMatch || minWidthMatch.index === undefined) {
    console.error('patch: userMessageDisplay: failed to find minWidth pattern');
    return null;
  }

  // Find the prefix pattern - try multiple variations based on minified code patterns
  const prefixPattern = /createElement\(\w+,\{color:"[^"]*"\},"([^"]+)"\)/;
  const prefixMatch = searchSection.match(prefixPattern);

  // Find the message pattern: T,{color:"...",wrap:"wrap"},B.trim()) (captures the entire T component)
  const messagePattern =
    /(createElement\(\w+,\{[^}]*color:"[^"]*"[^}]*\},(\w+)\.trim\(\))/;
  const messageMatch = searchSection.match(messagePattern);

  return {
    minWidthLocation: minWidthMatch
      ? {
          startIndex: searchStart + minWidthMatch.index,
          endIndex: searchStart + minWidthMatch.index + minWidthMatch[0].length,
        }
      : minWidthMatch,
    prefixLocation: prefixMatch
      ? {
          startIndex: searchStart + prefixMatch.index!,
          endIndex: searchStart + prefixMatch.index! + prefixMatch[0].length,
        }
      : null,
    messageLocation: messageMatch
      ? {
          startIndex: searchStart + messageMatch.index!,
          endIndex: searchStart + messageMatch.index! + messageMatch[0].length,
        }
      : messageMatch,
  };
};

export const writeUserMessageDisplay = (
  oldFile: string,
  prefix: string,
  prefixColor: string,
  prefixBackgroundColor: string,
  prefixBold: boolean = false,
  prefixItalic: boolean = false,
  prefixUnderline: boolean = false,
  prefixStrikethrough: boolean = false,
  prefixInverse: boolean = false,
  messageColor: string,
  messageBackgroundColor: string,
  messageBold: boolean = false,
  messageItalic: boolean = false,
  messageUnderline: boolean = false,
  messageStrikethrough: boolean = false,
  messageInverse: boolean = false
): string | null => {
  const location = getUserMessageDisplayLocation(oldFile);
  if (!location) {
    console.error(
      'patch: userMessageDisplay: getUserMessageDisplayLocation returned null'
    );
    return null;
  }

  if (!location.minWidthLocation) {
    console.error(
      'patch: userMessageDisplay: failed to find minWidth location'
    );
    return null;
  }
  if (!location.prefixLocation) {
    console.error('patch: userMessageDisplay: failed to find prefix location');
    return null;
  }
  if (!location.messageLocation) {
    console.error('patch: userMessageDisplay: failed to find message location');
    return null;
  }

  const chalkVar = findChalkVar(oldFile);
  if (!chalkVar) {
    console.error('patch: userMessageDisplay: failed to find chalk variable');
    return null;
  }

  const modifications: ModificationEdit[] = [];

  // 1. Update minWidth and width (minified format)
  modifications.push({
    startIndex: location.minWidthLocation.startIndex,
    endIndex: location.minWidthLocation.endIndex,
    newContent: `{minWidth:${prefix.length + 1},width:${prefix.length + 1}}`,
  });

  // Build chalk chains with formatting
  const prefixChalkChain = buildChalkChain(
    chalkVar,
    prefixColor.match(/\d+/g)?.join(',') || '153,153,153', // default gray
    prefixBackgroundColor === 'transparent'
      ? null
      : prefixBackgroundColor.match(/\d+/g)?.join(',') || null,
    prefixBold,
    prefixItalic,
    prefixUnderline,
    prefixStrikethrough,
    prefixInverse
  );
  const messageChalkChain = buildChalkChain(
    chalkVar,
    messageColor.match(/\d+/g)?.join(',') || '153,153,153', // default gray
    messageBackgroundColor === 'transparent'
      ? null
      : messageBackgroundColor.match(/\d+/g)?.join(',') || null,
    messageBold,
    messageItalic,
    messageUnderline,
    messageStrikethrough,
    messageInverse
  );

  // 2. Update prefix with chalk wrapping (preserve original structure)
  // Reconstruct the prefix replacement based on the original pattern found
  // For createElement patterns: createElement(O,{color:"secondaryText"},">"
  // Replace with: createElement(O,{color:"secondaryText"},chalkVar("prefix"))
  modifications.push({
    startIndex: location.prefixLocation.startIndex,
    endIndex: location.prefixLocation.endIndex,
    // Replace the old prefix with the new.
    newContent: oldFile
      .slice(
        location.prefixLocation.startIndex,
        location.prefixLocation.endIndex
      )
      .replace(/"([^"]+)"\)$/, `${prefixChalkChain}("${prefix}"))`),
  });

  // 3. Update message with chalk wrapping (preserve original structure)
  // For createElement patterns: createElement(O,{color:"secondaryText",wrap:"wrap"},B.trim())
  // Replace with: createElement(O,{color:"secondaryText",wrap:"wrap"},chalkVar(B.trim()))
  modifications.push({
    startIndex: location.messageLocation.startIndex,
    endIndex: location.messageLocation.endIndex,
    // Replace the old message format with the new.
    newContent: oldFile
      .slice(
        location.messageLocation.startIndex,
        location.messageLocation.endIndex
      )
      .replace(/(\w+\.trim\(\))/, `${messageChalkChain}($1)`),
  });

  // Sort modifications by startIndex in descending order to avoid index shifting issues
  modifications.sort((a, b) => b.startIndex - a.startIndex);

  // Apply modifications
  let newFile = oldFile;
  for (const mod of modifications) {
    const before = newFile;
    newFile =
      newFile.slice(0, mod.startIndex) +
      mod.newContent +
      newFile.slice(mod.endIndex);

    showDiff(before, newFile, mod.newContent, mod.startIndex, mod.endIndex);
  }

  return newFile;
};

const getInputBoxBorderLocation = (oldFile: string): LocationResult | null => {
  // First find the approximate area with the input box characteristics
  const approxAreaPattern = /borderColor:[$\w]+==="bash"/;
  const approxAreaMatch = oldFile.match(approxAreaPattern);

  if (!approxAreaMatch || approxAreaMatch.index === undefined) {
    console.error('patch: input border: failed to find approxAreaMatch');
    return null;
  }

  // Search within a range of characters around the match for borderStyle:"round"
  const searchStart = approxAreaMatch.index;
  const searchEnd = Math.min(oldFile.length, searchStart + 200);
  const searchSection = oldFile.slice(searchStart, searchEnd);

  const borderStylePattern = /borderStyle:"round"/;
  const borderStyleMatch = searchSection.match(borderStylePattern);

  if (!borderStyleMatch || borderStyleMatch.index === undefined) {
    console.error('patch: input border: failed to find borderStyle in section');
    return null;
  }

  // Calculate absolute position in the original file
  const absoluteStart = searchStart + borderStyleMatch.index;
  const absoluteEnd = absoluteStart + borderStyleMatch[0].length;

  return {
    startIndex: absoluteStart,
    endIndex: absoluteEnd,
  };
};

export const writeInputBoxBorder = (
  oldFile: string,
  removeBorder: boolean
): string | null => {
  const location = getInputBoxBorderLocation(oldFile);
  if (!location) {
    return null;
  }

  // If removeBorder is true, change to "none" and add marginBottom, otherwise keep "round"
  const newBorderStyle = removeBorder
    ? 'borderStyle:undefined,marginBottom:1'
    : 'borderStyle:"round"';

  const newFile =
    oldFile.slice(0, location.startIndex) +
    newBorderStyle +
    oldFile.slice(location.endIndex);

  showDiff(
    oldFile,
    newFile,
    newBorderStyle,
    location.startIndex,
    location.endIndex
  );

  return newFile;
};

export const applyCustomization = async (
  config: TweakccConfig,
  ccInstInfo: ClaudeCodeInstallationInfo
): Promise<TweakccConfig> => {
  // Clean up any existing customizations, which will likely break the heuristics, by restoring the
  // original file from the backup.
  await restoreClijsFromBackup(ccInstInfo);

  let content = await fs.readFile(ccInstInfo.cliPath, { encoding: 'utf8' });

  // Apply themes
  let result: string | null = null;
  if (config.settings.themes && config.settings.themes.length > 0) {
    if ((result = writeThemes(content, config.settings.themes)))
      content = result;
  }

  // Apply launch text
  if (config.settings.launchText) {
    const c = config.settings.launchText;
    let textToApply = '';
    if (c.method === 'custom' && c.customText) {
      textToApply = c.customText;
    } else if (c.method === 'figlet' && c.figletText) {
      textToApply = await new Promise<string>(resolve =>
        figlet.text(
          c.figletText.replace('\n', ' '),
          c.figletFont as unknown as figlet.Fonts,
          (err, data) => {
            if (err) {
              console.error('patch: figlet: failed to generate text', err);
              resolve('');
            } else {
              resolve(data || '');
            }
          }
        )
      );
    }
    if ((result = writeSigninBannerText(content, textToApply)))
      content = result;

    // Also apply customText to welcome message if it's defined
    const welcomeMessage = c.method === 'custom' ? c.customText : c.figletText;
    if (welcomeMessage) {
      if ((result = writeWelcomeMessage(content, welcomeMessage)))
        content = result;
    }
  }

  // Apply thinking verbs
  // prettier-ignore
  if (config.settings.thinkingVerbs) {
    if ((result = writeThinkerVerbs(content, config.settings.thinkingVerbs.verbs)))
      content = result;
    if ((result = writeThinkerFormat(content, config.settings.thinkingVerbs.format)))
      content = result;
  }

  // Apply thinking style
  // prettier-ignore
  if ((result = writeThinkerSymbolChars(content, config.settings.thinkingStyle.phases)))
    content = result;
  // prettier-ignore
  if ((result = writeThinkerSymbolSpeed(content, config.settings.thinkingStyle.updateInterval)))
    content = result;
  // prettier-ignore
  if ((result = writeThinkerSymbolWidthLocation(content, Math.max(...config.settings.thinkingStyle.phases.map(p => p.length)) + 1)))
    content = result;
  // prettier-ignore
  if ((result = writeThinkerSymbolMirrorOption(content, config.settings.thinkingStyle.reverseMirror)))
    content = result;

  // Apply user message display customization
  if (config.settings.userMessageDisplay) {
    if (
      (result = writeUserMessageDisplay(
        content,
        config.settings.userMessageDisplay.prefix.format,
        config.settings.userMessageDisplay.prefix.foreground_color,
        config.settings.userMessageDisplay.prefix.background_color,
        config.settings.userMessageDisplay.prefix.styling.includes('bold'),
        config.settings.userMessageDisplay.prefix.styling.includes('italic'),
        config.settings.userMessageDisplay.prefix.styling.includes('underline'),
        config.settings.userMessageDisplay.prefix.styling.includes(
          'strikethrough'
        ),
        config.settings.userMessageDisplay.prefix.styling.includes('inverse'),
        config.settings.userMessageDisplay.message.foreground_color,
        config.settings.userMessageDisplay.message.background_color,
        config.settings.userMessageDisplay.message.styling.includes('bold'),
        config.settings.userMessageDisplay.message.styling.includes('italic'),
        config.settings.userMessageDisplay.message.styling.includes(
          'underline'
        ),
        config.settings.userMessageDisplay.message.styling.includes(
          'strikethrough'
        ),
        config.settings.userMessageDisplay.message.styling.includes('inverse')
      ))
    ) {
      content = result;
    }
  }

  // Apply input box border customization
  console.log(config.settings.inputBox)
  if (
    config.settings.inputBox &&
    typeof config.settings.inputBox.removeBorder === 'boolean'
  ) {
    if (
      (result = writeInputBoxBorder(
        content,
        config.settings.inputBox.removeBorder
      ))
    )
      content = result;
  }

  // Apply verbose property patch (always true by default)
  if ((result = writeVerboseProperty(content))) content = result;

  // Apply spinner no-freeze patch (always enabled)
  if ((result = writeSpinnerNoFreeze(content))) content = result;

  // Apply context limit patch (always enabled)
  if ((result = writeContextLimit(content))) content = result;

  await fs.writeFile(ccInstInfo.cliPath, content);
  return await updateConfigFile(config => {
    config.changesApplied = true;
  });
};
