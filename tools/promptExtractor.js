#!/usr/bin/env node

const fs = require('fs');
const parser = require('@babel/parser');

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateInput(text, minLength = 500) {
  if (!text || typeof text !== 'string') return false;

  // ////////////////
  // What to include.
  // ////////////////

  // Context about Git status
  if (text.startsWith('This is the git status')) return true;

  // Include the system reminder accompanying every Read tool.
  if (text.includes('Whenever you read a file, you should consider whether it')) return true;

  // Another prompt smaller then 500 characters that should be included
  if (text.includes('IMPORTANT: Assist with authorized security testing'))
    return true;

  // ////////////////
  // What to exclude.
  // ////////////////

  // In one specific case, some of the TUI code shows up in the prompts files.  Exclude it.
  if (text.includes('.dim("Note:')) return false;

  // CLI help text for `claude mcp add` is not a prompt - it's user-facing documentation.
  if (text.startsWith('Add an MCP server to Claude Code.')) return false;

  // Skip the warning about keybindings when connecting to a remote server.
  if (text.includes('Cannot install keybindings from a remote')) return false;

  if (text.length < minLength) return false;

  const first10 = text.substring(0, 10);
  if (first10.startsWith('AGFzbQ') || /^[A-Z0-9+/=]{10}$/.test(first10)) {
    return false;
  }

  const sample = text.substring(0, 500);
  const words = sample.split(/\s+/).filter(w => w.length > 0);

  if (words.length === 0) return false;

  const uppercaseWords = words.filter(
    w => w === w.toUpperCase() && /[A-Z]/.test(w)
  );
  const uppercaseRatio = uppercaseWords.length / words.length;

  if (uppercaseRatio > 0.6) {
    return false;
  }

  const lowerText = text.toLowerCase();
  const hasYou = lowerText.includes('you');
  const hasAI = lowerText.includes('ai') || lowerText.includes('assistant');
  const hasInstruct =
    lowerText.includes('must') ||
    lowerText.includes('should') ||
    lowerText.includes('always');

  if (!hasYou && !hasAI && !hasInstruct) {
    return false;
  }

  const sentencePattern = /[.!?]\s+[A-Z\(]/;
  const hasSentences = sentencePattern.test(text);
  if (!hasSentences) {
    return false;
  }

  const avgWordLength =
    words.reduce((sum, w) => sum + w.length, 0) / words.length;

  if (avgWordLength > 15) {
    return false;
  }

  const spaceCount = (sample.match(/\s/g) || []).length;
  const spaceRatio = spaceCount / sample.length;

  if (spaceRatio < 0.1) {
    return false;
  }

  return true;
}

function extractStrings(filepath, minLength = 500) {
  const code = fs.readFileSync(filepath, 'utf-8');

  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  const stringData = [];

  const traverse = node => {
    if (!node || typeof node !== 'object') return;

    // Extract string literals
    if (node.type === 'StringLiteral') {
      if (validateInput(node.value, minLength)) {
        stringData.push({
          name: '',
          id: '',
          description: '',
          pieces: [node.value],
          identifiers: [],
          identifierMap: {},
          start: node.start,
          end: node.end,
        });
      }
    }

    // Extract template literals
    if (node.type === 'TemplateLiteral') {
      const { expressions } = node;

      // Extract the entire template content directly from source (excluding backticks)
      const contentStart = node.start + 1; // After opening backtick
      const contentEnd = node.end - 1; // Before closing backtick
      const fullContent = code.substring(contentStart, contentEnd);

      // Validate before processing
      if (!validateInput(fullContent, minLength)) {
        return;
      }

      // Collect all identifiers with their positions
      const allIdentifiers = []; // Array of {name, start, end} sorted by position

      for (let i = 0; i < expressions.length; i++) {
        const expr = expressions[i];

        const traverseExpr = (exprNode, isTopLevel = true) => {
          if (!exprNode || typeof exprNode !== 'object') return;

          if (exprNode.type === 'Identifier' && isTopLevel) {
            allIdentifiers.push({
              name: exprNode.name,
              start: exprNode.start - contentStart,
              end: exprNode.end - contentStart,
            });
          }

          if (exprNode.type === 'CallExpression') {
            traverseExpr(exprNode.callee, true);
            if (exprNode.arguments) {
              exprNode.arguments.forEach(arg => traverseExpr(arg, true));
            }
            return;
          }

          if (exprNode.type === 'MemberExpression') {
            traverseExpr(exprNode.object, true);
            return;
          }

          if (exprNode.type === 'TemplateLiteral') {
            if (exprNode.expressions) {
              exprNode.expressions.forEach(nestedExpr =>
                traverseExpr(nestedExpr, true)
              );
            }
            return;
          }

          if (exprNode.type === 'ObjectExpression') {
            if (exprNode.properties) {
              exprNode.properties.forEach(prop => {
                if (prop.value) {
                  traverseExpr(prop.value, false);
                }
              });
            }
            return;
          }

          for (const key in exprNode) {
            if (key === 'loc' || key === 'start' || key === 'end') continue;
            const value = exprNode[key];
            if (Array.isArray(value)) {
              value.forEach(v => traverseExpr(v, true));
            } else if (value && typeof value === 'object') {
              traverseExpr(value, true);
            }
          }
        };

        traverseExpr(expr, true);
      }

      // Sort identifiers by position
      allIdentifiers.sort((a, b) => a.start - b.start);

      // Build pieces array by splitting around identifiers, keeping ${ and }
      const pieces = [];
      const identifierList = [];
      const identifierMap = {};

      let lastPos = 0;

      for (const id of allIdentifiers) {
        // Find the ${ before this identifier (search backwards from id.start)
        let beforeIdentifier = fullContent.substring(lastPos, id.start);

        // Find the } after this identifier (search forwards from id.end)
        // We need to find the matching closing brace for the interpolation
        let afterIdentifierStart = id.end;

        // Add the piece including everything up to and including just before the identifier
        pieces.push(beforeIdentifier);

        // Add identifier to the list
        identifierList.push(id.name);

        // Add to map if not already there
        if (!identifierMap[id.name]) {
          identifierMap[id.name] = '';
        }

        lastPos = id.end;
      }

      // Add the final piece after the last identifier
      pieces.push(fullContent.substring(lastPos));

      // Label encode the identifiers
      const uniqueVars = [...new Set(identifierList)];
      const varToLabel = {};
      uniqueVars.forEach((varName, idx) => {
        varToLabel[varName] = idx;
      });

      const labelEncodedIdentifiers = identifierList.map(
        varName => varToLabel[varName]
      );
      const labelEncodedMap = {};
      Object.keys(varToLabel).forEach(varName => {
        labelEncodedMap[varToLabel[varName]] = '';
      });

      stringData.push({
        name: '',
        id: '',
        description: '',
        pieces,
        identifiers: labelEncodedIdentifiers,
        identifierMap: labelEncodedMap,
        start: node.start,
        end: node.end,
      });
    }

    // Recursively traverse
    for (const key in node) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;

      const value = node[key];
      if (Array.isArray(value)) {
        value.forEach(traverse);
      } else if (value && typeof value === 'object') {
        traverse(value);
      }
    }
  };

  traverse(ast);

  // Filter out strings that are subsets of other strings
  // Step 1: Sort by start index (ascending), then by end index (descending)
  // This puts earliest strings first, and among strings with same start, longest first
  stringData.sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    return b.end - a.end;
  });

  // Step 2: Track seen ranges and filter out subsets
  const seenRanges = [];
  const filteredData = [];

  for (const item of stringData) {
    const isSubset = seenRanges.some(
      range => item.start >= range.start && item.end <= range.end
    );

    if (!isSubset) {
      filteredData.push(item);
      seenRanges.push({ start: item.start, end: item.end });
    }
  }

  return { prompts: filteredData };
}

