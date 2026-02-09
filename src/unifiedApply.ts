import {
  findAllInstallations,
  toUnifiedInstallations,
} from './unifiedDetection';
import { applyPatchesToSelected } from './unifiedPatching';
import { checkForVersionUpdates } from './versionCheck';
import { readConfigFile } from './config';
import { promptRestartInstallations } from './vscode/restartHandler';

export { findAllInstallations, toUnifiedInstallations };
export { applyPatchesToSelected };

export async function applyUnifiedPatches(): Promise<void> {
  console.log('\n🔍 Detecting Claude Code installations...');

  const config = await readConfigFile();
  const { cli, extensions } = await findAllInstallations();

  const unified = toUnifiedInstallations(cli, extensions);

  if (unified.length === 0) {
    console.log('\n❌ No Claude Code installations found.');
    console.log('   Please install Claude Code CLI or VS Code extension.');
    return;
  }

  console.log(`\n✓ Found ${unified.length} installation(s):`);

  for (const inst of unified) {
    const typeIcon = inst.type === 'cli' ? '📟' : '🧩';
    const forkInfo = inst.fork ? ` (${inst.fork})` : '';
    console.log(
      `   ${typeIcon} ${inst.type.toUpperCase()}${forkInfo} - v${inst.version}`
    );
    console.log(`      ${inst.path}`);
  }

  console.log('\n🔄 Applying patches...');

  await checkForVersionUpdates(unified, config);
  const toPatch = unified.filter(inst => inst.selected);

  if (toPatch.length === 0) {
    console.log('\n✓ No installations selected for patching.');
    return;
  }

  const results = await applyPatchesToSelected(toPatch, config);

  console.log('\n📊 Patch Results:');
  let successCount = 0;
  let failureCount = 0;

  for (const result of results) {
    if (result.success) {
      successCount++;
      const patches = result.patchesApplied?.join(', ') || 'none';
      console.log(`   ✅ ${result.path}`);
      console.log(`      Patches: ${patches}`);
    } else {
      failureCount++;
      console.log(`   ❌ ${result.path}`);
      console.log(`      Error: ${result.error}`);
    }
  }

  console.log(`\n✅ ${successCount} installation(s) patched successfully.`);
  if (failureCount > 0) {
    console.log(`❌ ${failureCount} installation(s) failed.`);
  }

  const extensionInstalls = toPatch.filter(
    inst => inst.type === 'vscode-extension'
  );

  if (extensionInstalls.length > 0) {
    await promptRestartInstallations(extensionInstalls);
  }

  console.log('\n✅ All done!');
  console.log('   Restart any running editors to apply patches.');
}
