// Please see the note about writing patches in ./index

import { escapeIdent, globalReplace, LocationResult, showDiff } from './index';

const getOpenDocumentLocation = (oldFile: string): LocationResult | null => {
  // Step 1: Find `ensureServerStarted:[$\w]+`
  const ensureServerStartedPattern = /ensureServerStarted:([$\w]+)/;
  const ensureMatch = oldFile.match(ensureServerStartedPattern);
  if (!ensureMatch || ensureMatch.index === undefined) {
    console.error('patch: fixLspSupport: failed to find ensureServerStarted');
    return null;
  }

  // Step 2: Get a window around the match
  const windowStart = Math.max(0, ensureMatch.index - 50);
  const windowEnd = Math.min(oldFile.length, ensureMatch.index + 50);
  const window = oldFile.slice(windowStart, windowEnd);

  // Step 3: Search for sendRequest in the window
  const sendRequestPattern = /sendRequest:([$\w]+)[,}]/;
  const sendRequestMatch = window.match(sendRequestPattern);
  if (!sendRequestMatch) {
    console.error(
      `patch: fixLspSupport: failed to find sendRequest near ensureServerStarted, window=${JSON.stringify([windowStart, windowEnd, window])}`
    );
    return null;
  }

  // Step 4: Store the varname
  const varName = sendRequestMatch[1];

  // Step 5: In the previous 1000-2000 characters, search for `async function {varName}\([$\w]+,`
  const searchStart = Math.max(0, ensureMatch.index - 2000);
  const searchChunk = oldFile.slice(searchStart, ensureMatch.index);
  const functionPattern = new RegExp(
    `async function ${escapeIdent(varName)}\\(([$\\w]+),`,
    'g'
  );
  let functionMatch;
  let lastMatch = null;
  while ((functionMatch = functionPattern.exec(searchChunk)) !== null) {
    lastMatch = functionMatch;
  }

  if (!lastMatch) {
    console.error(
      `patch: fixLspSupport: failed to find async function ${varName}`
    );
    return null;
  }

  // Step 7: Store the matched param name as `documentPathVar`
  const documentPathVar = lastMatch[1];

  // Step ii.1: Match the 2nd line of sendRequest `let ([$\w]+)=await [$\w]+\([$\w]+\);`
  const functionStart = searchStart + lastMatch.index;
  const functionBody = oldFile.slice(functionStart, ensureMatch.index);
  const secondLinePattern = /let ([$\w]+)=await [$\w]+\([$\w]+\);/;
  const secondLineMatch = functionBody.match(secondLinePattern);
  if (!secondLineMatch || secondLineMatch.index === undefined) {
    console.error(
      'patch: fixLspSupport: failed to find second line of sendRequest'
    );
    return null;
  }

  // Step ii.2: Store the first var in there as serverVar
  const serverVar = secondLineMatch[1];

  // Step ii.3: Find the if(!serverVar)return; line after the second line
  const afterSecondLine =
    functionStart + secondLineMatch.index + secondLineMatch[0].length;
  const remainingBody = oldFile.slice(afterSecondLine, ensureMatch.index);
  const ifReturnPattern = new RegExp(
    `if\\(!${escapeIdent(serverVar)}\\)return;`
  );
  const ifReturnMatch = remainingBody.match(ifReturnPattern);

  if (!ifReturnMatch || ifReturnMatch.index === undefined) {
    console.error(
      'patch: fixLspSupport: failed to find if(!serverVar)return; line'
    );
    return null;
  }

  // Calculate insertion point (right after the if(!serverVar)return; line)
  const insertionPoint =
    afterSecondLine + ifReturnMatch.index + ifReturnMatch[0].length;

  return {
    startIndex: insertionPoint,
    endIndex: insertionPoint,
    identifiers: [documentPathVar, serverVar],
  };
};

