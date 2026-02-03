// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Patches the CLAUDE.md file reading function to also check for alternative
 * filenames (e.g., AGENTS.md).
 *
 * This finds the function that reads CLAUDE.md files and modifies it to:
 * 1. First try the original CLAUDE.md path
 * 2. If not found, try each alternative name in order
 *
 * CC 1.0.24:
 * ```diff
 *  function gE2(A, B) {
 *    try {
 *      if (f1().existsSync(A)) {
 *        if (!f1().statSync(A).isFile()) return null;
 *        let I = f1().readFileSync(A, { encoding: "utf-8" });
 *        return { path: A, type: B, content: I };
 * +    } else if (A.endsWith("/CLAUDE.md") || A.endsWith("\\CLAUDE.md")) {
 * +      for (let alt of ["AGENTS.md", "GEMINI.md", "QWEN.md"]) {
 * +        let altPath = A.slice(0, -9) + alt;
 * +        if (f1().existsSync(altPath) && f1().statSync(altPath).isFile())
 * +          return gE2(altPath, B);
 * +      }
 * +    }
 *    } catch (Q) {
 *      if (Q instanceof Error && Q.message.includes("EACCES"))
 *        N1("tengu_claude_md_permission_error", {
 *          is_access_error: 1,
 *          has_home_dir: A.includes(z4()) ? 1 : 0,
 *        });
 *    }
 *    return null;
 *  }
 * ```
 *
 * CC 2.0.0:
 * ```
 *  function q8B(A, B) {
 *    try {
 *      if (C1().existsSync(A)) {
 *        if (!C1().statSync(A).isFile()) return null;
 *        let Z = C1().readFileSync(A, { encoding: "utf-8" });
 *        return { path: A, type: B, content: Z };
 * +    } else if (A.endsWith("/CLAUDE.md") || A.endsWith("\\CLAUDE.md")) {
 * +      for (let alt of ["AGENTS.md", "GEMINI.md", "QWEN.md"]) {
 * +        let altPath = A.slice(0, -9) + alt;
 * +        if (C1().existsSync(altPath) && C1().statSync(altPath).isFile())
 * +          return q8B(altPath, B);
 * +      }
 *      }
 *    } catch (Q) {
 *      if (Q instanceof Error && Q.message.includes("EACCES"))
 *        B1("tengu_claude_md_permission_error", {
 *          is_access_error: 1,
 *          has_home_dir: A.includes(p2()) ? 1 : 0,
 *        });
 *    }
 *    return null;
 *  }
 * ```
 *
 * CC 2.1.29:
 * ```
 *  function _t7(A, q) {
 *    try {
 *      let K = x1();
 * -    if (!K.existsSync(A) || !K.statSync(A).isFile()) return null;
 * +    if (!K.existsSync(A) || !K.statSync(A).isFile()) {
 * +      if (A.endsWith("/CLAUDE.md") || A.endsWith("\\CLAUDE.md")) {
 * +        for (let alt of ["AGENTS.md", "GEMINI.md", "QWEN.md"]) {
 * +          let altPath = A.slice(0, -9) + alt;
 * +          if (K.existsSync(altPath) && K.statSync(altPath).isFile())
 * +            return _t7(altPath, q);
 * +        }
 * +      }
 * +      return null;
 * +    }
 *      let Y = UL9(A).toLowerCase();
 *      if (Y && !dL9.has(Y))
 *        return (I(`Skipping non-text file in @include: ${A}`), null);
 *      let z = K.readFileSync(A, { encoding: "utf-8" }),
 *        { content: w, paths: H } = cL9(z);
 *      return { path: A, type: q, content: w, globs: H };
 *    } catch (K) {
 *      if (K instanceof Error && K.message.includes("EACCES"))
 *        n("tengu_claude_md_permission_error", {
 *          is_access_error: 1,
 *          has_home_dir: A.includes(_8()) ? 1 : 0,
 *        });
 *    }
 *    return null;
 *  }
 * ```
 */
