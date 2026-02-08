import { registerExtensionPatch } from './extensionPatching';
import { TweakccConfig } from '@/types';
import { debug } from '@/utils';
import { PatchGroup } from '@/patches';

export const patchConversationTitle = (
  content: string,
  config: TweakccConfig
): string => {
  const { misc } = config.settings;
  if (!misc?.enableConversationTitle) {
    return content;
  }

  const titleCommandPattern = /["']claudeCode\.title["']/g;

  if (!titleCommandPattern.test(content)) {
    debug('/title command not found, injecting...');

    const commandInjection = `
// Custom: /title command injected by tweakcc
vscode.commands.registerCommand('claudeCode.title', async () => {
  const input = await vscode.window.showInputBox({
    prompt: 'Enter conversation title',
    placeHolder: 'My conversation name',
  });
  if (input) {
    // Call existing title setter if available
    if (typeof setConversationTitle === 'function') {
      setConversationTitle(input);
    }
  }
});
`;

    const registrationPattern = /vscode\.commands\.registerCommand\([^)]+\)/g;
    const matches = content.match(registrationPattern);

    if (matches && matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const matchIndex = content.lastIndexOf(lastMatch);
      const insertIndex = matchIndex + lastMatch.length;

      const modified =
        content.slice(0, insertIndex) +
        commandInjection +
        content.slice(insertIndex);

      debug('Injected /title command');
      return modified;
    } else {
      debug('Could not find command registration location');
    }
  } else {
    debug('claudeCode.title command already exists');
  }

  return content;
};

export const patchHideStartupBanner = (
  content: string,
  _config: TweakccConfig
): string => {
  const bannerPattern = /showStartupBanner\s*:\s*true/g;
  const modified = content.replace(bannerPattern, 'showStartupBanner:false');

  if (modified !== content) {
    debug('Applied hide startup banner patch');
  }

  return modified;
};

export const patchHideCtrlGToEdit = (
  content: string,
  _config: TweakccConfig
): string => {
  const ctrlGPattern =
    /"ctrl\+g to edit prompt in <editor>"|"Ctrl\+G to edit prompt in <editor>"/gi;
  const modified = content.replace(ctrlGPattern, '""');

  if (modified !== content) {
    debug('Applied hide Ctrl+G patch');
  }

  return modified;
};

export const patchRemoveNewSessionShortcut = (
  content: string,
  _config: TweakccConfig
): string => {
  const shortcutPattern = /"Cmd\+K"|"Ctrl\+K"|"meta\+k"/gi;
  const modified = content.replace(shortcutPattern, '"Cmd+Shift+T"');

  if (modified !== content) {
    debug('Applied remove new session shortcut patch');
  }

  return modified;
};

registerExtensionPatch({
  id: 'hide-startup-banner',
  name: 'Hide Startup Banner',
  group: PatchGroup.MISC_CONFIGURABLE,
  description:
    'CC\'s startup banner with "Clawd" and release notes will be hidden',
  appliesTo: 'extension',
  targets: ['webview.js'],
  condition: (config: TweakccConfig) =>
    !!config.settings.misc?.hideStartupBanner,
  fn: patchHideStartupBanner,
});

registerExtensionPatch({
  id: 'hide-ctrl-g-to-edit',
  name: 'Hide Ctrl+G to Edit',
  group: PatchGroup.MISC_CONFIGURABLE,
  description: 'Note about using Ctrl+G to edit prompt will be hidden',
  appliesTo: 'extension',
  targets: ['webview.js'],
  condition: (config: TweakccConfig) => !!config.settings.misc?.hideCtrlGToEdit,
  fn: patchHideCtrlGToEdit,
});

registerExtensionPatch({
  id: 'remove-new-session-shortcut',
  name: 'Remove New Session Shortcut',
  group: PatchGroup.MISC_CONFIGURABLE,
  description:
    'Note about using Ctrl+K for new session will be hidden or changed',
  appliesTo: 'extension',
  targets: ['webview.js'],
  condition: (config: TweakccConfig) =>
    !!config.settings.misc?.removeNewSessionShortcut,
  fn: patchRemoveNewSessionShortcut,
});
