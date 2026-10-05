// Please see the note about writing patches in ./index

/**
 * Wrap kitty graphics commands in tmux passthrough so images show up in tmux.
 *
 * Claude Code draws images with kitty graphics Unicode placeholders: it sends
 * the picture once as an APC string (`ESC _ G ... ESC \`), then prints
 * placeholder characters where it goes. tmux drops APC strings it doesn't
 * understand, so only the placeholders arrive and the image shows as a blank
 * box. With `allow-passthrough on`, tmux forwards the payload of
 * `ESC P tmux; ... ESC \` to the outer terminal, with each inner ESC doubled.
 *
 * Every graphics command is built by one small function:
 *
 *   function d(e,n){let o=n===void 0?"":`;${n}`;return`${G}${e}${o}${dgn}`}
 *
 * This wraps its result when TMUX is set. In native installs since 2.1.242 the
 * function lives in a chunk rather than the entrypoint, so the patch is
 * applied to whichever module contains it.
 */

const MARKER = '/* tweakcc:tmux-graphics-passthrough */';

const BUILDER_PATTERN =
  /(function [$\w]+\(([$\w]+),([$\w]+)\)\{let ([$\w]+)=\3===void 0\?"":`;\$\{\3\}`;return)(`\$\{[$\w]+\}\$\{\2\}\$\{\4\}\$\{[$\w]+\}`)\}/;

/** Picks a helper name that no input already uses, to avoid minifier collisions. */
const helperName = (source: string): string => {
  let name = '__tweakccTmuxPassthrough';
  while (source.includes(name)) name += '_';
  return name;
};

const helperFunction = (name: string): string =>
  String.raw`function ${name}(s){return process.env.TMUX?"\x1bPtmux;"+s.replaceAll("\x1b","\x1b\x1b")+"\x1b\\":s}`;

/**
 * Patches one source. Returns it unchanged if already patched, or null if the
 * graphics command builder isn't in it.
 */
export const writeTmuxGraphicsPassthrough = (
  oldFile: string
): string | null => {
  if (oldFile.includes(MARKER)) return oldFile;
  const match = oldFile.match(BUILDER_PATTERN);
  if (!match || match.index === undefined) return null;

  const [whole, head, , , , command] = match;
  const name = helperName(oldFile);
  const replacement = `${MARKER}${helperFunction(name)}${head} ${name}(${command})}`;
  return (
    oldFile.slice(0, match.index) +
    replacement +
    oldFile.slice(match.index + whole.length)
  );
};

/**
 * Patches the one module, of a split native bundle, that builds graphics
 * commands. Returns null unless exactly one module contains the builder.
 */
export const writeTmuxGraphicsPassthroughModules = (
  sources: readonly string[]
): string[] | null => {
  const holders = sources.flatMap((source, index) =>
    source.includes(MARKER) || BUILDER_PATTERN.test(source) ? [index] : []
  );
  if (holders.length !== 1) {
    console.error(
      `patch: tmuxGraphicsPassthrough: expected one module building kitty graphics commands, found ${holders.length}`
    );
    return null;
  }
  const patched = writeTmuxGraphicsPassthrough(sources[holders[0]]);
  if (patched === null) return null;
  return sources.map((source, index) =>
    index === holders[0] ? patched : source
  );
};
