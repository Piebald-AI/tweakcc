import { UnifiedInstallationInfo, TweakccConfig } from './types';
import { checkVersion } from './installationTracking';

export { checkVersion };

export async function checkForVersionUpdates(
  installations: UnifiedInstallationInfo[],
  config: TweakccConfig
): Promise<UnifiedInstallationInfo[]> {
  const updatedInstallations = await Promise.all(
    installations.map(async inst => {
      const versionCheck = await checkVersion(inst, config);

      if (versionCheck.needsUpdate && versionCheck.lastPatchedVersion) {
        console.log(
          `\n⚠️  ${inst.type.toUpperCase()} updated since last patch:`
        );
        console.log(`   Location: ${inst.path}`);
        console.log(`   Current version: ${versionCheck.currentVersion}`);
        console.log(`   Last patched: ${versionCheck.lastPatchedVersion}`);
        console.log(`\nReapply patches? [Y/n]`);

        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        return new Promise<UnifiedInstallationInfo>(resolve => {
          rl.question('', answer => {
            rl.close();

            if (
              answer.trim().toLowerCase() === 'n' ||
              answer.trim().toLowerCase() === 'no'
            ) {
              inst.selected = false;
            }

            resolve(inst);
          });
        });
      }

      return inst;
    })
  );

  return updatedInstallations.filter(inst => inst.selected);
}
