import path from 'node:path';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import archiver from 'archiver';
import { open as yauzlOpen } from 'yauzl';
import { debug } from '../utils';
import { VSIXInfo, VSCodeFork } from './extensionTypes';

export async function extractVSIX(
  vsixPath: string,
  extractDir?: string
): Promise<VSIXInfo> {
  debug(`Extracting VSIX: ${vsixPath}`);

  if (!extractDir) {
    const tempDir = path.join(os.tmpdir(), `tweakcc-vsix-${Date.now()}`);
    extractDir = tempDir;
  }

  await fsPromises.mkdir(extractDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    yauzlOpen(vsixPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        reject(err);
        return;
      }

      zipfile.on('entry', entry => {
        if (entry.isDirectory) {
          zipfile.readEntry();
          return;
        }

        const outputPath = path.join(extractDir, entry.fileName);
        const outputDir = path.dirname(outputPath);

        fsPromises
          .mkdir(outputDir, { recursive: true })
          .then(() => {
            zipfile.openReadStream(entry, (err, stream) => {
              if (err) {
                reject(err);
                return;
              }

              const writeStream = fs.createWriteStream(outputPath);
              stream.pipe(writeStream);

              writeStream.on('finish', () => {
                zipfile.readEntry();
              });

              writeStream.on('error', reject);
              stream.on('error', reject);
            });
          })
          .catch(reject);
      });

      zipfile.on('end', resolve);
      zipfile.on('error', reject);
      zipfile.readEntry();
    });
  });

  const packageJsonPath = path.join(extractDir, 'extension', 'package.json');
  const packageJson = JSON.parse(
    await fsPromises.readFile(packageJsonPath, 'utf8')
  );

  return {
    path: vsixPath,
    extractedPath: extractDir,
    version: packageJson.version,
    publisher: packageJson.publisher,
    name: packageJson.name,
  };
}

export async function createVSIX(
  extractDir: string,
  outputPath: string
): Promise<void> {
  debug(`Creating VSIX: ${outputPath}`);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      debug(`VSIX created: ${archive.pointer()} bytes`);
      resolve();
    });

    archive.on('error', reject);
    output.on('error', reject);

    archive.pipe(output);
    archive.directory(extractDir, false);
    archive.finalize();
  });
}

export async function installVSIX(
  vsixPath: string,
  fork: VSCodeFork
): Promise<void> {
  debug(`Installing VSIX to ${fork}: ${vsixPath}`);

  const { getForkCommand } = await import('./extensionTypes');
  const command = getForkCommand(fork);

  const { exec } = await import('child_process');

  return new Promise((resolve, reject) => {
    exec(
      `"${command}" --install-extension "${vsixPath}"`,
      (error, stdout, stderr) => {
        if (error) {
          debug(`Error installing VSIX:`, error);
          reject(
            new Error(
              `Failed to install extension to ${fork}: ${error.message}\n${stderr}`
            )
          );
          return;
        }

        debug(`VSIX installed successfully`);
        resolve();
      }
    );
  });
}

export async function loadVSIX(vsixPath: string): Promise<VSIXInfo> {
  debug(`Loading VSIX: ${vsixPath}`);
  return extractVSIX(vsixPath);
}

export async function cleanupVSIXExtract(extractDir: string): Promise<void> {
  debug(`Cleaning up VSIX extraction: ${extractDir}`);

  try {
    await fsPromises.rm(extractDir, { recursive: true, force: true });
  } catch (error) {
    debug(`Error cleaning up VSIX extraction:`, error);
  }
}

export async function createVSIXBackup(
  extensionPath: string,
  outputPath: string
): Promise<void> {
  debug(`Creating VSIX backup from: ${extensionPath}`);

  const tempDir = path.join(os.tmpdir(), `tweakcc-vsix-backup-${Date.now()}`);
  const extensionDir = path.join(tempDir, 'extension');

  await fsPromises.mkdir(extensionDir, { recursive: true });

  try {
    const filesToCopy = ['package.json', 'extension.js'];
    const webviewJsPath = path.join(extensionPath, 'webview', 'index.js');

    const webviewExists = await fsPromises
      .access(webviewJsPath)
      .then(() => true)
      .catch(() => false);

    if (webviewExists) {
      filesToCopy.push('webview/index.js');
    }

    for (const file of filesToCopy) {
      const src = path.join(extensionPath, file);
      const dest = path.join(extensionDir, file);
      await fsPromises.mkdir(path.dirname(dest), { recursive: true });
      await fsPromises.copyFile(src, dest);
    }

    await createVSIX(tempDir, outputPath);
    debug(`VSIX backup created: ${outputPath}`);
  } catch (error) {
    debug(`Error creating VSIX backup:`, error);
    throw new Error(
      `Failed to create VSIX backup: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      debug(`Error cleaning up temp dir:`, error);
    }
  }
}
