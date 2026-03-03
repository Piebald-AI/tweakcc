// Please see the note about writing patches in ./index

import { globalReplace } from './index';

export const writeContextLimit = (oldFile: string): string | null => {
  return globalReplace(
    oldFile,
    /\b200000\b/,
    'process.env.CLAUDE_CODE_CONTEXT_LIMIT'
  );
};
