import { showDiff } from './index';

export const writeCustomSessionColors = (oldFile: string): string | null => {
  let content = oldFile;

  // Step 1: Remove the validation that rejects unknown colors.
  // The color command has:
  //   if(!COLORLIST.includes(K)){...return "Invalid color"...}
  // We replace the rejection with a pass-through so any color value works.
  //
  // Pattern: if(!COLORLIST.includes(K)){let T=COLORLIST.join(", ");
  //   return H(`Invalid color "${K}". Available colors: ${T}, default`,...),null}
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

  // Step 2: Modify the color resolution function to pass through unknown colors.
  // The function is: function Ma_(H,_="cyan_FOR_SUBAGENTS_ONLY"){return H&&COLORLIST.includes(H)?COLORMAP[H]:_}
  // We change it to: ...return H?(COLORLIST.includes(H)?COLORMAP[H]:H):_
  // So unknown colors are used as-is (hex, rgb, named CSS colors all work via chalk).
  const colorListVar = rejectMatch[1];
  const resolvePattern = new RegExp(
    `(function ([$\\w]+)\\([$\\w]+,[$\\w]+="[^"]+_FOR_SUBAGENTS_ONLY"\\)\\{return [$\\w]+)&&${colorListVar.replace(/\$/g, '\\$')}\\.includes\\([$\\w]+\\)\\?([$\\w]+)\\[[$\\w]+\\](:[$\\w]+\\})`
  );
  const resolveMatch = content.match(resolvePattern);
  if (!resolveMatch || resolveMatch.index === undefined) {
    console.error(
      'patch: customSessionColors: failed to find color resolve function'
    );
    return null;
  }

  const colorMapVar = resolveMatch[3];
  const argPattern =
    /function [$\w]+\(([$\w]+),[$\w]+="[^"]+_FOR_SUBAGENTS_ONLY"\)/;
  const argMatch = resolveMatch[0].match(argPattern);
  if (!argMatch) {
    console.error(
      'patch: customSessionColors: failed to find resolve function arg'
    );
    return null;
  }
  const colorArg = argMatch[1];

  const oldResolve = resolveMatch[0];
  const newResolve =
    `${resolveMatch[1]}?(${colorListVar}.includes(${colorArg})?${colorMapVar}[${colorArg}]:${colorArg})${resolveMatch[4]}`;

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

  // Step 3: Patch the Text component so backgroundColor also supports raw
  // color values (hex, rgb). The foreground `color` prop uses a resolver
  // that passes through raw values like "#ff0099", but backgroundColor
  // does a plain theme lookup: `y = K ? Z[K] : void 0`.
  // We change it to use the same resolver: `y = K ? RESOLVER(K, Z) : void 0`.
  //
  // Pattern: RESOLVER(fgArg,theme),bgVar=bgArg?theme[bgArg]:void 0
  // This is unique in the codebase (only appears in the Text component).
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

  // Step 4: Remove "gray" and "grey" from the reset/default aliases array
  // so they work as color values instead of resetting.
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
