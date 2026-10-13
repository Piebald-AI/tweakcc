/**
 * The native installer re-verifies an already-installed version before it
 * activates it: the retained file is hashed and compared with the checksum in
 * Anthropic's signed release manifest, and on a mismatch the version is
 * downloaded again. A binary tweakcc patched never matches, so any Claude Code
 * process of another version (`claude update`, `claude install <v>`, or the
 * REPL auto-updater of an older, still-running session) silently replaces it
 * with the stock build.
 *
 * This patch makes both re-verification points also accept the exact file
 * tweakcc last wrote at that path: its SHA-256 must equal the one tweakcc
 * recorded for that version in `applied.json`. Everything else is unchanged:
 * the manifest is still fetched and its signature still verified, any other
 * mismatch is still re-downloaded, and new downloads are still checked
 * against the signed checksum.
 */

const ID = '[$\\w]+';
const MARKER = '/* tweakcc:keep-patched-binary */';

const escapeName = (name: string) => name.replace(/\$/g, '\\$');

/** Finds exactly one match, or null. */
const unique = (source: string, pattern: RegExp) => {
  const matches = [...source.matchAll(new RegExp(pattern.source, 'g'))];
  return matches.length === 1 ? matches[0] : null;
};

/**
 * Runtime predicate injected into the installer module. True only when the
 * file at `file` hashes to the SHA-256 tweakcc recorded for `version` at that
 * (real) path. Any error means "no". Uses process.getBuiltinModule: Bun
 * 1.4.3 segfaults on import.meta.require in this lazily loaded module.
 */
const keepFunction = (name: string, recordFile: string) =>
  `async function ${name}(version,file){try{const fs=process.getBuiltinModule("fs"),key=fs.realpathSync(file),entry=JSON.parse(fs.readFileSync(${JSON.stringify(recordFile)},"utf8")).binaries?.[key];if(!entry||entry.version!==version||!/^[0-9a-f]{64}$/.test(entry.sha256))return!1;const hash=process.getBuiltinModule("crypto").createHash("sha256");for await(const chunk of fs.createReadStream(key))hash.update(chunk);return hash.digest("hex")===entry.sha256}catch{return!1}}`;

export const writeKeepPatchedBinary = (
  file: string,
  recordFile: string
): string | null => {
  if (file.includes(MARKER)) return file;

  // 1. Re-verification against the signed manifest (`it` in 2.1.296).
  const manifest = unique(
    file,
    new RegExp(
      `(${ID})=(${ID})!==void 0&&await (${ID})\\((${ID}),\\2\\);if\\(!\\1\\)(${ID})\\(\`Retained \\$\\{(${ID})\\} does not match its signed manifest checksum; re-downloading\`\\);`
    )
  );
  // 2. Re-verification against a checksum this process verified earlier.
  const cached = unique(
    file,
    new RegExp(
      `if\\(!await (${ID})\\((${ID}),(${ID})\\.checksum\\)\\)(${ID})\\(\`Retained \\$\\{(${ID})\\} no longer matches the checksum verified earlier in this process; re-downloading\``
    )
  );
  if (!manifest || !cached) {
    console.error('patch: keepPatchedBinary: failed to find installer checks');
    return null;
  }
  const [, matches, checksum, , binary, log, version] = manifest;
  const [, , installPath, record, cachedLog, cachedVersion] = cached;
  // The checksum later handed to activation (Windows copies the launcher and
  // re-checks it against this value), declared alongside the cached record.
  const expected = unique(
    file,
    new RegExp(`(${ID})=${ID}\\?void 0:${escapeName(record)}\\?\\.checksum,`)
  );
  if (!expected) {
    console.error('patch: keepPatchedBinary: failed to find checksum binding');
    return null;
  }

  let keep = '__tweakccKeepPatchedBinary';
  while (file.includes(keep)) keep += '_';

  const accept =
    `if(!${matches}&&${checksum}!==void 0&&await ${keep}(${version},${binary}))` +
    `return ${log}(\`Retained \${${version}} is the binary tweakcc recorded; keeping it\`),` +
    `{signatureVerified:!1,binaryMatches:!0,expectedChecksum:void 0};`;
  const edits = [
    {
      start: manifest.index! + manifest[0].indexOf(`if(!${matches})`),
      end: manifest.index! + manifest[0].indexOf(`if(!${matches})`),
      text: accept,
    },
    {
      start: cached.index!,
      end: cached.index! + cached[0].indexOf(`)${cachedLog}(`) + 1,
      text: cached[0]
        .slice(0, cached[0].indexOf(`)${cachedLog}(`))
        .concat(
          `&&!(await ${keep}(${cachedVersion},${installPath})&&(${expected[1]}=void 0,!0)))`
        ),
    },
  ].sort((a, b) => b.start - a.start);

  let result = file;
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return `${result}\n${MARKER}\n${keepFunction(keep, recordFile)}\n`;
};
