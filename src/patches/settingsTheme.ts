import { globalReplace } from './index';

// CC validates the settings.json `theme` field against built-in enum + "custom:" prefix:
//   theme:VAR.union([VAR.enum(THEMES),VAR.string().startsWith("custom:").transform(fn)])
//             .optional().catch(void 0)
// Tweakcc custom themes have plain IDs (e.g. "winter") that fail both constraints,
// causing the persisted theme value to be silently reset on every CC startup.
// Widen the schema to accept any string so custom IDs round-trip through settings.json.
//
// CC 2.1.x diff:
// -theme:h.union([h.enum(k7$),h.string().startsWith("custom:").transform((q)=>q)]).optional().catch(void 0)
// +theme:h.string().optional().catch(void 0)
export const writeSettingsTheme = (file: string): string | null => {
  const pattern =
    /,theme:([$\w]+)\.union\(\[\1\.enum\([$\w$]+\),\1\.string\(\)\.startsWith\("[^"]*"\)\.transform\(\([^)]+\)=>[^)]+\)\]\)\.optional\(\)\.catch\(void 0\)/;

  let patched = 0;
  const newFile = globalReplace(file, pattern, (match, zodVar) => {
    patched++;
    return `,theme:${zodVar as string}.string().optional().catch(void 0)`;
  });

  if (patched === 0) {
    console.error('patch: settingsTheme: failed to find theme schema pattern');
    return null;
  }

  return newFile;
};
