import { debug } from '../utils';
import { showDiff } from './index';

// Native-cursor-off input box: the cursor cell falls back to inverse video.
// CC 2.1.295:
//   b=!i?Xt:C?()=>ge.hex(C.hex)(C.char):g?Yt:D7
// where D7 wraps the cell in \x1B[7m…\x1B[27m. Swap that fallback for a chalk
// background so the cursor cell takes the configured color.
export const writeInputCursorColor = (
  file: string,
  cursorColor: string
): string | null => {
  const rgb = cursorColor.match(
    /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/
  );
  if (!rgb) {
    console.error(
      `patch: inputCursorColor: cursorColor must be rgb(r,g,b), got ${JSON.stringify(cursorColor)}`
    );
    return null;
  }

  const pattern =
    /=![$\w]+\?[$\w]+:([$\w]+)\?\(\)=>([$\w]+)\.hex\(\1\.hex\)\(\1\.char\):[$\w]+\?[$\w]+:([$\w]+)(?=[,;])/;
  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    debug('patch: inputCursorColor: failed to find cursor invert fallback');
    return null;
  }

  const chalkVar = match[2];
  const replacement = `(c=>${chalkVar}.bgRgb(${rgb[1]},${rgb[2]},${rgb[3]})(c))`;

  const endIndex = match.index + match[0].length;
  const startIndex = endIndex - match[3].length;

  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);

  return newFile;
};
