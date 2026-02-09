import { UnifiedInstallationInfo, TweakccConfig } from './types';
import { checkVersion } from './installationTracking';

export { checkVersion };

export async function checkForVersionUpdates(
  installations: UnifiedInstallationInfo[],
  config: TweakccConfig
): Promise<UnifiedInstallationInfo[]> {
  const updatedInstallations: UnifiedInstallationInfo[] = [];

  for (const inst of installations) {
    const versionCheck = await checkVersion(inst, config);

    if (versionCheck.needsUpdate && versionCheck.lastPatchedVersion) {
      console.log(`\n⚠️  ${inst.type.toUpperCase()} updated since last patch:`);
      console.log(`   Location: ${inst.path}`);
      console.log(`   Current version: ${versionCheck.currentVersion}`);
      console.log(`   Last patched: ${versionCheck.lastPatchedVersion}`);
      console.log(`\nReapply patches? [Y/n]`);

      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>(resolve => {
        rl.question('', resolve);
      });

      rl.close();

      if (
        answer.trim().toLowerCase() === 'n' ||
        answer.trim().toLowerCase() === 'no'
      ) {
        inst.selected = false;
      }
    }

    updatedInstallations.push(inst);
  }

  return updatedInstallations.filter(inst => inst.selected !== false);
}
