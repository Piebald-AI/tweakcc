import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { debug } from '../utils';

export enum VSCodeFork {
  VSCode = 'vscode',
  Cursor = 'cursor',
  Windsurf = 'windsurf',
  VSCodium = 'vscodium',
  Antigravity = 'antigravity',
}

export interface VSCodeExtensionInfo {
  type: 'vscode-extension';
  fork: VSCodeFork;
  extensionPath: string;
  version: string;
  files: {
    extensionJs: string;
    webviewJs: string;
    packageJson: string;
  };
  selected?: boolean;
}

export interface VSIXInfo {
  path: string;
  extractedPath: string;
  version: string;
  publisher: string;
  name: string;
}

export interface VSCodeExtensionCandidate {
  fork: VSCodeFork;
  path: string;
  version: string;
}

export function getForkPath(fork: VSCodeFork): string {
  const home = os.homedir();

  switch (fork) {
    case VSCodeFork.VSCode:
      return path.join(home, '.vscode', 'extensions');
    case VSCodeFork.Cursor:
      return path.join(home, '.cursor', 'extensions');
    case VSCodeFork.Windsurf:
      return path.join(home, '.windsurf', 'extensions');
    case VSCodeFork.VSCodium:
      return path.join(home, '.vscodium', 'extensions');
    case VSCodeFork.Antigravity:
      return path.join(home, '.antigravity', 'extensions');
  }
}

export async function findAntigravityPath(): Promise<string | null> {
  const home = os.homedir();

  const possiblePaths = [
    path.join(home, '.antigravity', 'extensions'),
    path.join(
      home,
      'Library',
      'Application Support',
      'Antigravity',
      'extensions'
    ),
    process.env.APPDATA &&
      path.join(process.env.APPDATA, 'Antigravity', 'extensions'),
  ].filter(Boolean) as string[];

  for (const p of possiblePaths) {
    try {
      await fs.access(p);
      debug(`Found Antigravity extensions at: ${p}`);
      return p;
    } catch {
      continue;
    }
  }

  return null;
}

export async function getExtensionDirectories(
  fork: VSCodeFork
): Promise<string[]> {
  const basePath = getForkPath(fork);

  if (fork === VSCodeFork.Antigravity) {
    const antigravityPath = await findAntigravityPath();
    if (!antigravityPath) {
      return [];
    }
    return [antigravityPath];
  }

  try {
    await fs.access(basePath);
    const entries = await fs.readdir(basePath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(basePath, entry.name));
  } catch (error) {
    debug(`Error accessing ${fork} extensions directory:`, error);
    return [];
  }
}

export function getForkCommand(fork: VSCodeFork): string {
  switch (fork) {
    case VSCodeFork.VSCode:
      return 'code';
    case VSCodeFork.Cursor:
      return 'cursor';
    case VSCodeFork.Windsurf:
      return 'windsurf';
    case VSCodeFork.VSCodium:
      return 'codium';
    case VSCodeFork.Antigravity:
      return 'antigravity';
  }
}

export async function isForkInstalled(fork: VSCodeFork): Promise<boolean> {
  const extensionsPath = getForkPath(fork);

  try {
    await fs.access(extensionsPath);
    return true;
  } catch {
    return false;
  }
}

export function getForkDisplayName(fork: VSCodeFork): string {
  switch (fork) {
    case VSCodeFork.VSCode:
      return 'VS Code';
    case VSCodeFork.Cursor:
      return 'Cursor';
    case VSCodeFork.Windsurf:
      return 'Windsurf';
    case VSCodeFork.VSCodium:
      return 'VS Codium';
    case VSCodeFork.Antigravity:
      return 'Antigravity';
  }
}
