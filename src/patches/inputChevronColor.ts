import { debug } from '../utils';
import { showDiff } from './index';

export const writeInputChevronColor = (
  file: string,
  resolvedColor: string
): string | null => {
  const pattern =
    /,\{isLoading:([$\w]+),(?:[$\w]+:[$\w]+,)*themeColor:([$\w]+)\}=[$\w]+,([$\w]+)=\2\?\?void 0[,;][\s\S]*?if\([^)]*!==\3[^)]*\|\|[^)]*!==\1[^)]*\)[$\w]+=[$\w]+\.jsxs?\([$\w]+,\{color:\3,dimColor:\1,children:/;

  // CC 2.1.2xx: an isScreenReader prop builds the chevron children (with
  // nested `{…}` object literals) between the destructure and the Text call,
  // and the JSX runtime is called through a bare minified import:
  //   {isLoading:M,isScreenReader:E,themeColor:K}=h,Se=K??void 0,Ce;if(…)…;let Me;if(…)Me=e(n,{color:Se,dimColor:M,children:Ce})
  const codeSplitPattern =
    /\{isLoading:([$\w]+),(?:[$\w]+:[$\w]+,)*themeColor:([$\w]+)\}=[$\w]+,([$\w]+)=\2\?\?void 0[,;].{0,400}?(?:[$\w]+\.jsxs?|[$\w]+)\([$\w]+,\{color:\3,dimColor:\1,children:/;

  const match = file.match(pattern) ?? file.match(codeSplitPattern);

  if (!match || match.index === undefined) {
    debug('patch: inputChevronColor: failed to find chevron component pattern');
    return null;
  }

  const isLoadingVar = match[1];
  const resolvedColorVar = match[3];

  const oldColorPart = `color:${resolvedColorVar},dimColor:${isLoadingVar}`;
  const newColorPart = `color:${isLoadingVar}?${resolvedColorVar}:${JSON.stringify(resolvedColor)},dimColor:!1`;

  const colorPartIndex = match[0].lastIndexOf(oldColorPart);
  const startIndex = match.index + colorPartIndex;
  const endIndex = startIndex + oldColorPart.length;

  const newFile =
    file.slice(0, startIndex) + newColorPart + file.slice(endIndex);

  showDiff(file, newFile, newColorPart, startIndex, endIndex);

  return newFile;
};
