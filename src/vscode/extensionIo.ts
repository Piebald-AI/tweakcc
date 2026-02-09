import fs from 'node:fs/promises';
import path from 'node:path';
import { VSCodeExtensionInfo } from './extensionTypes';
import { debug } from '../utils';

export async function readExtensionJs(
  extension: VSCodeExtensionInfo
): Promise<string> {
  debug(`Reading extension.js from: ${extension.files.extensionJs}`);

  try {
    const content = await fs.readFile(extension.files.extensionJs, 'utf8');
    return content;
  } catch (error) {
    debug(`Error reading extension.js:`, error);
    throw new Error(
      `Failed to read extension.js: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function readWebviewJs(
  extension: VSCodeExtensionInfo
): Promise<string> {
  if (!extension.files.webviewJs) {
    debug('No webview.js for this extension');
    return '';
  }

  debug(`Reading webview/index.js from: ${extension.files.webviewJs}`);

  try {
    const content = await fs.readFile(extension.files.webviewJs, 'utf8');
    return content;
  } catch (error) {
    debug(`Error reading webview.js:`, error);
    throw new Error(
      `Failed to read webview.js: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function writeExtensionJs(
  extension: VSCodeExtensionInfo,
  content: string
): Promise<void> {
  debug(`Writing extension.js to: ${extension.files.extensionJs}`);

  try {
    const filePath = extension.files.extensionJs;

    await fs.chmod(filePath, 0o644);
    await fs.writeFile(filePath, content, 'utf8');
  } catch (error) {
    debug(`Error writing extension.js:`, error);
    throw new Error(
      `Failed to write extension.js: ${error instanceof Error ? error.message : String(error)}\n` +
        `You may need to run with sudo or adjust file permissions.`
    );
  }
}

export async function writeWebviewJs(
  extension: VSCodeExtensionInfo,
  content: string
): Promise<void> {
  if (!extension.files.webviewJs) {
    debug('No webview.js to write for this extension');
    return;
  }

  debug(`Writing webview/index.js to: ${extension.files.webviewJs}`);

  try {
    const filePath = extension.files.webviewJs;

    await fs.chmod(filePath, 0o644);
    await fs.writeFile(filePath, content, 'utf8');
  } catch (error) {
    debug(`Error writing webview.js:`, error);
    throw new Error(
      `Failed to write webview.js: ${error instanceof Error ? error.message : String(error)}\n` +
        `You may need to run with sudo or adjust file permissions.`
    );
  }
}

export async function createBackup(
  extension: VSCodeExtensionInfo
): Promise<{ extensionJsBackup: string; webviewJsBackup?: string }> {
  const { CONFIG_DIR } = await import('../config');
  const timestamp = Date.now();

  const extensionJsBackup = path.join(
    CONFIG_DIR,
    `extension.js.backup.${timestamp}.${extension.fork}.${extension.version}`
  );

  debug(`Creating extension.js backup: ${extensionJsBackup}`);
  await fs.copyFile(extension.files.extensionJs, extensionJsBackup);

  const backups: {
    extensionJsBackup: string;
    webviewJsBackup?: string;
  } = { extensionJsBackup };

  if (extension.files.webviewJs) {
    const webviewJsBackup = path.join(
      CONFIG_DIR,
      `webview.js.backup.${timestamp}.${extension.fork}.${extension.version}`
    );

    debug(`Creating webview.js backup: ${webviewJsBackup}`);
    await fs.copyFile(extension.files.webviewJs, webviewJsBackup);
    backups.webviewJsBackup = webviewJsBackup;
  }

  return backups;
}

export async function restoreBackup(
  extension: VSCodeExtensionInfo,
  backups: { extensionJsBackup: string; webviewJsBackup?: string }
): Promise<void> {
  debug(`Restoring extension.js from: ${backups.extensionJsBackup}`);

  try {
    await fs.copyFile(backups.extensionJsBackup, extension.files.extensionJs);
  } catch (error) {
    debug(`Error restoring extension.js:`, error);
    throw new Error(
      `Failed to restore extension.js: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (backups.webviewJsBackup && extension.files.webviewJs) {
    debug(`Restoring webview.js from: ${backups.webviewJsBackup}`);

    try {
      await fs.copyFile(backups.webviewJsBackup, extension.files.webviewJs);
    } catch (error) {
      debug(`Error restoring webview.js:`, error);
      throw new Error(
        `Failed to restore webview.js: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
