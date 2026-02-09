import { registerExtensionPatch } from './extensionPatching';
import { TweakccConfig } from '@/types';
import { debug } from '@/utils';
import { PatchGroup } from '@/patches';

export const patchTableFormat = (
  content: string,
  config: TweakccConfig
): string => {
  const tableFormat = config.settings.misc?.tableFormat;

  let tableBorderChar = '│';
  let rowSeparator = true;
  let topBottomBorder = true;

  switch (tableFormat) {
    case 'ascii':
      tableBorderChar = '|';
      rowSeparator = false;
      topBottomBorder = false;
      break;
    case 'clean':
      rowSeparator = false;
      topBottomBorder = false;
      break;
    case 'clean-top-bottom':
      rowSeparator = false;
      break;
  }

  const borderPattern = /tableBorder:\s*["']│["']/g;
  let modified = content.replace(
    borderPattern,
    `tableBorder:"${tableBorderChar}"`
  );

  const rowSepPattern = /rowSeparator:\s*(true|false)/g;
  modified = modified.replace(rowSepPattern, `rowSeparator:${rowSeparator}`);

  const topBottomPattern = /topBottomBorder:\s*(true|false)/g;
  modified = modified.replace(
    topBottomPattern,
    `topBottomBorder:${topBottomBorder}`
  );

  if (modified !== content) {
    debug('Applied table format patch');
  }

  return modified;
};

export const patchSwarmMode = (
  content: string,
  _config: TweakccConfig
): string => {
  const swarmPattern = /tengu_brass_pebble:\s*false/g;
  const modified = content.replace(swarmPattern, 'tengu_brass_pebble:true');

  if (modified !== content) {
    debug('Applied swarm mode patch');
  }

  return modified;
};

export const patchTokenCountRounding = (
  content: string,
  config: TweakccConfig
): string => {
  if (!config.settings.misc || !config.settings.misc.tokenCountRounding) {
    return content;
  }

  const { tokenCountRounding } = config.settings.misc;
  const roundingPattern = /tokenCountRounding:\s*(\d+|null)/g;
  const modified = content.replace(
    roundingPattern,
    `tokenCountRounding:${tokenCountRounding}`
  );

  if (modified !== content) {
    debug('Applied token count rounding patch');
  }

  return modified;
};

registerExtensionPatch({
  id: 'table-format',
  name: 'Table Format (ASCII/Clean)',
  group: PatchGroup.MISC_CONFIGURABLE,
  targets: ['webview.js'],
  appliesTo: 'extension',
  description: 'Set table format to ASCII or Clean',
  fn: patchTableFormat,
});

registerExtensionPatch({
  id: 'swarm-mode',
  name: 'Swarm Mode',
  group: PatchGroup.FEATURES,
  appliesTo: 'extension',
  targets: ['extension.js', 'webview.js'],
  description: 'Enable swarm mode for multiple agents',
  condition: config => config.settings.misc?.enableSwarmMode || false,
  fn: patchSwarmMode,
});

registerExtensionPatch({
  id: 'token-count-rounding',
  name: 'Token Count Rounding',
  group: PatchGroup.MISC_CONFIGURABLE,
  appliesTo: 'extension',
  targets: ['webview.js'],
  description: 'Set token count rounding precision',
  condition: config => config.settings.misc?.tokenCountRounding !== null,
  fn: patchTokenCountRounding,
});
