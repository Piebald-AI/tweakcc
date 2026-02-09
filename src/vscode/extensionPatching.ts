import { VSCodeExtensionInfo } from './extensionTypes';

export type { VSCodeExtensionInfo };
import { TweakccConfig } from '../types';
import {
  readExtensionJs,
  readWebviewJs,
  writeExtensionJs,
  writeWebviewJs,
  createBackup,
} from './extensionIo';
import { debug } from '../utils';

export interface ExtensionPatchDefinition {
  id: string;
  name: string;
  targets: ('extension.js' | 'webview.js')[];
  fn: (content: string, config: TweakccConfig) => string;
  condition?: (config: TweakccConfig) => boolean;
}

export interface ExtensionPatchResult {
  extensionPath: string;
  patchesApplied: string[];
  backupPaths: string[];
}

export const EXTENSION_PATCHES: ExtensionPatchDefinition[] = [];

export function registerExtensionPatch(patch: ExtensionPatchDefinition): void {
  EXTENSION_PATCHES.push(patch);
  debug(`Registered extension patch: ${patch.id}`);
}

export async function applyExtensionPatches(
  extension: VSCodeExtensionInfo,
  config: TweakccConfig
): Promise<ExtensionPatchResult> {
  debug(`Applying patches to extension: ${extension.extensionPath}`);

  const backups = await createBackup(extension);
  const patchesApplied: string[] = [];

  let extensionJs = await readExtensionJs(extension);
  let webviewJs = extension.files.webviewJs
    ? await readWebviewJs(extension)
    : '';

  for (const patch of EXTENSION_PATCHES) {
    if (patch.condition && !patch.condition(config)) {
      debug(`Skipping patch ${patch.id} (condition not met)`);
      continue;
    }

    try {
      for (const target of patch.targets) {
        if (target === 'extension.js') {
          const patched = patch.fn(extensionJs, config);
          if (patched !== extensionJs) {
            extensionJs = patched;
            patchesApplied.push(`${patch.id}:extension.js`);
          }
        } else if (target === 'webview.js' && webviewJs) {
          const patched = patch.fn(webviewJs, config);
          if (patched !== webviewJs) {
            webviewJs = patched;
            patchesApplied.push(`${patch.id}:webview.js`);
          }
        }
      }

      debug(`Applied patch: ${patch.id}`);
    } catch (error) {
      debug(`Error applying patch ${patch.id}:`, error);
      throw new Error(
        `Failed to apply patch ${patch.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (patchesApplied.length > 0) {
    debug(`Writing modified files...`);
    await writeExtensionJs(extension, extensionJs);

    if (webviewJs) {
      await writeWebviewJs(extension, webviewJs);
    }
  } else {
    debug(`No patches applied`);
  }

  return {
    extensionPath: extension.extensionPath,
    patchesApplied,
    backupPaths: [
      backups.extensionJsBackup,
      ...(backups.webviewJsBackup ? [backups.webviewJsBackup] : []),
    ],
  };
}