export const writeFixLspSupport = (oldFile: string): string | null => {
  // Patch 1: Comment out the validation by replacing with nothing
  const validationPattern1 =
    /if\([$\w]+\.restartOnCrash!==void 0\)throw Error\(`LSP server '\$\{[$\w]+\}': restartOnCrash is not yet implemented\. Remove this field from the configuration\.`\);/g;
  const validationPattern2 =
    /if\([$\w]+\.startupTimeout!==void 0\)throw Error\(`LSP server '\$\{[$\w]+\}': startupTimeout is not yet implemented\. Remove this field from the configuration\.`\);/g;
  const validationPattern3 =
    /if\([$\w]+\.shutdownTimeout!==void 0\)throw Error\(`LSP server '\$\{[$\w]+\}': shutdownTimeout is not yet implemented\. Remove this field from the configuration\.`\);/g;

  let content = oldFile;

  // Replace first validation
  content = globalReplace(content, validationPattern1, '');

  // Replace second validation
  content = globalReplace(content, validationPattern2, '');

  // Replace third validation
  content = globalReplace(content, validationPattern3, '');

  // Patch 2: Add the openDocument patch
  const location = getOpenDocumentLocation(content);
  if (!location || !location.identifiers) {
    return null;
  }

  const [docPathVar, serverVar] = location.identifiers;

  const newContent = `
  const path = await import('path');
  const ext = path.extname(${docPathVar}).toLowerCase();
  const langMap = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.mts': 'typescript',
    '.cts': 'typescript',
    '.py': 'python',
    '.pyi': 'python',
    '.pyw': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.scala': 'scala',
    '.sc': 'scala',
    '.groovy': 'groovy',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.c++': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.hh': 'cpp',
    '.hxx': 'cpp',
    '.h++': 'cpp',
    '.cs': 'csharp',
    '.csx': 'csharp',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.php': 'php',
    '.phtml': 'php',
    '.php3': 'php',
    '.php4': 'php',
    '.php5': 'php',
    '.phps': 'php',
    '.rb': 'ruby',
    '.rbw': 'ruby',
    '.rake': 'ruby',
    '.gemspec': 'ruby',
    '.sh': 'shellscript',
    '.bash': 'shellscript',
    '.zsh': 'shellscript',
    '.fish': 'fish',
    '.swift': 'swift',
    '.m': 'objective-c',
    '.mm': 'objective-cpp',
    '.lua': 'lua',
    '.pl': 'perl',
    '.pm': 'perl',
    '.t': 'perl',
    '.pod': 'perl',
    '.r': 'r',
    '.R': 'r',
    '.rmd': 'rmd',
    '.Rmd': 'rmd',
    '.ex': 'elixir',
    '.exs': 'elixir',
    '.erl': 'erlang',
    '.hrl': 'erlang',
    '.hs': 'haskell',
    '.lhs': 'haskell',
    '.ml': 'ocaml',
    '.mli': 'ocaml',
    '.clj': 'clojure',
    '.cljs': 'clojure',
    '.cljc': 'clojure',
    '.edn': 'clojure',
    '.json': 'json',
    '.jsonc': 'jsonc',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.ini': 'ini',
    '.cfg': 'ini',
    '.conf': 'conf',
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.mdown': 'markdown',
    '.rst': 'restructuredtext',
    '.tex': 'latex',
    '.sql': 'sql',
    '.graphql': 'graphql',
    '.gql': 'graphql',
    '.dart': 'dart',
    '.jl': 'julia',
    '.zig': 'zig',
    '.nim': 'nim',
    '.nims': 'nim',
    '.cr': 'crystal',
    '.d': 'd',
    '.di': 'd',
    '.fs': 'fsharp',
    '.fsx': 'fsharp',
    '.fsi': 'fsharp',
    '.ps1': 'powershell',
    '.psm1': 'powershell',
    '.psd1': 'powershell',
    '.bat': 'bat',
    '.cmd': 'bat',
    '.mk': 'makefile',
    '.dockerfile': 'dockerfile',
    '.proto': 'proto',
    '.vhd': 'vhdl',
    '.vhdl': 'vhdl',
    '.v': 'verilog',
    '.sv': 'systemverilog',
    '.asm': 'asm',
    '.s': 'asm',
    '.f': 'fortran',
    '.f90': 'fortran',
    '.f95': 'fortran',
    '.cob': 'cobol',
    '.cbl': 'cobol',
    '.ada': 'ada',
    '.adb': 'ada',
    '.ads': 'ada',
    '.sol': 'solidity',
    '.vue': 'vue',
    '.svelte': 'svelte',
    '.astro': 'astro',
    '.tf': 'terraform',
    '.tfvars': 'terraform',
    '.prisma': 'prisma'
  };
  const languageId = langMap[ext] || 'plaintext';
  try {
    const fs = await import('fs/promises');
    const text = await fs.readFile(${docPathVar}, 'utf8');
    await ${serverVar}.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: "file://" + ${docPathVar},
        languageId: languageId,
        version: 1,
        text: text
      }
    });
  } catch (openErr) { }
`;

  const newFile =
    content.slice(0, location.startIndex) +
    newContent +
    content.slice(location.endIndex);

  showDiff(
    content,
    newFile,
    newContent,
    location.startIndex,
    location.endIndex
  );

  return newFile;
};
