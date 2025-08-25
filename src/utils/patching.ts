import figlet from 'figlet';
import * as fs from 'node:fs/promises';
import { restoreClijsFromBackup, updateConfigFile } from './config.js';
import { ClaudeCodeInstallationInfo, Theme, TweakccConfig } from './types.js';
import { isDebug } from './misc.js';

export interface LocationResult {
  startIndex: number;
  endIndex: number;
  variableName?: string;
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
      variableName: switchMatch[1].trim(),
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
  let switchStatement = `switch(${locations.switchStatement.variableName}){\n`;
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

const getThinkerVerbsLocation = (
  oldFile: string
): { verbsLocation: LocationResult; varName: string } | null => {
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
    /\b([$\w]+)=\{words:\[(?:"[^"{}()]+ing",)+"[^"{}()]+ing"\]\}/s;

  const verbsMatch = oldFile.match(verbsPattern);
  if (!verbsMatch || verbsMatch.index == undefined) {
    console.error('patch: thinker verbs: failed to find verbsMatch');
    return null;
  }

  return {
    verbsLocation: {
      startIndex: verbsMatch.index,
      endIndex: verbsMatch.index + verbsMatch[0].length,
    },
    varName: verbsMatch[1],
  };
};

const getThinkerVerbsUseLocation = (
  oldFile: string
): { useLocation: LocationResult; funcName: string } | null => {
  // This is brittle but it's easy.
  // It's a function that returns either new verbs from Statsig (a/b testing) or the default verbs.
  // When we write the file we'll just write a new function.
  const pattern =
    /function (\w+)\(\)\{return \w+\("tengu_spinner_words",\w+\)\.words\}/;
  const match = oldFile.match(pattern);

  if (!match || match.index == undefined) {
    console.error('patch: thinker verbs: failed to find match');
    return null;
  }

  return {
    useLocation: {
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    },
    funcName: match[1],
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
  const { verbsLocation, varName } = location1;

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
  const { useLocation, funcName } = location2;

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

const getThinkerFormatLocation = (
  oldFile: string
): {
  fmtLocation: LocationResult;
  cond: string;
  curVerb1: string;
  curVerb2: string;
} | null => {
  const approxAreaPattern =
    /spinnerTip:\w+,(?:\w+:\w+,)*overrideMessage:\w+,.{300}/;
  const approxAreaMatch = oldFile.match(approxAreaPattern);

  if (!approxAreaMatch || approxAreaMatch.index == undefined) {
    console.error('patch: thinker format: failed to find approxAreaMatch');
    return null;
  }

  // Search within a range of 400 characters
  const searchSection = oldFile.slice(
    approxAreaMatch.index,
    approxAreaMatch.index + 400
  );

  // Example: =L?L.activeForm+"…":(Z||R)+"…"
  //           ^   ^^^^^^^^^^     ^^^^^^
  // We extract the above three highlighted fields and then rewrite the conditional using backticks;
  // see below in `writeThinkerFormat()`.
  const formatPattern = /=(\w+)\?([^={}?]+?)\+"…":(.+?)\+"…"/;
  const formatMatch = searchSection.match(formatPattern);

  if (!formatMatch || formatMatch.index == undefined) {
    console.error('patch: thinker format: failed to find formatMatch');
    return null;
  }

  return {
    fmtLocation: {
      startIndex: approxAreaMatch.index + formatMatch.index,
      endIndex:
        approxAreaMatch.index + formatMatch.index + formatMatch[0].length,
    },
    cond: formatMatch[1],
    curVerb1: formatMatch[2],
    curVerb2: formatMatch[3],
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
  const { fmtLocation, cond, curVerb1, curVerb2 } = location;

  // See `getThinkerFormatLocation` for an explanation of this.
  const serializedFormat = format.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
  const curVerb1Fmt =
    '`' + serializedFormat.replace(/\{\}/g, '${' + curVerb1 + '}') + '`';
  const curVerb2Fmt =
    '`' + serializedFormat.replace(/\{\}/g, '${' + curVerb2 + '}') + '`';
  const formatDecl = `=${cond}?${curVerb1Fmt}:${curVerb2Fmt}`;

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
    /=\s*\[\.\.\.(\w+),\s*\.\.\.?\[\.\.\.\1\]\.reverse\(\)\]/;
  const match = oldFile.match(mirrorPattern);

  if (!match || match.index == undefined) {
    console.error('patch: thinker symbol mirror option: failed to find match');
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    variableName: match[1],
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

  const varName = location.variableName;
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

  // Apply verbose property patch (always true by default)
  if ((result = writeVerboseProperty(content))) content = result;

  await fs.writeFile(ccInstInfo.cliPath, content);
  return await updateConfigFile(config => {
    config.changesApplied = true;
  });
};
