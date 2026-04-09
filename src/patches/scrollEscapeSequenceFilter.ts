import { showDiff } from './index';

const getScrollEscapeSequenceFilterLocation = (oldFile: string): number => {
  const lines = oldFile.split('\n');
  let injectionIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#!')) continue;
    if (
      line.startsWith('//') &&
      (line.includes('Version') || line.includes('(c)'))
    )
      continue;
    if (line.trim() === '' && i < 5) continue;
    injectionIndex = i;
    break;
  }

  return injectionIndex > 0
    ? lines.slice(0, injectionIndex).join('\n').length
    : 0;
};

export const writeScrollEscapeSequenceFilter = (
  oldFile: string
): string | null => {
  const index = getScrollEscapeSequenceFilterLocation(oldFile);

  // Only filter scroll-specific sequences, NOT cursor positioning (CSI H)
  // or cursor up (CSI A) which ink needs for rendering.
  //
  // Filtered sequences:
  // - \x1b[<n>S  — Scroll up (SU): scroll content up by n lines
  // - \x1b[<n>T  — Scroll down (SD): scroll content down by n lines
  // - \x1b[<n>;<n>r — Set scroll region (DECSTBM)
  // - \x1b[r     — Reset scroll region
  //
  // NOT filtered (ink needs these):
  // - \x1b[<n>;<n>H — Cursor position (CUP)
  // - \x1b[<n>A     — Cursor up (CUU)
  const filterCode = `// SCROLLING FIX PATCH START
const _origStdoutWrite=process.stdout.write;
process.stdout.write=function(chunk,encoding,cb){
if(typeof chunk!=='string'){
return _origStdoutWrite.call(process.stdout,chunk,encoding,cb);
}
const filtered=chunk
.replace(/\\x1b\\[\\d*S/g,'')
.replace(/\\x1b\\[\\d*T/g,'')
.replace(/\\x1b\\[\\d*;?\\d*r/g,'');
return _origStdoutWrite.call(process.stdout,filtered,encoding,cb);
};
// SCROLLING FIX PATCH END
`;

  const newFile = oldFile.slice(0, index) + filterCode + oldFile.slice(index);

  showDiff(oldFile, newFile, filterCode, index, index);
  return newFile;
};
