import path from 'node:path';
import fs from 'node:fs/promises';
import { VSCodeExtensionInfo, VSCodeFork } from './extensionTypes';
import { debug, extractVersionFromContent } from '../utils';

const CLAUDE_CODE_EXTENSIONS = ['claude-code', 'anthropic.claude-code'];

export async function detectClaudeCodeExtensions(): Promise<
  VSCodeExtensionInfo[]
> {
  const extensions: VSCodeExtensionInfo[] = [];

  for (const fork of Object.values(VSCodeFork)) {
    try {
      const forkExtensions = await scanForkExtensions(fork);
      extensions.push(...forkExtensions);
    } catch (error) {
      debug(`Error scanning ${fork} extensions:`, error);
    }
  }

  return extensions;
}

async function scanForkExtensions(
  fork: VSCodeFork
): Promise<VSCodeExtensionInfo[]> {
  const { getExtensionDirectories } = await import('./extensionTypes');
  const directories = await getExtensionDirectories(fork);
  const claudeExtensions: VSCodeExtensionInfo[] = [];

  for (const dir of directories) {
    const packageJsonPath = path.join(dir, 'package.json');

    try {
      await fs.access(packageJsonPath);

      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, 'utf8')
      );

      const isClaudeExtension =
        CLAUDE_CODE_EXTENSIONS.includes(packageJson.name) ||
        packageJson.publisher === 'Anthropic' ||
        packageJson.name?.toLowerCase().includes('claude');

      if (!isClaudeExtension) {
        continue;
      }

      const version = await extractExtensionVersion(dir, packageJson);

      const extensionJs = path.join(dir, 'extension.js');
      const webviewJs = path.join(dir, 'webview', 'index.js');

      const extensionFiles = await Promise.all([
        fileExists(extensionJs),
        fileExists(webviewJs),
      ]);

      if (!extensionFiles[0]) {
        debug(`Extension ${dir} missing extension.js, skipping`);
        continue;
      }

      const extensionInfo: VSCodeExtensionInfo = {
        type: 'vscode-extension',
        fork,
        extensionPath: dir,
        version,
        files: {
          extensionJs,
          webviewJs: extensionFiles[1] ? webviewJs : '',
          packageJson: packageJsonPath,
        },
      };

      claudeExtensions.push(extensionInfo);
      debug(`Found Claude Code extension: ${fork} @ ${version} in ${dir}`);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        continue;
      }
      debug(`Error checking extension directory ${dir}:`, error);
    }
  }

  return claudeExtensions;
}

async function extractExtensionVersion(
  dir: string,
  packageJson: Record<string, unknown>
): Promise<string> {
  if (typeof packageJson.version === 'string') {
    return packageJson.version;
  }

  const extensionJs = path.join(dir, 'extension.js');

  try {
    await fs.access(extensionJs);
    const content = await fs.readFile(extensionJs, 'utf8');
    const version = extractVersionFromContent(content);

    if (version) {
      return version;
    }
  } catch (error) {
    debug(`Error extracting version from extension.js:`, error);
  }

  return 'unknown';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
