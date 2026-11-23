// Please see the note about writing patches in ./index
//
// Feature Flag Overrides Patch - restore CLAUDE_INTERNAL_FC_OVERRIDES
//
// Claude Code reads its GrowthBook feature flags through one client class.
// Every lookup asks `getEnvironmentOverrides()` first, and the client's deps
// still hand it the CLAUDE_INTERNAL_FC_OVERRIDES env var, but public builds
// stub the method out, so the variable does nothing:
//
// CC 2.1.330 (chunk-wxs996br.js):
//   readEnvironmentOverrides:()=>$6t()?void 0:s.CLAUDE_INTERNAL_FC_OVERRIDES,
//   ...
//   getEnvironmentOverrides(){return null}
//
// This patch makes the method parse the variable as a JSON object of
// flag name -> value, e.g.
//   CLAUDE_INTERNAL_FC_OVERRIDES='{"tengu_fizzy_grove":true}'
// An unset, empty or invalid value means no overrides. The parsed object is
// kept until the variable's text changes.

import { showDiff } from './index';

const STUB = 'getEnvironmentOverrides(){return null}';

const OVERRIDES =
  'getEnvironmentOverrides(){' +
  'let e=this.deps.readEnvironmentOverrides?.();' +
  'if(!e)return null;' +
  'if(e!==this.tweakccFcRaw){' +
  'this.tweakccFcRaw=e;' +
  'let r=null;' +
  'try{r=JSON.parse(e)}catch{}' +
  'this.tweakccFc=r&&typeof r=="object"&&!Array.isArray(r)?r:null' +
  '}' +
  'return this.tweakccFc}';

export const writeFeatureFlagOverrides = (oldFile: string): string | null => {
  const index = oldFile.indexOf(STUB);
  if (index === -1 || !oldFile.includes('readEnvironmentOverrides:')) {
    console.error(
      'patch: featureFlagOverrides: failed to find the stubbed getEnvironmentOverrides()'
    );
    return null;
  }

  const newFile =
    oldFile.slice(0, index) + OVERRIDES + oldFile.slice(index + STUB.length);

  showDiff(oldFile, newFile, OVERRIDES, index, index + STUB.length);

  return newFile;
};
