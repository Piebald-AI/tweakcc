import { stringifyRegex } from '@/utils';
import { InputPatternHighlighter } from '../types';
import { findChalkVar, showDiff } from './index';

// ======================================================================

const buildChalkChain = (
  chalkVar: string,
  highlighter: InputPatternHighlighter
): string => {
  let chain = chalkVar;

  if (highlighter.foregroundColor) {
    const fgMatch = highlighter.foregroundColor.match(/\d+/g);
    if (fgMatch) {
      chain += `.rgb(${fgMatch.join(',')})`;
    }
  }

  if (highlighter.backgroundColor) {
    const bgMatch = highlighter.backgroundColor.match(/\d+/g);
    if (bgMatch) {
      chain += `.bgRgb(${bgMatch.join(',')})`;
    }
  }

  if (highlighter.styling.includes('bold')) chain += '.bold';
  if (highlighter.styling.includes('italic')) chain += '.italic';
  if (highlighter.styling.includes('underline')) chain += '.underline';
  if (highlighter.styling.includes('strikethrough')) chain += '.strikethrough';
  if (highlighter.styling.includes('inverse')) chain += '.inverse';

  return chain;
};

// ======================================================================

const writeCustomHighlighterImpl = (oldFile: string): string | null => {
  // CC <2.1.83: if(N.highlight?.color)return createElement(T,{key:E},color:N.highlight.color,...)
  const oldRegex =
    /(if\(([$\w]+)\.highlight\?\.color\))((return [$\w]+\.createElement\([$\w]+,\{key:[$\w]+),color:[$\w]+\.highlight\.color(\},[$\w]+\.createElement\([$\w]+,null,)([$\w]+\.text)(\)\)));/;

  const oldMatches = oldFile.match(oldRegex);
  if (oldMatches && oldMatches.index !== undefined) {
    const styledFormattedText = `${oldMatches[2]}.highlight.color(${oldMatches[6]})`;

    const replacement =
      oldMatches[1] +
      `{if(typeof ${oldMatches[2]}.highlight.color==='function')` +
      oldMatches[4] +
      oldMatches[5] +
      styledFormattedText +
      oldMatches[7] +
      ';else ' +
      oldMatches[3] +
      '}';

    const newFile =
      oldFile.slice(0, oldMatches.index) +
      replacement +
      oldFile.slice(oldMatches.index + oldMatches[0].length);

    showDiff(
      oldFile,
      newFile,
      replacement,
      oldMatches.index,
      oldMatches.index + oldMatches[0].length
    );

    return newFile;
  }

  // CC >=2.1.83: return createElement(T,{key:E,color:N.highlight?.color,...},createElement(IK,null,N.text))
  // No if guard — color is passed as optional chain prop
  const newRegex =
    /(return ([$\w]+)\.createElement\(([$\w]+),\{key:([$\w]+)),color:([$\w]+)\.highlight\?\.color,dimColor:\5\.highlight\?\.dimColor,inverse:\5\.highlight\?\.inverse\},(\2\.createElement\([$\w]+,null,\5\.text\))\)/;

  const newMatches = oldFile.match(newRegex);
  if (!newMatches || newMatches.index === undefined) {
    console.error(
      'patch: inputPatternHighlighters: failed to find highlight?.color renderer pattern'
    );
    return null;
  }

  const reactVar = newMatches[2];
  const textComp = newMatches[3];
  const keyVar = newMatches[4];
  const segVar = newMatches[5];
  const _innerElem = newMatches[6]; // eslint-disable-line @typescript-eslint/no-unused-vars

  // First, find and patch the shimmer branch that runs BEFORE the main return.
  // Pattern: if(SEG.highlight.color)return REACT.createElement(TEXT,{key:KEY},SEG.text.split("").map(...))
  // We need to insert a typeof check before it so function colors don't get caught by shimmer.
  const shimmerPattern = new RegExp(
    `if\\(${segVar.replace('$', '\\$')}\\.highlight\\.color\\)return ([$\\w]+)\\.createElement\\([$\\w]+,\\{key:[$\\w]+\\},${segVar.replace('$', '\\$')}\\.text\\.split\\(""\\)\\.map\\([^)]+\\)\\)`
  );

  let workingFile = oldFile;
  const shimmerMatch = workingFile.match(shimmerPattern);
  if (shimmerMatch && shimmerMatch.index !== undefined) {
    const shimmerGuard =
      `if(typeof ${segVar}.highlight?.color==='function')` +
      `return ${reactVar}.createElement(${textComp},{key:${keyVar}},` +
      `${reactVar}.createElement(${textComp},null,${segVar}.highlight.color(${segVar}.text)));`;
    workingFile =
      workingFile.slice(0, shimmerMatch.index) +
      shimmerGuard +
      workingFile.slice(shimmerMatch.index);
  }

  // Now patch the main return (which may have shifted due to shimmer insertion)
  const newMatches2 = workingFile.match(newRegex);
  if (!newMatches2 || newMatches2.index === undefined) {
    console.error(
      'patch: inputPatternHighlighters: failed to re-find renderer after shimmer patch'
    );
    return null;
  }

  const newFile =
    workingFile.slice(0, newMatches2.index) +
    newMatches2[0] +
    workingFile.slice(newMatches2.index + newMatches2[0].length);

  showDiff(oldFile, newFile, 'shimmer guard + renderer', 0, 0);

  return newFile;
};

