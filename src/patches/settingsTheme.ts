import { globalReplace } from './index';

/**
 * Widens the settings.json `theme` field schema to accept arbitrary theme IDs.
 *
 * CC validates the theme field against built-in IDs (enum) or a `"custom:"` prefix.
 * Tweakcc custom themes use plain IDs (e.g. `"winter"`) that fail both checks;
 * the `.catch(void 0)` silently resets the field on every startup, so the theme
 * never persists. This patch replaces the union validator with `z.string()`.
 *
 * Applies to both user-settings and managed-settings schema instances (two occurrences).
 *
 * CC 2.1.x diff (per occurrence):
 * ```
 * -theme:h.union([h.enum(k7$),h.string().startsWith("custom:").transform((q)=>q)]).optional().catch(void 0)
 * +theme:h.string().optional().catch(void 0)
 * ```
 *
 * @param file - The CC bundle source as a string
 * @returns The modified bundle, or null if the schema pattern was not found
 */
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
