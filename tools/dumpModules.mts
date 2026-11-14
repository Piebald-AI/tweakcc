// Writes the module map that `promptExtractor.js --modules` reads: each
// JavaScript module's source, and each text module as `var __t = <JSON>;`.
//
//   pnpm tsx tools/dumpModules.mts <claude-binary> <modules.json>
import * as fs from 'node:fs';

import { extractClaudeJsModulesFromNativeInstallation } from '../src/nativeInstallation';
import {
  javaScriptModuleSources,
  textModuleSources,
} from '../src/patches/nativeGraphDispatcher';

const [binary, output] = process.argv.slice(2);
if (!binary || !output) {
  console.error(
    'Usage: pnpm tsx tools/dumpModules.mts <claude-binary> <modules.json>'
  );
  process.exit(1);
}

const graph = extractClaudeJsModulesFromNativeInstallation(binary);
if (!graph) {
  console.error(`Could not read the JavaScript modules of ${binary}`);
  process.exit(1);
}
const modules: Record<string, string> = {};
for (const [name, source] of javaScriptModuleSources(graph))
  modules[name] = source;
for (const [name, text] of textModuleSources(graph))
  modules[name] = `var __t = ${JSON.stringify(text)};`;

fs.writeFileSync(output, JSON.stringify(modules));
console.log(`Wrote ${Object.keys(modules).length} modules to ${output}`);
