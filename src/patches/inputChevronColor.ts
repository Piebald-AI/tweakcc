import { debug } from '../utils';
import { showDiff } from './index';

export const writeInputChevronColor = (
  file: string,
  resolvedColor: string
): string | null => {
  // CC 2.1.199 inserts `isScreenReader:r` between isLoading and themeColor, adds
  // an extra `a=r?"$":ct.pointer` assignment after `color=themeColor??void 0`,
  // and a third `||t[2]!==a` guard term. Tolerate additional destructured fields
  // (`(?:[$\w]+:[$\w]+,)*`), any extra assignments before the `;` (`[^;]*`), and
  // extra guard terms (`[^)]*`), while still capturing isLoading (1), themeColor
  // (2), and the resolved-color var (3).
  const pattern =
    /,\{isLoading:([$\w]+),(?:[$\w]+:[$\w]+,)*themeColor:([$\w]+)\}=[$\w]+,([$\w]+)=\2\?\?void 0,[^;]*;if\([^)]*\[0\]!==\3[^)]*\|\|[^)]*\[1\]!==\1[^)]*\)[$\w]+=[$\w]+\.jsxs\([$\w]+,\{color:\3,dimColor:\1,children:/;

  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    debug('patch: inputChevronColor: failed to find chevron component pattern');
    return null;
  }

  const isLoadingVar = match[1];
  const resolvedColorVar = match[3];

  const oldColorPart = `color:${resolvedColorVar},dimColor:${isLoadingVar}`;
  const newColorPart = `color:${isLoadingVar}?${resolvedColorVar}:${JSON.stringify(resolvedColor)},dimColor:!1`;

  const colorPartIndex = match[0].indexOf(oldColorPart);
  const startIndex = match.index + colorPartIndex;
  const endIndex = startIndex + oldColorPart.length;

  const newFile =
    file.slice(0, startIndex) + newColorPart + file.slice(endIndex);

  showDiff(file, newFile, newColorPart, startIndex, endIndex);

  return newFile;
};
