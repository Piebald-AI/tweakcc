import { PatchDefinition } from '../../patches';
import { TweakccConfig } from '../../types';

export interface ExtensionPatchDefinition extends PatchDefinition {
  appliesTo: 'cli' | 'extension' | 'both';
  targets: ('cli.js' | 'extension.js' | 'webview.js')[];
  fn: (fileContents: string, config: TweakccConfig) => string;
  condition?: (config: TweakccConfig) => boolean;
}

export const EXTENSION_PATCH_DEFINITIONS: ExtensionPatchDefinition[] = [];

export function registerExtensionPatch(
  definition: ExtensionPatchDefinition
): void {
  EXTENSION_PATCH_DEFINITIONS.push(definition);
}

export function getExtensionPatchDefinitions(): ExtensionPatchDefinition[] {
  return EXTENSION_PATCH_DEFINITIONS;
}