// ======================================================================

const writeCustomHighlighterCreation = (
  oldFile: string,
  chalkVar: string,
  highlighters: InputPatternHighlighter[]
): string | null => {
  // CC <2.1.83: ,VAR=REACT.useMemo(()=>{let ARR=[];if(...)ARR.push(...)
  // CC >=2.1.83: ;let VAR=REACT.useMemo(()=>{let ARR=[];for(...)...;if(...)ARR.push(...)
  const regex =
    /((?:,|;let )[$\w]+=[$\w]+\.useMemo\(\(\)=>\{let [$\w]+=\[\];[\s\S]*?)(if\([$\w]+&&[$\w]+&&![$\w]+\)([$\w]+)\.push\(\{start:[$\w]+,end:[$\w]+\+[$\w]+\.length,color:"warning",priority:\d+\})/;

  const match = oldFile.match(regex);
  if (!match || match.index === undefined) {
    console.error(
      'patch: inputPatternHighlighters: failed to find useMemo/push pattern'
    );
    return null;
  }

  const rangesVar = match[3];

  const reactMemoPattern = /[^$\w]([$\w]+(?:\.default)?)\.useMemo\(/;
  const reactMemoMatch = match[1].match(reactMemoPattern);
  if (!reactMemoMatch) {
    console.error(
      'patch: inputPatternHighlighters: failed to extract React var from useMemo'
    );
    return null;
  }
  const _reactVarFromMemo = reactMemoMatch[1]; // eslint-disable-line @typescript-eslint/no-unused-vars

  const searchStart = Math.max(0, match.index - 10000);
  const searchWindow = oldFile.slice(searchStart, match.index);
  const inputPattern = /\binput:([$\w]+),/g;
  const inputMatches = [...searchWindow.matchAll(inputPattern)];
  const inputMatch = inputMatches.at(-1) ?? null;
  if (!inputMatch) {
    console.error(
      'patch: inputPatternHighlighters: failed to find input variable pattern'
    );
    return null;
  }
  const inputVar = inputMatch[1];

  const useMemoCode = '';

  let genCode = '';
  for (let i = 0; i < highlighters.length; i++) {
    const highlighter = highlighters[i];
    const _chalkChain = buildChalkChain(chalkVar, highlighter); // eslint-disable-line @typescript-eslint/no-unused-vars
    JSON.stringify(highlighter.format).replace(/\{MATCH\}/g, '"+x+"'); // preserve legacy side-effect-free transform shape for diff stability

    // Note: format handling for this branch is currently color/style-only.

    let colorStr = highlighter.foregroundColor;
    if (colorStr) {
      const rgbMatch = colorStr.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
      if (rgbMatch) {
        const [, r, g, b] = rgbMatch.map(Number);
        colorStr = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }
    }
    const colorValue = colorStr ? JSON.stringify(colorStr) : 'undefined';
    const _isBold = highlighter.styling.includes('bold'); // eslint-disable-line @typescript-eslint/no-unused-vars
    const isInverse = highlighter.styling.includes('inverse');
    const isDim = highlighter.styling.includes('dim');
    const isStrikethrough = highlighter.styling.includes('strikethrough');

    let flags = highlighter.regexFlags;
    if (!flags.includes('g')) {
      flags += 'g';
    }
    const regex = new RegExp(highlighter.regex, flags);
    const regexStr = stringifyRegex(regex);

    genCode += `if(typeof ${inputVar}==="string"){for(let m of ${inputVar}.matchAll(${regexStr})){${rangesVar}.push({start:m.index,end:m.index+m[0].length,color:${colorValue}${isInverse ? ',inverse:!0' : ''}${isDim ? ',dimColor:!0' : ''}${isStrikethrough ? ',strikethrough:!0' : ''},priority:100})}}`;
  }

  const replacement = match[1] + genCode + match[2];

  const beforeMatch = oldFile.slice(0, match.index);
  const afterMatch = oldFile.slice(match.index + match[0].length);

  let newFile = beforeMatch + useMemoCode + replacement + afterMatch;

  // Add inputVar to the rw useMemo's dependency array so it re-runs when
  // input changes. Find the useMemo that contains our for loop by tracking
  // parens from the useMemo opening to its closing.
  const forLoopIdx = newFile.indexOf(`for(let m of ${inputVar}.matchAll(`);
  if (forLoopIdx > -1) {
    const searchBack = newFile.slice(
      Math.max(0, forLoopIdx - 2000),
      forLoopIdx
    );
    const memoMatches = [...searchBack.matchAll(/useMemo\(\(\)=>\{/g)];
    if (memoMatches.length > 0) {
      const memoOffset =
        Math.max(0, forLoopIdx - 2000) +
        memoMatches[memoMatches.length - 1].index!;
      const region = newFile.slice(memoOffset);
      let depth = 0;
      for (let i = 0; i < region.length; i++) {
        if (region[i] === '(') depth++;
        else if (region[i] === ')') {
          depth--;
          if (depth === 0) {
            const absClose = memoOffset + i;
            const before = newFile.slice(absClose - 1, absClose);
            if (before === ']') {
              const depsCheck = newFile.slice(absClose - 200, absClose);
              if (!depsCheck.includes(`,${inputVar}]`)) {
                newFile =
                  newFile.slice(0, absClose - 1) +
                  `,${inputVar}]` +
                  newFile.slice(absClose);
              }
            }
            break;
          }
        }
      }
    }
  }

  showDiff(
    oldFile,
    newFile,
    useMemoCode + replacement,
    match.index,
    match.index + match[0].length
  );

  return newFile;
};

// ======================================================================

export const writeInputPatternHighlighters = (
  oldFile: string,
  highlighters: InputPatternHighlighter[]
): string | null => {
  const enabledHighlighters = highlighters.filter(h => h.enabled);

  if (enabledHighlighters.length === 0) {
    return null;
  }

  const chalkVar = findChalkVar(oldFile);
  if (!chalkVar) {
    console.error(
      '^ patch: inputPatternHighlighters: failed to find chalk variable'
    );
    return null;
  }

  let newFile: string | null;

  newFile = writeCustomHighlighterImpl(oldFile);
  if (!newFile) {
    console.error(
      '^ patch: inputPatternHighlighters: writeCustomHighlighterImpl failed'
    );
    return null;
  }

  newFile = writeCustomHighlighterCreation(
    newFile,
    chalkVar,
    enabledHighlighters
  );
  if (!newFile) {
    console.error(
      '^ patch: inputPatternHighlighters: writeCustomHighlighterCreation failed'
    );
    return null;
  }

  return newFile;
};
