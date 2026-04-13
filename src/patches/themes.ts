// Please see the note about writing patches in ./index

import { Theme } from '../types';
import { LocationResult, showDiff } from './index';

function getThemesLocation(oldFile: string): {
  switchStatement: LocationResult;
  objArr: LocationResult;
  obj: LocationResult;
} | null {
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
  // Both old and new: [{label:"...",value:"..."}, ...] or [{"label":"...",...]
  const objArrPat =
    /\[(?:\.\.\.\[\],)?(?:\{"?label"?:"(?:Dark|Light|Auto|Monochrome)[^"]*","?value"?:"[^"]+"\},?)+\]/;
  const objArrMatch = oldFile.match(objArrPat);

  if (!objArrMatch || objArrMatch.index == undefined) {
    console.error('patch: themes: failed to find objArrMatch');
    return null;
  }

  // === Theme Name Mapping Object ===
  // {dark:"Dark mode",...} or {"dark":"Dark mode",...}
  const objPat =
    /(?:return|[$\w]+=)\{(?:"?(?:[$\w-]+)"?:"(?:Auto |Dark|Light|Monochrome)[^"]*",?)+\}/;
  const objMatch = oldFile.match(objPat);

  if (!objMatch || objMatch.index == undefined) {
    console.error('patch: themes: failed to find objMatch');
    return null;
  }

  return {
    switchStatement: {
      startIndex: switchStart,
      endIndex: switchEnd,
      identifiers: [switchIdent],
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
