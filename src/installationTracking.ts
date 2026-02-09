import { UnifiedInstallationInfo, TweakccConfig } from './types';

export async function checkVersion(
  installation: UnifiedInstallationInfo,
  config: TweakccConfig
): Promise<{
  currentVersion: string;
  lastPatchedVersion?: string;
  needsUpdate: boolean;
}> {
  const currentVersion = installation.version;
  const record = config.installations?.[installation.path];

  const lastPatchedVersion = record?.version;
  const needsUpdate =
    !lastPatchedVersion || lastPatchedVersion !== currentVersion;

  return {
    currentVersion,
    lastPatchedVersion,
    needsUpdate,
  };
}

export async function updateInstallationRecord(
  installation: UnifiedInstallationInfo,
  config: TweakccConfig,
  patchIds: string[]
): Promise<void> {
  const { updateConfigFile } = await import('./config');

  await updateConfigFile(cfg => {
    if (!cfg.installations) {
      cfg.installations = {};
    }

    cfg.installations[installation.path] = {
      version: installation.version,
      lastPatched: new Date().toISOString(),
      patchesApplied: patchIds,
    };
  });
}

export async function getInstallationPatches(
  installation: UnifiedInstallationInfo,
  config: TweakccConfig
): Promise<string[]> {
  const record = config.installations?.[installation.path];
  return record?.patchesApplied || [];
}
