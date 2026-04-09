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
  // CC ≥2.1.97: flag renamed to tengu_amber_quartz_disabled with inverted logic
  // Pattern: function Z36(){return!R8("tengu_amber_quartz_disabled",!1)}
  const newPattern =
    /function ([$\w]+)\(\)\{return![$\w]+\("tengu_amber_quartz_disabled"/;
  const newMatch = file.match(newPattern);

  if (newMatch && newMatch.index !== undefined) {
    // Inverted logic: return!flagCheck means "return true if NOT disabled"
    // We want to always return true, so insert return !0; at start of function body
    const insertIndex = newMatch.index + newMatch[0].indexOf('{') + 1;
    const insertion = 'return !0;';

    const newFile =
      file.slice(0, insertIndex) + insertion + file.slice(insertIndex);

    showDiff(file, newFile, insertion, insertIndex, insertIndex);
    return newFile;
  }

  // Fall back to old pattern: function qX_(){return A9("tengu_amber_quartz",!1)}
  const oldPattern = /function [$\w]+\(\)\{return [$\w]+\("tengu_amber_quartz"/;
  const oldMatch = file.match(oldPattern);

  if (!oldMatch || oldMatch.index === undefined) {
    console.error('patch: voiceMode: failed to find tengu_amber_quartz gate');
    return null;
  }

  const insertIndex = oldMatch.index + oldMatch[0].indexOf('{') + 1;
  const insertion = 'return !0;';

  const newFile =
    file.slice(0, insertIndex) + insertion + file.slice(insertIndex);

  showDiff(file, newFile, insertion, insertIndex, insertIndex);

  return newFile;
};

const patchConciseOutput = (file: string): string | null => {
  const pattern = /if\([$\w]+\("tengu_sotto_voce",!1\)\)/;
  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error('patch: voiceMode: failed to find tengu_sotto_voce gate');
    return null;
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
    // sotto_voce was removed in CC ≥2.1.97 — make non-fatal
    const result = patchConciseOutput(newFile);
    if (result) newFile = result;
  }

  return newFile;
};
