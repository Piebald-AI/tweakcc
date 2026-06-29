// Please see the note about writing patches in ./index

export const writeContextLimit = (oldFile: string): string | null => {
  const replacement = '(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||200000)';

  // CC >=2.1.193 split the context window into two 200000 constants: the
  // window SIZE (used for %-left/threshold math, with a 1e6 alternative) and
  // the model-default / auto-compact THRESHOLD. Override both so the env var
  // keeps them consistent; both default to 200000 so behavior is unchanged
  // when the env var is unset. A replacement function is used (rather than a
  // template-string replacement) so minified `$`-containing var names are not
  // mangled by String.prototype.replace's `$` substitution.
  const dualPattern =
    /var ([\w$]+)=200000,([\w$]+)=200000,([\w$]+)=20000,([\w$]+)=32000,([\w$]+)=(128000|64000);/;
  if (dualPattern.test(oldFile)) {
    return oldFile.replace(
      dualPattern,
      (_m, v1, v2, v3, v4, v5, lit) =>
        `var ${v1}=${replacement},${v2}=${replacement},${v3}=20000,${v4}=32000,${v5}=${lit};`
    );
  }

  // Older CC: a single 200000 context-window constant.
  const singlePattern =
    /var ([\w$]+)=200000,([\w$]+)=20000,([\w$]+)=32000,([\w$]+)=(128000|64000);/;
  if (singlePattern.test(oldFile)) {
    return oldFile.replace(
      singlePattern,
      (_m, v1, v2, v3, v4, lit) =>
        `var ${v1}=${replacement},${v2}=20000,${v3}=32000,${v4}=${lit};`
    );
  }

  console.error('patch: contextLimit: failed to find context limit constants');
  return null;
};
