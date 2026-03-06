// Please see the note about writing patches in ./index
//
// This patch removes the model name validation from custom agent (.md) frontmatter
// parsing, allowing arbitrary model names like "gemini-2.5-flash" or
// "oai@gemini-3-pro-preview" to be used in the `model:` field of agent definitions.
//
// There are two barriers:
// 1. A Zod schema validates model against enum(VAR) where VAR is the
//    built-in aliases list. We replace this with z.string() to accept any string.
// 2. The model is only included in the returned agent definition if it
//    passes a model list check. We remove that requirement.
//
// The model resolver function already passes through unknown names unchanged,
// so these validations are the only barriers.
//
// CC 2.1.69:
// ```diff
// Patch 1 (Zod schema):
// -model:u.enum(oEH).optional()
// +model:u.string().optional()
//
// Patch 2 (validation flag):
// -");let J=K&&typeof K==="string"&&oEH.includes(K)
// +");let J=K&&typeof K==="string"
// ```

import { showDiff } from './index';

export const writeAllowCustomAgentModels = (file: string): string | null => {
  let newFile = file;

  const zodPattern = /,model:([$\w]+)\.enum\(([$\w]+)\)\.optional\(\)/;

  const zodMatch = newFile.match(zodPattern);
  if (!zodMatch || zodMatch.index === undefined) {
    console.error(
      'patch: allowCustomAgentModels: failed to find Zod enum pattern'
    );
    return null;
  }

  const zodVar = zodMatch[1];
  const modelListVar = zodMatch[2];
  const zodReplacement = `,model:${zodVar}.string().optional()`;
  const zodStart = zodMatch.index;
  const zodEnd = zodStart + zodMatch[0].length;

  newFile = newFile.slice(0, zodStart) + zodReplacement + newFile.slice(zodEnd);

  showDiff(file, newFile, zodReplacement, zodStart, zodEnd);

  const escapedModelListVar = modelListVar.replace(/\$/g, '\\$');
  const validPattern = new RegExp(
    `([;)}])let\\s+([\\$\\w]+)\\s*=\\s*([\\$\\w]+)\\s*&&\\s*typeof\\s+\\3\\s*===\\s*"string"\\s*&&\\s*${escapedModelListVar}\\.includes\\(\\3\\)`
  );

  const beforePatch2 = newFile;

  const validMatch = newFile.match(validPattern);
  if (!validMatch || validMatch.index === undefined) {
    console.error(
      'patch: allowCustomAgentModels: failed to find model validation flag pattern'
    );
    return null;
  }

  const boundaryChar = validMatch[1];
  const flagVar = validMatch[2];
  const modelVar = validMatch[3];
  const validReplacement = `${boundaryChar}let ${flagVar}=${modelVar}&&typeof ${modelVar}==="string"`;
  const validStart = validMatch.index;
  const validEnd = validStart + validMatch[0].length;

  newFile =
    newFile.slice(0, validStart) + validReplacement + newFile.slice(validEnd);

  showDiff(beforePatch2, newFile, validReplacement, validStart, validEnd);

  return newFile;
};