function mergeWithExisting(newData, oldData, currentVersion) {
  if (!oldData || !oldData.prompts) {
    // No old data, add current version to all new prompts
    return {
      prompts: newData.prompts.map(item => ({
        ...item,
        version: currentVersion,
      })),
    };
  }

  // Helper to reconstruct content from pieces and identifiers
  const reconstructContent = item => {
    return item.pieces.join(''); // Don't actually insert the vairables.
  };

  const newPrompts = newData.prompts.map((newItem, idx) => {
    const newContent = reconstructContent(newItem);

    // Try to find a matching old item by content and label-encoded identifiers
    const matchingOld = oldData.prompts.find(oldItem => {
      const oldContent = reconstructContent(oldItem);
      if (newContent !== oldContent) return false;

      // Also compare label-encoded identifiers
      if (newItem.identifiers.length !== oldItem.identifiers.length)
        return false;
      return (
        JSON.stringify(newItem.identifiers) ===
        JSON.stringify(oldItem.identifiers)
      );
    });

    // If we found a match, copy over the metadata
    if (matchingOld) {
      // Prompt matches exactly
      // If old prompt has no version, use current version; otherwise use old version
      return {
        ...newItem,
        name: matchingOld.name,
        id: matchingOld.id || slugify(matchingOld.name),
        description: matchingOld.description,
        identifierMap: matchingOld.identifierMap,
        version: matchingOld.version || currentVersion,
      };
    }

    // No exact match found - check if there's a prompt with same metadata but different content
    const similarOld = oldData.prompts.find(oldItem => {
      // Check if names match (not placeholder) as a heuristic for "same prompt, different content"
      return oldItem.name !== '' && oldItem.name === newItem.name;
    });

    if (similarOld && similarOld.version) {
      // Old prompt exists with a version and content changed - use current version
      console.log(
        `Content changed for "${newItem.name}", updating version from ${similarOld.version} to ${currentVersion}`
      );
      return {
        ...newItem,
        id: similarOld.id || slugify(similarOld.name),
        version: currentVersion,
      };
    }

    // Check if there's any old prompt without a version (we should add current version)
    const oldWithoutVersion = oldData.prompts.find(oldItem => !oldItem.version);

    // New prompt or old prompt didn't have version - add current version
    console.log(
      `No match for item ${idx}: ${JSON.stringify(newContent.slice(0, 100))}`
    );
    console.log();
    return {
      ...newItem,
      id: slugify(newItem.name),
      version: currentVersion,
    };
  });

  return { prompts: newPrompts };
}

