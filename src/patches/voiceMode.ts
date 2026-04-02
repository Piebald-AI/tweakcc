// Please see the note about writing patches in ./index
//
// Voice Mode Patch - Force-enable voice mode in Claude Code
//
// The /voice command is gated by `tengu_amber_quartz` (default false) which controls
// both isEnabled() and isHidden for the voice slash command. When enabled, the user
// can hold Space to record audio, which streams to Claude.ai's speech-to-text WebSocket
// and transcribes into the input.
//
// Additionally, `tengu_sotto_voce` gates an "output efficiency" system prompt that makes
// Claude more concise during voice interactions (fitting for spoken input).
//
// Patch 1 - Voice feature gate (tengu_amber_quartz):
// ```diff
//  function qX_() {
// +  return !0;
//    return A9("tengu_amber_quartz", !1);
//  }
// ```
//
// Patch 2 - Voice output efficiency (tengu_sotto_voce):
// ```diff
// -if(A9("tengu_sotto_voce",!1))
// +if(!0)
//    return`# Output efficiency...`
// ```

import { showDiff } from './index';

const patchAmberQuartz = (file: string): string | null => {
  // CC <=2.1.69: function XXX(){return YYY("tengu_amber_quartz",!1)}
  const legacyPattern =
    /function [$\w]+\(\)\{return [$\w]+\("tengu_amber_quartz"/;
  const legacyMatch = file.match(legacyPattern);

  if (legacyMatch && legacyMatch.index !== undefined) {
    const insertIndex = legacyMatch.index + legacyMatch[0].indexOf('{') + 1;
    const insertion = 'return !0;';
    const newFile =
      file.slice(0, insertIndex) + insertion + file.slice(insertIndex);
    showDiff(file, newFile, insertion, insertIndex, insertIndex);
    return newFile;
  }

  // CC >=2.1.83: function XXX(){return!YYY("tengu_amber_quartz_disabled",!1)}
  // This returns true by default (flag defaults to false, negated = true).
  // We still force it to always return true in case the flag gets enabled server-side.
  const newPattern =
    /function [$\w]+\(\)\{return![$\w]+\("tengu_amber_quartz_disabled"/;
  const newMatch = file.match(newPattern);

  if (newMatch && newMatch.index !== undefined) {
    const insertIndex = newMatch.index + newMatch[0].indexOf('{') + 1;
    const insertion = 'return !0;';
    const newFile =
      file.slice(0, insertIndex) + insertion + file.slice(insertIndex);
    showDiff(file, newFile, insertion, insertIndex, insertIndex);
    return newFile;
  }

  console.error('patch: voiceMode: failed to find tengu_amber_quartz gate');
  return null;
};

const patchConciseOutput = (file: string): string | null => {
  const pattern = /if\([$\w]+\("tengu_sotto_voce",!1\)\)/;
  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    // CC >=2.1.83: tengu_sotto_voce gate was removed entirely.
    // Concise output may be always-on or handled differently.
    return file;
  }

  const replacement = 'if(!0)';
  const newFile =
    file.slice(0, match.index) +
    replacement +
    file.slice(match.index + match[0].length);

  showDiff(
    file,
    newFile,
    replacement,
    match.index,
    match.index + match[0].length
  );

  return newFile;
};

export const writeVoiceMode = (
  file: string,
  enableConciseOutput: boolean
): string | null => {
  let newFile = patchAmberQuartz(file);
  if (!newFile) return null;

  if (enableConciseOutput) {
    newFile = patchConciseOutput(newFile);
    if (!newFile) return null;
  }

  return newFile;
};
