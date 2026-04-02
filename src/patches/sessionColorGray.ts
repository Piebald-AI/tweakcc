import { showDiff } from './index';

export const writeSessionColorGray = (oldFile: string): string | null => {
  let content = oldFile;

  // Step 1: Add "gray" to the available colors array
  const ozOld =
    '["red","blue","green","yellow","purple","orange","pink","cyan"]';
  const ozNew =
    '["red","blue","green","yellow","purple","orange","pink","cyan","gray"]';

  const ozIdx = content.indexOf(ozOld);
  if (ozIdx === -1) {
    console.error('patch: sessionColorGray: failed to find color array');
    return null;
  }

  let prevContent = content;
  content =
    content.slice(0, ozIdx) + ozNew + content.slice(ozIdx + ozOld.length);
  showDiff(prevContent, content, ozNew, ozIdx, ozIdx + ozOld.length);

  // Step 2: Add gray mapping to the color-to-theme-key mapping object
  const szOld = 'cyan:"cyan_FOR_SUBAGENTS_ONLY"}';
  const szNew = 'cyan:"cyan_FOR_SUBAGENTS_ONLY",gray:"promptBorder"}';

  const szIdx = content.indexOf(szOld);
  if (szIdx === -1) {
    console.error('patch: sessionColorGray: failed to find color mapping');
    return null;
  }

  prevContent = content;
  content =
    content.slice(0, szIdx) + szNew + content.slice(szIdx + szOld.length);
  showDiff(prevContent, content, szNew, szIdx, szIdx + szOld.length);

  // Step 3: Remove "gray" and "grey" from the reset/default aliases array
  const ddOld = '["default","reset","none","gray","grey"]';
  const ddNew = '["default","reset","none"]';

  const ddIdx = content.indexOf(ddOld);
  if (ddIdx === -1) {
    console.error(
      'patch: sessionColorGray: failed to find reset aliases array'
    );
    return null;
  }

  prevContent = content;
  content =
    content.slice(0, ddIdx) + ddNew + content.slice(ddIdx + ddOld.length);
  showDiff(prevContent, content, ddNew, ddIdx, ddIdx + ddOld.length);

  // Step 4: Normalize "grey" to "gray" in the /color command handler
  // Find: let K=q.trim().toLowerCase();if(RESETVAR.includes(K))
  const normalizePattern =
    /let ([$\w]+)=([$\w]+)\.trim\(\)\.toLowerCase\(\);if\(([$\w]+)\.includes\(\1\)\)/;
  const normalizeMatch = content.match(normalizePattern);
  if (!normalizeMatch || normalizeMatch.index === undefined) {
    console.error('patch: sessionColorGray: failed to find normalize location');
    return null;
  }

  const colorVar = normalizeMatch[1];
  const insertAfter = `let ${colorVar}=${normalizeMatch[2]}.trim().toLowerCase()`;
  const insertIdx = content.indexOf(insertAfter, normalizeMatch.index);
  if (insertIdx === -1) {
    console.error('patch: sessionColorGray: failed to find insert location');
    return null;
  }

  const afterInsert = insertIdx + insertAfter.length + 1;
  const greyNormalize = `if(${colorVar}==="grey")${colorVar}="gray";`;

  prevContent = content;
  content =
    content.slice(0, afterInsert) + greyNormalize + content.slice(afterInsert);
  showDiff(prevContent, content, greyNormalize, afterInsert, afterInsert);

  return content;
};