// CLI
if (require.main === module) {
  const filepath = process.argv[2];

  if (!filepath) {
    console.error(
      'Usage: node promptExtractor.cjs <path-to-cli.js> [output-file]'
    );
    process.exit(1);
  }

  const outputFile = process.argv[3] || 'prompts.json';

  // Try to read existing output file
  let existingData = null;
  if (fs.existsSync(outputFile)) {
    try {
      const existingContent = fs.readFileSync(outputFile, 'utf-8');
      existingData = JSON.parse(existingContent);
      console.log(
        `Found existing output file with ${existingData.prompts?.length || 0} prompts`
      );
    } catch (err) {
      console.warn(
        `Warning: Could not parse existing output file: ${err.message}`
      );
    }
  }

  // Look for package.json alongside the input file
  const path = require('path');
  const inputDir = path.dirname(path.resolve(filepath));
  const packageJsonPath = path.join(inputDir, 'package.json');

  let version = null;
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      version = packageJson.version;
      console.log(`Found package.json with version ${version}`);
    } catch (err) {
      console.warn(`Warning: Could not parse package.json: ${err.message}`);
    }
  }

  // Helper functions to replace version strings with placeholder
  const replaceVersionInString = (str, versionStr) => {
    if (!versionStr) return str;
    // Escape dots for regex
    const escapedVersion = versionStr.replace(/\./g, '\\.');
    // Replace version with placeholder
    return str.replace(new RegExp(escapedVersion, 'g'), '<<CCVERSION>>');
  };

  // Helper function to replace BUILD_TIME timestamps with placeholder
  // BUILD_TIME is an ISO 8601 timestamp like "2025-12-09T19:43:43Z"
  const replaceBuildTimeInString = str => {
    // Match ISO 8601 timestamps in the format YYYY-MM-DDTHH:MM:SSZ
    // Only match when preceded by BUILD_TIME:" to avoid false positives
    return str.replace(
      /BUILD_TIME:"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)"/g,
      'BUILD_TIME:"<<BUILD_TIME>>"'
    );
  };

  const replaceVersionInPrompts = (data, versionStr) => {
    return {
      ...data,
      prompts: data.prompts.map(prompt => ({
        ...prompt,
        pieces: prompt.pieces.map(piece => {
          let result = piece;
          // Replace BUILD_TIME first (always)
          result = replaceBuildTimeInString(result);
          // Then replace version if provided
          if (versionStr) {
            result = replaceVersionInString(result, versionStr);
          }
          return result;
        }),
      })),
    };
  };

  const result = extractStrings(filepath);
  // Replace version in newly extracted strings BEFORE merging
  const versionReplacedResult = replaceVersionInPrompts(result, version);

  const mergedResult = mergeWithExisting(
    versionReplacedResult,
    existingData,
    version
  );

  // Sort prompts by lexicographic order of pieces joined together (without interpolated vars)
  mergedResult.prompts.sort((a, b) => {
    const contentA = a.pieces.join('');
    const contentB = b.pieces.join('');
    return contentA.localeCompare(contentB);
  });

  // Remove start/end fields before writing
  mergedResult.prompts = mergedResult.prompts.map(({ start, end, ...rest }) => rest);

  // Add version as top-level field
  const outputData = {
    version,
    ...mergedResult,
  };

  fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));

  console.log(`Extracted ${mergedResult.prompts.length} strings`);
  console.log(`Written to ${outputFile}`);
}

module.exports = extractStrings;
