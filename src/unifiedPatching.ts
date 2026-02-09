import path from 'node:path';
import {
  UnifiedInstallationInfo,
  TweakccConfig,
  ClaudeCodeInstallationInfo,
} from './types';
import { applyCliPatches } from './patches/index';
import {
  applyExtensionPatches,
  ExtensionPatchResult,
  VSCodeExtensionInfo,
} from './vscode/extensionPatching';
import { createVSIXBackup } from './vscode/vsixHandler';
import { CONFIG_DIR } from './config';

export interface PatchResult {
  path: string;
  success: boolean;
  error?: string;
  patchesApplied?: string[];
}

export async function applyPatchesToSelected(
  selections: UnifiedInstallationInfo[],
  config: TweakccConfig
): Promise<PatchResult[]> {
  const results = await Promise.allSettled(
    selections.map(sel => applyPatches(sel, config))
  );

  return results.map(r => ({
    path: r.status === 'fulfilled' ? r.value.path : 'unknown',
    success: r.status === 'fulfilled',
    error:
      r.status === 'rejected'
        ? r.reason instanceof Error
          ? r.reason.message
          : String(r.reason)
        : undefined,
    patchesApplied:
      r.status === 'fulfilled' ? r.value.patchesApplied : undefined,
  }));
}

async function applyPatches(
  installation: UnifiedInstallationInfo,
  config: TweakccConfig
): Promise<{
  path: string;
  patchesApplied: string[];
}> {
  if (installation.type === 'cli') {
    return await applyCliPatchesUnified(installation, config);
  } else {
    return await applyExtensionPatchesUnified(installation, config);
  }
}

async function applyCliPatchesUnified(
  installation: UnifiedInstallationInfo,
  config: TweakccConfig
): Promise<{
  path: string;
  patchesApplied: string[];
}> {
  const cliInfo: ClaudeCodeInstallationInfo = {
    version: installation.version,
    cliPath: installation.path,
    source: 'config' as const,
  };

  await applyCliPatches(config, cliInfo);

  return {
    path: installation.path,
    patchesApplied: ['cli-patches'],
  };
}

async function applyExtensionPatchesUnified(
  installation: UnifiedInstallationInfo,
  config: TweakccConfig
): Promise<{
  path: string;
  patchesApplied: string[];
}> {
  const extInfo: VSCodeExtensionInfo = {
    type: 'vscode-extension',
    fork: installation.fork!,
    extensionPath: installation.path,
    version: installation.version,
    files: {
      extensionJs: path.join(installation.path, 'extension.js'),
      webviewJs: path.join(installation.path, 'webview', 'index.js'),
      packageJson: path.join(installation.path, 'package.json'),
    },
  };

  const result: ExtensionPatchResult = await applyExtensionPatches(
    extInfo,
    config
  );

  await backupExtensionToVSIX(extInfo);

  return {
    path: installation.path,
    patchesApplied: result.patchesApplied,
  };
}

async function backupExtensionToVSIX(
  extension: VSCodeExtensionInfo
): Promise<void> {
  const timestamp = Date.now();
  const vsixFileName = `claude-code-patched-${extension.fork}-${extension.version}-${timestamp}.vsix`;
  const vsixPath = path.join(CONFIG_DIR, vsixFileName);

  await createVSIXBackup(extension.extensionPath, vsixPath);
}
