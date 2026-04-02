import { showDiff } from './index';

export const writeCustomSessionColors = (
  oldFile: string,
  customColorMap: Record<string, string>
): string | null => {
  let content = oldFile;

  // Step 1: Remove the validation that rejects unknown colors.
  const rejectPattern =
    /if\(!([$\w]+)\.includes\(([$\w]+)\)\)\{let ([$\w]+)=\1\.join\(", "\);return [$\w]+\(`Invalid color "\$\{\2\}"[^`]+`,[^)]+\),null\}/;
  const rejectMatch = content.match(rejectPattern);
  if (!rejectMatch || rejectMatch.index === undefined) {
    console.error(
      'patch: customSessionColors: failed to find color rejection branch'
    );
    return null;
  }

  let prevContent = content;
  content =
    content.slice(0, rejectMatch.index) +
    content.slice(rejectMatch.index + rejectMatch[0].length);
  showDiff(
    prevContent,
    content,
    '',
    rejectMatch.index,
    rejectMatch.index + rejectMatch[0].length
  );

  // Step 2: Modify the color resolution function.
  // Original: function Ma_(H,_="cyan_..."){return H&&LIST.includes(H)?MAP[H]:_}
  // New: built-in -> theme key, custom map -> user value, hex/rgb -> pass through, else fallback
  const colorListVar = rejectMatch[1];
  const resolvePattern = new RegExp(
    `(function ([$\\w]+)\\(([$\\w]+),[$\\w]+="[^"]+_FOR_SUBAGENTS_ONLY"\\)\\{return) [$\\w]+&&${colorListVar.replace(/\$/g, '\\$')}\\.includes\\([$\\w]+\\)\\?([$\\w]+)\\[[$\\w]+\\](:[$\\w]+\\})`
  );
  const resolveMatch = content.match(resolvePattern);
  if (!resolveMatch || resolveMatch.index === undefined) {
    console.error(
      'patch: customSessionColors: failed to find color resolve function'
    );
    return null;
  }

  const funcPrefix = resolveMatch[1];
  const colorArg = resolveMatch[3];
  const colorMapVar = resolveMatch[4];
  const fallbackSuffix = resolveMatch[5];

  const customMapJs = JSON.stringify(customColorMap);
  const oldResolve = resolveMatch[0];
  // Resolution: built-in -> custom map -> hex/rgb pass-through -> fallback
  const newBody =
    ` !${colorArg}?"promptBorder":` +
    `(${colorListVar}.includes(${colorArg})?${colorMapVar}[${colorArg}]` +
    `:${customMapJs}[${colorArg}]` +
    `||(${colorArg}[0]==="#"||${colorArg}.startsWith("rgb(")?${colorArg}:null))` +
    `||_}`;
  const newResolve = `${funcPrefix}${newBody}`;

  prevContent = content;
  content =
    content.slice(0, resolveMatch.index) +
    newResolve +
    content.slice(resolveMatch.index + oldResolve.length);
  showDiff(
    prevContent,
    content,
    newResolve,
    resolveMatch.index,
    resolveMatch.index + oldResolve.length
  );

  // Step 3: Patch the Text component's backgroundColor to use the same
  // resolver as foreground color. Without this, backgroundColor does a
  // plain theme lookup (Z[K]) which returns undefined for custom colors.
  // Pattern: RESOLVER(fgArg,theme),bgVar=bgArg?theme[bgArg]:void 0
  const bgPattern =
    /([$\w]+)\(([$\w]+),([$\w]+)\),([$\w]+)=([$\w]+)\?([$\w]+)\[\5\]:void 0/;
  const bgMatch = content.match(bgPattern);
  if (!bgMatch || bgMatch.index === undefined) {
    console.error(
      'patch: customSessionColors: failed to find backgroundColor in Text component'
    );
    return null;
  }

  const fgResolverName = bgMatch[1];
  const themeVar = bgMatch[6];
  const bgVar = bgMatch[4];
  const bgColorArg = bgMatch[5];
  const oldBg = `${bgVar}=${bgColorArg}?${themeVar}[${bgColorArg}]:void 0`;
  const newBg = `${bgVar}=${bgColorArg}?${fgResolverName}(${bgColorArg},${themeVar}):void 0`;
  const bgAbsIdx = bgMatch.index + bgMatch[0].indexOf(oldBg);

  prevContent = content;
  content =
    content.slice(0, bgAbsIdx) +
    newBg +
    content.slice(bgAbsIdx + oldBg.length);
  showDiff(
    prevContent,
    content,
    newBg,
    bgAbsIdx,
    bgAbsIdx + oldBg.length
  );

  // Step 4: Remove "gray" and "grey" from the reset/default aliases array.
  // In CC 2.1.90+ these were already removed upstream, so this is optional.
  const ddOld = '["default","reset","none","gray","grey"]';
  const ddNew = '["default","reset","none"]';

  const ddIdx = content.indexOf(ddOld);
  if (ddIdx !== -1) {
    prevContent = content;
    content =
      content.slice(0, ddIdx) + ddNew + content.slice(ddIdx + ddOld.length);
    showDiff(prevContent, content, ddNew, ddIdx, ddIdx + ddOld.length);
  }

  return content;
};
