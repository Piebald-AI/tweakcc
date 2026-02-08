import { ClaudeCodeInstallationInfo } from './installationDetection';
import { VSCodeExtensionInfo } from './vscode/extensionTypes';
import { UnifiedInstallationInfo } from './types';
import { detectClaudeCodeExtensions } from './vscode/extensionDetection';

export async function findAllInstallations(): Promise<{
  cli: ClaudeCodeInstallationInfo[];
  extensions: VSCodeExtensionInfo[];
}> {
  const [cliInstalls, extInstalls] = await Promise.all([
    collectCliInstallations(),
    collectVSCodeExtensions(),
  ]);

  return { cli: cliInstalls, extensions: extInstalls };
}

async function collectCliInstallations(): Promise<
  ClaudeCodeInstallationInfo[]
> {
  const { collectCandidates } = await import('./installationDetection');
  const candidates = await collectCandidates();

  // Filter to single best CLI installation:
  // 1. Prefer global node_modules over bunx cache
  // 2. Prefer non-cache over cache
  // 3. If all are cache, pick latest (already sorted by version descending)
  const nonCacheCandidates = candidates.filter(
    c => !c.path.includes('/.bun/install/cache/')
  );
  const candidate =
    nonCacheCandidates.length > 0
      ? nonCacheCandidates[0]
      : candidates.length > 0
        ? candidates[0]
        : null;

  if (!candidate) {
    return [];
  }

  return [
    {
      version: candidate.version,
      ...(candidate.kind === 'npm-based'
        ? { cliPath: candidate.path }
        : { nativeInstallationPath: candidate.path }),
      source: 'search-paths' as const,
    },
  ];
}

async function collectVSCodeExtensions(): Promise<VSCodeExtensionInfo[]> {
  const extensions = await detectClaudeCodeExtensions();

  // Filter to single newest extension (highest version)
  if (extensions.length === 0) {
    return [];
  }

  // Sort by version descending and pick first
  const sorted = [...extensions].sort((a, b) => {
    const aParts = a.version.split('.').map(Number);
    const bParts = b.version.split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] ?? 0;
      const bPart = bParts[i] ?? 0;
      if (aPart !== bPart) {
        return bPart - aPart; // Descending
      }
    }
    return 0;
  });

  return [sorted[0]];
}

export function toUnifiedInstallations(
  cli: ClaudeCodeInstallationInfo[],
  extensions: VSCodeExtensionInfo[]
): UnifiedInstallationInfo[] {
  const unified: UnifiedInstallationInfo[] = [];

  for (const inst of cli) {
    unified.push({
      type: 'cli',
      path: inst.cliPath || inst.nativeInstallationPath || '',
      version: inst.version,
      selected: true,
    });
  }

  for (const ext of extensions) {
    unified.push({
      type: 'vscode-extension',
      path: ext.extensionPath,
      version: ext.version,
      fork: ext.fork,
      selected: true,
    });
  }

  return unified;
}
