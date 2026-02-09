import { registerExtensionPatch } from './extensionPatching';
import { TweakccConfig } from '@/types';
import { debug } from '@/utils';
import { PatchGroup } from '@/patches';

export const patchThinkingVerbs = (
  content: string,
  config: TweakccConfig
): string => {
  const { thinkingVerbs } = config.settings;
  if (
    !thinkingVerbs ||
    !thinkingVerbs.enabled ||
    !thinkingVerbs.verbs ||
    thinkingVerbs.verbs.length === 0
  ) {
    return content;
  }

  const { format, verbs } = thinkingVerbs;
  const customVerb = verbs[Math.floor(Math.random() * verbs.length)];
  const replacement = format.replace('{}', customVerb);

  const defaultThinkingPattern = /"Thinking\.\.\."|"Thinking…"/g;
  const modified = content.replace(defaultThinkingPattern, `"${replacement}"`);

  if (modified !== content) {
    debug(`Applied thinking verbs patch`);
  }

  return modified;
};

export const patchThinkingStyle = (
  content: string,
  config: TweakccConfig
): string => {
  const { thinkingStyle } = config.settings;
  if (!thinkingStyle) {
    return content;
  }

  const { phases, updateInterval, reverseMirror } = thinkingStyle;

  const phasesPattern = /["'](\.,✢,✳,✶,✻,✽|⋮,⋰,⋱,⋲,⋳,⋴,⋵,⋶,⋷,⋸,⋹)["']/g;
  const phasesArrayString = phases.map(p => `"${p}"`).join(',');
  let modified = content.replace(phasesPattern, `[${phasesArrayString}]`);

  const intervalPattern = /updateInterval:\s*(\d+)/g;
  modified = modified.replace(
    intervalPattern,
    `updateInterval:${updateInterval}`
  );

  const reversePattern = /reverseMirror:\s*(true|false)/g;
  modified = modified.replace(reversePattern, `reverseMirror:${reverseMirror}`);

  if (modified !== content) {
    debug(`Applied thinking style patch`);
  }

  return modified;
};

export const patchExpandThinkingBlocks = (
  content: string,
  _config: TweakccConfig
): string => {
  const collapsedPattern = /expanded:\s*false/g;
  const modified = content.replace(collapsedPattern, 'expanded:true');

  if (modified !== content) {
    debug(`Applied expand thinking blocks patch`);
  }

  return modified;
};

export const patchRemoveThinkingSpinner = (
  content: string,
  config: TweakccConfig
): string => {
  if (!config.settings.thinkingStyle?.hideSpinner) {
    return content;
  }

  const spinnerPattern = /"⏳"|'⏳'/g;
  const modified = content.replace(spinnerPattern, '""');

  if (modified !== content) {
    debug('Applied remove thinking spinner patch');
  }

  return modified;
};

registerExtensionPatch({
  id: 'thinking-verbs',
  name: 'Custom Thinking Verbs',
  group: PatchGroup.FEATURES,
  description: 'Custom thinking verbs for VS Code extension',
  appliesTo: 'extension',
  targets: ['webview.js'],
  condition: config => !!config.settings.thinkingVerbs,
  fn: patchThinkingVerbs,
});

registerExtensionPatch({
  id: 'thinking-style',
  name: 'Custom Thinking Style',
  group: PatchGroup.FEATURES,
  description: 'Custom thinking style for VS Code extension',
  appliesTo: 'extension',
  targets: ['webview.js'],
  condition: config => !!config.settings.thinkingStyle,
  fn: patchThinkingStyle,
});

registerExtensionPatch({
  id: 'thinking-visibility',
  name: 'Expand Thinking Blocks by Default',
  group: PatchGroup.MISC_CONFIGURABLE,
  description:
    'Thinking blocks outputted by the model will show without Ctrl+O',
  appliesTo: 'extension',
  targets: ['webview.js'],
  condition: config => config.settings.misc?.expandThinkingBlocks === true,
  fn: patchExpandThinkingBlocks,
});

registerExtensionPatch({
  id: 'thinking-block-styling',
  name: 'Remove Thinking Spinner',
  group: PatchGroup.MISC_CONFIGURABLE,
  description: 'Your custom thinking spinner will be rendered',
  appliesTo: 'extension',
  targets: ['webview.js'],
  condition: config => config.settings.thinkingStyle?.hideSpinner === true,
  fn: patchRemoveThinkingSpinner,
});
