// Please see the note about writing patches in ./index

import { Theme } from '../types';
import { LocationResult, showDiff } from './index';

type ThemesLocation = {
  switchStatement: LocationResult;
  objArr: LocationResult & { isAssemblyPrefix?: boolean };
  obj: LocationResult & { prefix: string };
};

function getThemesLocation(oldFile: string): ThemesLocation | null {
  // === Switch Statement ===
  // CC >=2.1.83: switch(A){case"light":return LX9;...default:return CX9}
  // CC <2.1.83: switch(A){case"light":return{...};...}
  let switchStart = -1;
  let switchEnd = -1;
  let switchIdent = '';

  // Try new format first (variable references)
  const newSwitchPat =
    /switch\(([$\w]+)\)\{case"(?:light|dark)":[^}]*return [$\w]+;[^}]*default:return [$\w]+\}/;
  const newSwitchMatch = oldFile.match(newSwitchPat);

  if (newSwitchMatch && newSwitchMatch.index != undefined) {
    switchStart = newSwitchMatch.index;
    switchEnd = switchStart + newSwitchMatch[0].length;
    switchIdent = newSwitchMatch[1];
  } else {
    // Try old format (inline objects) — use brace counting
    const oldAnchor = oldFile.indexOf('case"dark":return{"autoAccept"');
    if (oldAnchor === -1) {
      const oldAnchor2 = oldFile.indexOf('case"light":return{');
      if (oldAnchor2 === -1) {
        console.error('patch: themes: failed to find switchMatch');
        return null;
      }
    }
    const anchor =
      oldFile.indexOf('case"dark":return{') !== -1
        ? oldFile.indexOf('case"dark":return{')
        : oldFile.indexOf('case"light":return{');

    const before = oldFile.slice(Math.max(0, anchor - 200), anchor);
    const switchOpen = before.match(/switch\(([$\w]+)\)\{\s*$/);
    if (!switchOpen || switchOpen.index == undefined) {
      console.error('patch: themes: failed to find switchMatch (old format)');
      return null;
    }
    switchStart = Math.max(0, anchor - 200) + switchOpen.index;
    switchIdent = switchOpen[1];
    let depth = 0;
    for (
      let i = switchStart;
      i < oldFile.length && i < switchStart + 50000;
      i++
    ) {
      if (oldFile[i] === '{') depth++;
      if (oldFile[i] === '}') {
        depth--;
        if (depth === 0) {
          switchEnd = i + 1;
          break;
        }
      }
    }
  }

  if (switchStart === -1 || switchEnd === -1) {
    console.error('patch: themes: failed to find switchMatch');
    return null;
  }

  // === Theme Options Array ===
  // Old format: [{label:"Dark mode",value:"dark"},{label:"Light mode",value:"light"},...]
  // New format (CC >=2.1.92): HH=[{label:"Auto (match terminal)",value:"auto"}] only,
  //   with individual vars DH,YH,... spread in assembly: e=[...HH,DH,YH,...,...X.map(kB1),...FH]
  const objArrPat =
    /\[(?:\.\.\.\[\],)?(?:\{"?label"?:"(?:Dark|Light|Auto|Monochrome)[^"]*","?value"?:"[^"]+"\},?)+\]/;
  const objArrMatch = oldFile.match(objArrPat);

  if (!objArrMatch || objArrMatch.index == undefined) {
    console.error('patch: themes: failed to find objArrMatch');
    return null;
  }

  // Check if new assembly format: objArr has only 1 item (just "auto" option)
  let objArrLocation: LocationResult & { isAssemblyPrefix?: boolean } = {
    startIndex: objArrMatch.index,
    endIndex: objArrMatch.index + objArrMatch[0].length,
  };
  // Count items by object-opening label key to avoid false positives from
  // label text that happens to contain the substring "value:".
  const objArrItemCount = (objArrMatch[0].match(/\{"?label"?:/g) || []).length;
  if (objArrItemCount === 1) {
    // Find the variable name holding this single-item array (e.g. "HH")
    const beforeObjArr = oldFile.slice(
      Math.max(0, objArrMatch.index - 30),
      objArrMatch.index
    );
    const varNameMatch = beforeObjArr.match(/([A-Za-z_$][\w$]*)=$/);
    if (!varNameMatch) {
      console.error('patch: themes: failed to find auto-option variable name');
      return null;
    }
    const autoVarName = varNameMatch[1].replace(/[$]/g, '\\$');
    // Find assembly: [...autoVar, theme1, theme2, ..., ...customThemes.map(
    const assemblyPat = new RegExp(
      `\\[\\.\\.\\.${autoVarName}(?:,[A-Za-z_$][\\w$]*){1,},\\.\\.\\.`
    );
    const assemblyMatch = oldFile.match(assemblyPat);
    if (!assemblyMatch || assemblyMatch.index == undefined) {
      console.error(
        `patch: themes: failed to find assembly spread for variable "${varNameMatch[1]}"`
      );
      return null;
    }
    // assemblyMatch[0] ends with ",..." — endIndex is right before "..."
    // Replacement "[{theme},..." joins cleanly with remaining "...X.map(kB1),...FH]"
    objArrLocation = {
      startIndex: assemblyMatch.index,
      endIndex: assemblyMatch.index + assemblyMatch[0].length - 3,
      isAssemblyPrefix: true,
    };
  }

  // === Theme Name Mapping Object ===
  // Old: return{dark:"Dark mode",...}
  // New (CC >=2.1.92): VAR={auto:"Auto...",dark:"Dark mode",...}
  // Capture group 1 holds the prefix so we can preserve it in the replacement.
  const objPat =
    /(return|[$\w]+=)\{(?:"?(?:[$\w-]+)"?:"(?:Auto |Dark|Light|Monochrome)[^"]*",?)+\}/;
  const objMatch = oldFile.match(objPat);

  if (!objMatch || objMatch.index == undefined) {
    console.error('patch: themes: failed to find objMatch');
    return null;
  }

  // Preserve the original prefix (either "return" or "VARNAME=")
  const objPrefix = objMatch[1];

  return {
    switchStatement: {
      startIndex: switchStart,
      endIndex: switchEnd,
      identifiers: [switchIdent],
    },
    objArr: objArrLocation,
    obj: {
      startIndex: objMatch.index,
      endIndex: objMatch.index + objMatch[0].length,
      prefix: objPrefix,
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
  // Preserve the original prefix ("return" or "VARNAME=") to avoid turning a
  // module-level variable assignment into an invalid return statement.
  const obj =
    locations.obj.prefix +
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
  // In new assembly format (CC >=2.1.92), objArr points to the prefix of the
  // spread expression "[...auto,theme1,...,themeN," (endIndex is just before
  // the custom-themes spread "...U.map(...)").  We emit an open array without
  // the closing "]" so the existing suffix "...U.map(kB1),...FH]" completes it.
  const themeItems = JSON.stringify(
    themes.map(theme => ({ label: theme.name, value: theme.id }))
  );
  const objArr = locations.objArr.isAssemblyPrefix
    ? themeItems.slice(0, -1) + ',' // "[{...},"  — no closing ], suffix provides it
    : themeItems;
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
