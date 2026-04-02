import { escapeIdent, showDiff } from './index';
import { CONFIG_DIR } from '../config';

export interface ReactiveThemeConfig {
  darkThemeId: string;
  lightThemeId: string;
}

function findThemeProviderRegion(content: string): {
  start: number;
  end: number;
} | null {
  const marker = /\{themeSetting:[$\w]+,[\s\S]*?currentTheme:[$\w]+\}/;
  const match = content.match(marker);
  if (!match || match.index == null) return null;

  const searchStart = Math.max(0, match.index - 3000);
  const before = content.slice(searchStart, match.index);
  const funcMatch = before.match(
    /function [$\w]+\(\{children:[$\w]+,initialState:[$\w]+[^}]*\}\)\{/g
  );
  if (!funcMatch) return null;

  const lastFunc = funcMatch[funcMatch.length - 1];
  const funcStart = before.lastIndexOf(lastFunc);
  if (funcStart === -1) return null;

  const start = searchStart + funcStart;

  const after = content.slice(match.index, match.index + 2000);
  const returnMatch = after.match(
    /return [$\w]+\.default\.createElement\([$\w]+\.Provider,\{value:[$\w]+\},[$\w]+\)\}/
  );
  if (!returnMatch || returnMatch.index == null) return null;

  const end = match.index + returnMatch.index + returnMatch[0].length;
  return { start, end };
}

function patchThemeProviderUseEffect(
  content: string,
  config: ReactiveThemeConfig
): string | null {
  const region = findThemeProviderRegion(content);
  if (!region) {
    console.error(
      'patch: reactiveTheme: failed to find ThemeProvider function'
    );
    return null;
  }

  const regionContent = content.slice(region.start, region.end);

  if (regionContent.includes('/tw.js")')) {
    return content;
  }

  const useEffectPattern =
    /([$\w]+)\.useEffect\(\(\)=>\{\},\[([$\w]+)(?:,([$\w]+))?\]\)/;
  const useEffectMatch = regionContent.match(useEffectPattern);
  if (!useEffectMatch || useEffectMatch.index == null) {
    console.error(
      'patch: reactiveTheme: failed to find empty useEffect in ThemeProvider'
    );
    return null;
  }

  const reactVar = useEffectMatch[1];
  const dep1 = useEffectMatch[2];
  const dep2 = useEffectMatch[3];
  const deps = dep2 ? `${dep1},${dep2}` : dep1;

  const setStatePattern = new RegExp(
    `\\[([$\\w]+),([$\\w]+)\\]=${escapeIdent(reactVar)}\\.useState\\(\\(\\)=>\\([^)]+\\)==="?auto"?\\?[$\\w]+\\(\\):"dark"\\)`
  );
  const setStateMatch = regionContent.match(setStatePattern);
  if (!setStateMatch) {
    console.error(
      'patch: reactiveTheme: failed to find setState for resolved theme'
    );
    return null;
  }

  const setStateVar = setStateMatch[2];

  const querierArg = dep2 ? `,${dep2}` : ',void 0';
  const twJsPath = CONFIG_DIR + '/tw.js';
  const replacement =
    `${reactVar}.useEffect(()=>{try{if(${dep1}=="auto"){` +
    `return require(${JSON.stringify(twJsPath)})` +
    `(${setStateVar}${querierArg},${JSON.stringify(config.darkThemeId)},${JSON.stringify(config.lightThemeId)},${JSON.stringify(CONFIG_DIR)})` +
    `}}catch{}},[${deps}])`;

  const absStart = region.start + useEffectMatch.index;
  const absEnd = absStart + useEffectMatch[0].length;

  const newContent =
    content.slice(0, absStart) + replacement + content.slice(absEnd);

  showDiff(content, newContent, replacement, absStart, absEnd);

  return newContent;
}

export const writeReactiveTheme = (
  oldFile: string,
  config: ReactiveThemeConfig
): string | null => {
  return patchThemeProviderUseEffect(oldFile, config);
};
