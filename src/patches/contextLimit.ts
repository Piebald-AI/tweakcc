// Please see the note about writing patches in ./index

// CC 2.1.2xx resolves every model's effective window in one function, so
// 1M-context models (the default Sonnet/Opus) never read the 200000
// constants patched below:
//   function Hg(e,n){let r=yh();if(r!==void 0)return r;if(PLr(e,n))return Sq;return bh(e,n)}
// Make the env var win there too.
const patchEffectiveWindow = (file: string): string => {
  const pattern =
    /function ([$\w]+)\(([$\w]+),([$\w]+)\)\{(?=let ([$\w]+)=[$\w]+\(\);if\(\4!==void 0\)return \4;if\([$\w]+\(\2,\3\)\)return [$\w]+;return [$\w]+\(\2,\3\)\})/;
  const m = file.match(pattern);
  if (!m || m.index === undefined) return file;
  const insertAt = m.index + m[0].length;
  return (
    file.slice(0, insertAt) +
    'let tweakccContextLimit=+process.env.CLAUDE_CODE_CONTEXT_LIMIT;if(tweakccContextLimit>0)return tweakccContextLimit;' +
    file.slice(insertAt)
  );
};

export const writeContextLimit = (oldFile: string): string | null => {
  const patched = writeContextLimitConstants(oldFile);
  return patched === null ? null : patchEffectiveWindow(patched);
};

const writeContextLimitConstants = (oldFile: string): string | null => {
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

  // CC 2.1.2xx dropped the 20000 constant from the same declaration:
  //   var UMe=200000,wz=200000,A_=32000,EO=128000;
  const dualNoReservePattern =
    /var ([\w$]+)=200000,([\w$]+)=200000,([\w$]+)=32000,([\w$]+)=(128000|64000);/;
  if (dualNoReservePattern.test(oldFile)) {
    return oldFile.replace(
      dualNoReservePattern,
      (_m, v1, v2, v3, v4, lit) =>
        `var ${v1}=${replacement},${v2}=${replacement},${v3}=32000,${v4}=${lit};`
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
