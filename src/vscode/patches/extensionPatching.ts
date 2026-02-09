import { PatchDefinition } from '../../patches';
import { TweakccConfig } from '../../types';
import { VSCodeExtensionInfo } from '../extensionTypes';
import {
  readExtensionJs,
  writeExtensionJs,
  readWebviewJs,
  writeWebviewJs,
} from '../extensionIo';

export async function applyExtensionPatches(
  extension: VSCodeExtensionInfo,
  config: TweakccConfig
): Promise<{ patchesApplied: string[] }> {
  const patchesApplied: string[] = [];

  let extensionJs = '';
  let webviewJs = '';

  if (extension.files.extensionJs) {
    extensionJs = await readExtensionJs(extension);
  }

  if (extension.files.webviewJs) {
    webviewJs = await readWebviewJs(extension);
  }

  for (const patch of EXTENSION_PATCH_DEFINITIONS) {
    if (patch.appliesTo !== 'extension' && patch.appliesTo !== 'both') {
      continue;
    }

    if (patch.condition && !patch.condition(config)) {
      continue;
    }

    let modified = false;

    const targets = patch.targets || ['cli.js'];

    if (targets.includes('extension.js') && extensionJs) {
      extensionJs = patch.fn(extensionJs, config);
      modified = true;
    }

    if (targets.includes('webview.js') && webviewJs) {
      webviewJs = patch.fn(webviewJs, config);
      modified = true;
    }

    if (modified) {
      patchesApplied.push(patch.id);
    }
  }

  if (extensionJs && extension.files.extensionJs) {
    await writeExtensionJs(extension, extensionJs);
  }

  if (webviewJs && extension.files.webviewJs) {
    await writeWebviewJs(extension, webviewJs);
  }

  return { patchesApplied };
}

export interface ExtensionPatchDefinition extends PatchDefinition {
  appliesTo: 'cli' | 'extension' | 'both';
  targets: ('cli.js' | 'extension.js' | 'webview.js')[];
  fn: (content: string, config: TweakccConfig) => string;
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
