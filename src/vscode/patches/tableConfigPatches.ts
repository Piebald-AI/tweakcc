import { registerExtensionPatch } from './extensionPatching';
import { TweakccConfig } from '@/types';
import { debug } from '@/utils';
import { PatchGroup } from '@/patches';

export const patchTableWidth = (
  content: string,
  config: TweakccConfig
): string => {
  const { tableConfig } = config.settings;
  if (!tableConfig) {
    return content;
  }

  const { width } = tableConfig;
  const pattern = /width:\s*\d+/;
  const modified = content.replace(pattern, `width:${width}`);

  if (modified !== content) {
    debug('Applied table width patch');
  }

  return modified;
};

export const patchTableColor = (
  content: string,
  config: TweakccConfig
): string => {
  const { tableConfig } = config.settings;
  if (!tableConfig || !tableConfig.color) {
    return content;
  }

  const { color } = tableConfig;
  const pattern = /color:\s*["'][\w]+["']/;
  const modified = content.replace(pattern, `color:"${color}"`);

  if (modified !== content) {
    debug('Applied table color patch');
  }

  return modified;
};

export const patchTableColumnConfig = (
  content: string,
  config: TweakccConfig
): string => {
  const { tableConfig } = config.settings;
  if (
    !tableConfig ||
    !tableConfig.columns ||
    tableConfig.columns.length === 0
  ) {
    return content;
  }

  const { columns } = tableConfig;
  const columnsString = JSON.stringify(columns);
  const pattern = /columns:\s*\[[^\]]*\]/;
  const modified = content.replace(pattern, `columns:${columnsString}`);

  if (modified !== content) {
    debug('Applied table column config patch');
  }

  return modified;
};

export const patchTableExpandConfig = (
  content: string,
  config: TweakccConfig
): string => {
  const { tableConfig } = config.settings;
  if (!tableConfig || !tableConfig.expandOn) {
    return content;
  }

  const { expandOn } = tableConfig;
  const pattern = /expandOn:\s*["']\w+["']/;
  const modified = content.replace(pattern, `expandOn:"${expandOn}"`);

  if (modified !== content) {
    debug('Applied table expand config patch');
  }

  return modified;
};

registerExtensionPatch({
  id: 'table-width',
  name: 'Custom Table Width',
  targets: ['webview.js'],
  appliesTo: 'extension',
  group: PatchGroup.MISC_CONFIGURABLE,
  description: 'Custom table width for VS Code extension',
  condition: (config: TweakccConfig) => !!config.settings.tableConfig?.width,
  fn: patchTableWidth,
});

registerExtensionPatch({
  id: 'table-color',
  name: 'Custom Table Color',
  targets: ['webview.js'],
  appliesTo: 'extension',
  group: PatchGroup.MISC_CONFIGURABLE,
  description: 'Custom table color for VS Code extension',
  condition: (config: TweakccConfig) => !!config.settings.tableConfig?.color,
  fn: patchTableColor,
});

registerExtensionPatch({
  id: 'table-column-config',
  name: 'Custom Table Column Config',
  targets: ['webview.js'],
  appliesTo: 'extension',
  group: PatchGroup.MISC_CONFIGURABLE,
  description: 'Custom table column config for VS Code extension',
  condition: (config: TweakccConfig) =>
    (config.settings.tableConfig?.columns &&
      config.settings.tableConfig.columns.length > 0) ||
    false,
  fn: patchTableColumnConfig,
});

registerExtensionPatch({
  id: 'table-expand-config',
  name: 'Custom Table Expand Config',
  targets: ['webview.js'],
  appliesTo: 'extension',
  group: PatchGroup.MISC_CONFIGURABLE,
  description: 'Custom table expand config for VS Code extension',
  condition: (config: TweakccConfig) => !!config.settings.tableConfig?.expandOn,
  fn: patchTableExpandConfig,
});
