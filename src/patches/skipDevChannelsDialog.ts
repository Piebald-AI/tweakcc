// Please see the note about writing patches in ./index

/**
 * Accept the "Loading development channels" warning automatically.
 *
 * Starting Claude Code with `--dangerously-load-development-channels` shows a
 * dialog asking to confirm the channels are for local development. Choosing
 * "I am using this for local development" just calls the `onAccept` prop, so
 * the patch makes the component call it right away and draw nothing.
 *
 * CC 2.1.291:
 * ```diff
 *  function k(D){
 * +return queueMicrotask(D.onAccept),null;
 *   let o=w(13),{channels:m,onAccept:h}=D,...
 * ```
 * In native installs the dialog lives in a chunk rather than the entrypoint.
 */

const MARKER = '/* tweakcc:skip-dev-channels-dialog */';

const COMPONENT_PATTERN =
  /(function [$\w]+\(([$\w]+)\)\{)(?=let [$\w]+=[$\w]+\(\d+\),\{channels:[$\w]+,onAccept:[$\w]+\}=\2[,;])/;

const holdsDialog = (source: string): boolean =>
  source.includes('Loading development channels') &&
  COMPONENT_PATTERN.test(source);

/**
 * Patches one source. Returns it unchanged if already patched, or null if the
 * development channels dialog isn't in it.
 */
export const writeSkipDevChannelsDialog = (oldFile: string): string | null => {
  if (oldFile.includes(MARKER)) return oldFile;
  if (!oldFile.includes('Loading development channels')) return null;
  const match = oldFile.match(COMPONENT_PATTERN);
  if (!match || match.index === undefined) return null;

  const [head, , props] = match;
  const insertIndex = match.index + head.length;
  const insertion = `${MARKER}return queueMicrotask(${props}.onAccept),null;`;
  return oldFile.slice(0, insertIndex) + insertion + oldFile.slice(insertIndex);
};

/**
 * Patches the one module, of a split native bundle, that holds the dialog.
 * Returns null unless exactly one module contains it.
 */
export const writeSkipDevChannelsDialogModules = (
  sources: readonly string[]
): string[] | null => {
  const holders = sources.flatMap((source, index) =>
    source.includes(MARKER) || holdsDialog(source) ? [index] : []
  );
  if (holders.length !== 1) {
    console.error(
      `patch: skipDevChannelsDialog: expected one module holding the development channels dialog, found ${holders.length}`
    );
    return null;
  }
  const patched = writeSkipDevChannelsDialog(sources[holders[0]]);
  if (patched === null) return null;
  return sources.map((source, index) =>
    index === holders[0] ? patched : source
  );
};
