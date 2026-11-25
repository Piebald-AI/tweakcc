// Please see the note about writing patches in ./index
//
// Code Mode Schema Defaults Patch - keep `default` in Code Mode's TypeScript tool types
//
// Code Mode shows each tool's input to the model as a TypeScript type, made
// from the tool's JSON Schema: the REPL description's `interface Tools` for
// the built-in tools a script can call, and searchTools' `input` for the
// others. A field's facts (integer, minimum, format, pattern, default) are
// added to its doc comment only when the printer is asked for them:
//
// CC 2.1.332 (chunk-vm2n0e41.js):
//   function X(e,n,o){if(!o.hasFacts)return e;let t=n.filter(h).flatMap((r)=>[...U(r),
//     ...["format","pattern","default"].flatMap((s)=>{...return[`${s} ${l}`]})]);
//     return t.length===0?e:`${e??""} (${D(t.join(", "),o)})`.trimStart()}
//
// `interface Tools` is always printed without facts, and searchTools asks for
// them only for an MCP tool and only while the type fits its length budget.
// So a field whose default lives only in the schema (as the MCP spec expects)
// shows as a bare optional field, and the model leaves it out without knowing
// what the server will use, for example a 5 s timeout (#111592).
//
// This patch keeps `default` in every printed type: without facts the doc
// comment still ends in "(default 5000)"; the other facts stay as they are.
// The default is printed with JSON.stringify, so the text is the same every
// time for the same schema.

import { showDiff } from './index';

export const writeCodeModeSchemaDefaults = (oldFile: string): string | null => {
  const pattern =
    /\{if\(!([$\w]+)\.hasFacts\)return [$\w]+;(let [$\w]+=[$\w]+\.filter\([$\w]+\)\.flatMap\(\(([$\w]+)\)=>\[)\.\.\.([$\w]+)\(\3\),\.\.\.(\["format","pattern","default"\])\.flatMap\(/g;
  const matches = [...oldFile.matchAll(pattern)];
  if (matches.length !== 1) {
    console.error(
      `patch: codeModeSchemaDefaults: expected one schema facts printer, found ${matches.length}`
    );
    return null;
  }

  const [whole, state, head, schema, facts, names] = matches[0];
  const replacement = `{${head}...${state}.hasFacts?${facts}(${schema}):[],...(${state}.hasFacts?${names}:["default"]).flatMap(`;
  const start = matches[0].index!;
  const end = start + whole.length;
  const newFile = oldFile.slice(0, start) + replacement + oldFile.slice(end);

  showDiff(oldFile, newFile, replacement, start, end);

  return newFile;
};
