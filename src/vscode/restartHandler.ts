import { exec } from 'node:child_process';
import { getForkCommand } from './extensionTypes';
import { debug } from '../utils';
import { VSCodeFork } from './extensionTypes';
import { UnifiedInstallationInfo } from '../types';

export async function isInstallationRunning(
  fork: VSCodeFork
): Promise<boolean> {
  const command = getForkCommand(fork);

  return new Promise<boolean>(resolve => {
    exec(`pgrep -x "${command}"`, (error, stdout) => {
      const isRunning = !error && stdout.trim().length > 0;
      resolve(isRunning);
    });
  });
}

export async function getRunningInstallations(
  forks: VSCodeFork[]
): Promise<VSCodeFork[]> {
  const results = await Promise.all(
    forks.map(async fork => ({
      fork,
      running: await isInstallationRunning(fork),
    }))
  );

  return results.filter(r => r.running).map(r => r.fork);
}

export async function getRunningUnifiedInstallations(
  installations: UnifiedInstallationInfo[]
): Promise<UnifiedInstallationInfo[]> {
  const results = await Promise.all(
    installations.map(async inst => ({
      inst,
      running:
        inst.type === 'vscode-extension' && inst.fork
          ? await isInstallationRunning(inst.fork as VSCodeFork)
          : false,
    }))
  );

  return results.filter(r => r.running).map(r => r.inst);
}

export async function restartInstallation(fork: VSCodeFork): Promise<void> {
  const command = getForkCommand(fork);

  debug(`Restarting ${fork}...`);

  return new Promise((resolve, reject) => {
    exec(
      `pkill -i -f "${command}" && sleep 1 && open -a "${command}"`,
      (error, stdout, stderr) => {
        if (error && error.code !== 1) {
          // code 1 means no processes matched
          debug(`Error restarting ${fork}:`, error);
          reject(
            new Error(`Failed to restart ${fork}: ${error.message}\n${stderr}`)
          );
        } else {
          debug(`${fork} restarted successfully`);
          resolve();
        }
      }
    );
  });
}

export async function promptRestartInstallations(
  installations: UnifiedInstallationInfo[]
): Promise<void> {
  const extensionInstallations = installations.filter(
    inst => inst.type === 'vscode-extension' && inst.fork
  );

  if (extensionInstallations.length === 0) {
    return;
  }

  const forks = Array.from(
    new Set(extensionInstallations.map(inst => inst.fork as VSCodeFork))
  );
  const runningForks = await getRunningInstallations(forks);

  if (runningForks.length === 0) {
    return;
  }

  const { getForkDisplayName } = await import('./extensionTypes');
  const forkNames = runningForks.map(f => getForkDisplayName(f)).join(', ');

  console.log(`\n⚠️  The following editors are running and need to restart:`);
  console.log(`   ${forkNames}`);
  console.log(`\nRestart them now? [Y/n]`);

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<void>((resolve, reject) => {
    rl.question('', async answer => {
      rl.close();

      if (
        answer.trim().toLowerCase() === 'n' ||
        answer.trim().toLowerCase() === 'no'
      ) {
        console.log(`\n✓ Skipping restart. You'll need to restart manually.`);
        resolve();
      } else {
        try {
          for (const fork of runningForks) {
            await restartInstallation(fork);
          }
          console.log(`\n✓ All editors restarted.`);
          resolve();
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}
