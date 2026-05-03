import { globalReplace } from './index';

export const writeSettingsTheme = (file: string): string | null => {
  const pattern =
    /,theme:([$\w]+)\.union\(\[\1\.enum\([$\w$]+\),\1\.string\(\)\.startsWith\("[^"]*"\)\.transform\(\([^)]+\)=>[^)]+\)\]\)\.optional\(\)\.catch\(void 0\)/;

  let patched = 0;
  const newFile = globalReplace(file, pattern, (match, zodVar) => {
    patched++;
    return `,theme:${zodVar as string}.string().optional().catch(void 0)`;
  });

  if (patched < 2) {
    console.error(`patch: settingsTheme: expected 2 replacements, got ${patched}`);
    return null;
  }

  return newFile;
};
