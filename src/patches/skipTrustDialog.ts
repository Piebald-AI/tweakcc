// Please see the note about writing patches in ./index

/**
 * Accept the "Accessing workspace" trust dialog automatically.
 *
 * The dialog asks whether to trust the current folder. Accepting it saves
 * `hasTrustDialogAccepted` for the project (or, in the home directory, trusts
 * only the current session), which other features check later. So instead of
 * hiding the dialog, this patch makes it do exactly what choosing "Yes, I
 * trust this folder" does, then close without drawing anything.
 *
 * The component already has an early return that closes it without drawing,
 * used when the folder is trusted and nothing needs a second confirmation.
 * The patch takes that return every time and runs the accept steps first.
 * The accept handler itself can't be called here: it ignores input that
 * arrives right after the dialog opens.
 *
 * CC 2.1.291:
 * ```diff
 *  mo=function l(cr){...let fo=mT();if(y("onboarding_trust_dialog"),
 *    i("tengu_trust_dialog_accept",{...}),fo)MH(!0),WLe(!0);else lm(zo,ge);M()}
 *  ...
 * -if(Ve("confirm:no",wo,Ho),lo&&!rr){return queueMicrotask(M),null}
 * +if(Ve("confirm:no",wo,Ho),!0){return queueMicrotask(()=>{if(mT())MH(!0),WLe(!0);else lm(zo,ge);M()}),null}
 * ```
 * In native installs the dialog lives in a chunk rather than the entrypoint.
 */

const MARKER = '/* tweakcc:skip-trust-dialog */';

// The accept branch of the dialog's choice handler. Groups: isHomeDir result,
// isHomeDir function, the two session-trust setters, the project config
// updater, its updater argument and storage argument, and onDone.
const ACCEPT_PATTERN =
  /let ([$\w]+)=([$\w]+)\(\);if\([$\w]+\("onboarding_trust_dialog"\),[$\w]+\("tengu_trust_dialog_accept",\{[^}]*\}\),\1\)([$\w]+)\(!0\),([$\w]+)\(!0\);else ([$\w]+)\(([$\w]+),([$\w]+)\);([$\w]+)\(\)\}/;

// The early return that closes the dialog without drawing it.
const EARLY_RETURN_PATTERN =
  /(\("confirm:no",[$\w]+,[$\w]+\),)[$\w]+&&![$\w]+(\)\{return queueMicrotask\()([$\w]+)(\),null\})/;

/**
 * Patches one source. Returns it unchanged if already patched, or null if the
 * trust dialog isn't in it.
 */
export const writeSkipTrustDialog = (oldFile: string): string | null => {
  if (oldFile.includes(MARKER)) return oldFile;
  const accept = oldFile.match(ACCEPT_PATTERN);
  if (!accept) return null;
  const [, , isHomeDir, setTrustA, setTrustB, update, updater, storage, done] =
    accept;

  const early = oldFile.match(EARLY_RETURN_PATTERN);
  if (!early || early.index === undefined || early[3] !== done) return null;

  const acceptSteps = `if(${isHomeDir}())${setTrustA}(!0),${setTrustB}(!0);else ${update}(${updater},${storage});${done}()`;
  const replacement = `${early[1]}!0${early[2]}()=>{${MARKER}${acceptSteps}}${early[4]}`;
  const start = early.index;
  return (
    oldFile.slice(0, start) +
    replacement +
    oldFile.slice(start + early[0].length)
  );
};

/**
 * Patches the one module, of a split native bundle, that holds the trust
 * dialog. Returns null unless exactly one module contains it.
 */
export const writeSkipTrustDialogModules = (
  sources: readonly string[]
): string[] | null => {
  const holders = sources.flatMap((source, index) =>
    source.includes(MARKER) || ACCEPT_PATTERN.test(source) ? [index] : []
  );
  if (holders.length !== 1) {
    console.error(
      `patch: skipTrustDialog: expected one module holding the trust dialog, found ${holders.length}`
    );
    return null;
  }
  const patched = writeSkipTrustDialog(sources[holders[0]]);
  if (patched === null) {
    console.error('patch: skipTrustDialog: failed to find the early return');
    return null;
  }
  return sources.map((source, index) =>
    index === holders[0] ? patched : source
  );
};
