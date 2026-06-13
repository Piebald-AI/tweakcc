import { debug } from '../utils';
import { showDiff } from './index';

export const writeInputChevronColor = (
  file: string,
  resolvedColor: string
): string | null => {
  const pattern =
    /,\{isLoading:([$\w]+),themeColor:([$\w]+)\}=[$\w]+,([$\w]+)=\2\?\?void 0,[$\w]+;if\([$\w]+\[0\]!==\3\|\|[$\w]+\[1\]!==\1\)[$\w]+=[$\w]+\.createElement\([$\w]+,\{color:\3,dimColor:\1\}/;

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