export const writeAgentsMd = (
  file: string,
  altNames: string[]
): string | null => {
  // Step 1: Find the function that handles CLAUDE.md file reading
  // Pattern: function xyz(a, b) { ...... return { ... path: ..., content: ... } }
  const funcPattern =
    /function ([$\w]+)\(([$\w]+),([$\w]+)\).{0,400}\{path:[$\w]+,.{1,20}?content:[$\w]+/;

  const funcMatch = file.match(funcPattern);

  if (!funcMatch || funcMatch.index === undefined) {
    console.error('patch: agentsMd: failed to find CLAUDE.md reading function');
    return null;
  }

  const functionName = funcMatch[1];
  const firstParam = funcMatch[2];
  const secondParam = funcMatch[3];
  const funcStart = funcMatch.index;

  // Step 2: Find the fs expression used in the function
  // Search within the matched region for fsVar.readFileSync etc. or fsVar().readFileSync etc.
  const fsPattern = /([$\w]+(?:\(\))?)\.(?:readFileSync|existsSync|statSync)/;
  const fsMatch = funcMatch[0].match(fsPattern);

  if (!fsMatch) {
    console.error('patch: agentsMd: failed to find fs expression in function');
    return null;
  }

  const fsExpr = fsMatch[1];

  // Prepare the alternative names as JSON
  const altNamesJson = JSON.stringify(altNames);

  // Build the injection code
  const buildInjection = () =>
    `if(${firstParam}.endsWith("/CLAUDE.md")||${firstParam}.endsWith("\\\\CLAUDE.md")){for(let alt of ${altNamesJson}){let altPath=${firstParam}.slice(0,-9)+alt;if(${fsExpr}.existsSync(altPath)&&${fsExpr}.statSync(altPath).isFile())return ${functionName}(altPath,${secondParam});}}return null;`;

  // Step 3: Try the primary pattern (CC 2.1.29)
  // Pattern: if(!fs.existsSync(path)||!fs.statSync(path).isFile())return null;
  const primaryPattern =
    /(if\(![$\w]+\.existsSync\([$\w]+\)\|\|![$\w]+\.statSync\([$\w]+\)\.isFile\(\)\))return null;/;
  const primaryMatch = file.slice(funcStart).match(primaryPattern);

  if (primaryMatch && primaryMatch.index !== undefined) {
    const injection = buildInjection();
    const replacement = primaryMatch[1] + '{' + injection + '}';

    const startIndex = funcStart + primaryMatch.index;
    const endIndex = startIndex + primaryMatch[0].length;

    const newFile =
      file.slice(0, startIndex) + replacement + file.slice(endIndex);

    showDiff(file, newFile, replacement, startIndex, endIndex);

    return newFile;
  }

  // Step 4: Try the fallback pattern (uses }catch or }}catch)
  // Pattern: }catch or }}catch
  const fallbackPattern = /(\})(}catch)/;
  const fallbackMatch = file.slice(funcStart).match(fallbackPattern);

  if (fallbackMatch && fallbackMatch.index !== undefined) {
    const injection = `else if(${firstParam}.endsWith("/CLAUDE.md")||${firstParam}.endsWith("\\\\CLAUDE.md")){for(let alt of ${altNamesJson}){let altPath=${firstParam}.slice(0,-9)+alt;if(${fsExpr}.existsSync(altPath)&&${fsExpr}.statSync(altPath).isFile())return ${functionName}(altPath,${secondParam});}}`;
    const replacement = fallbackMatch[1] + injection + fallbackMatch[2];

    const startIndex = funcStart + fallbackMatch.index;
    const endIndex = startIndex + fallbackMatch[0].length;

    const newFile =
      file.slice(0, startIndex) + replacement + file.slice(endIndex);

    showDiff(file, newFile, replacement, startIndex, endIndex);

    return newFile;
  }

  console.error(
    'patch: agentsMd: failed to find insertion point in function body'
  );
  return null;
};
