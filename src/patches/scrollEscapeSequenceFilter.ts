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

  const filterCode = `// SCROLLING FIX PATCH START
const _origStdoutWrite=process.stdout.write;
process.stdout.write=function(chunk,encoding,cb){
if(typeof chunk!=='string'){
return _origStdoutWrite.call(process.stdout,chunk,encoding,cb);
}
const filtered=chunk
.replace(/\\x1b\\[(?:\\d+;?\\d*)?H/g,'')
.replace(/\\x1b\\[\\d*A/g,'');
return _origStdoutWrite.call(process.stdout,filtered,encoding,cb);
};
// SCROLLING FIX PATCH END
`;

  const newFile = oldFile.slice(0, index) + filterCode + oldFile.slice(index);

  showDiff(oldFile, newFile, filterCode, index, index);
  return newFile;
};
