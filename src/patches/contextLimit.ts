// Please see the note about writing patches in ./index

export const writeContextLimit = (oldFile: string): string | null => {
  const replacement = '(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||200000)';
  const pattern =
    /var ([\w$]+)=200000,([\w$]+)=20000,([\w$]+)=32000,([\w$]+)=(128000|64000);/;
  const match = oldFile.match(pattern);

  if (!match) {
    console.error(
      'patch: contextLimit: failed to find context limit constants'
    );
    return null;
  }

  return oldFile.replace(
    pattern,
    `var ${match[1]}=${replacement},${match[2]}=20000,${match[3]}=32000,${match[4]}=${match[5]};`
  );
};
