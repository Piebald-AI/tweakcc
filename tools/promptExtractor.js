#!/usr/bin/env node

const fs = require('fs');
const parser = require('@babel/parser');
const { extractVariableMap, TOOL_NAME_MAP } = require('./autoIdentifierMap');

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
  
  if (text.startsWith("This is the git status")) return true;
  if (text.includes("IMPORTANT: Assist with authorized security testing")) return true;
  // In one specific case, some of the TUI code shows up in the prompts files.  Exclude it.
  if (text.includes(".dim(\"Note:")) return false;
  
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

function extractStrings(filepath, minLength = 500, autoVariableMap = null) {
  const code = fs.readFileSync(filepath, 'utf-8');

  // 自动提取变量映射（如果没有提供）
  const variableMap = autoVariableMap || extractVariableMap(filepath).variableMap;

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
      const { quasis, expressions } = node;

      // Extract the entire template content directly from source (excluding backticks)
      const contentStart = node.start + 1; // After opening backtick
      const contentEnd = node.end - 1; // Before closing backtick
      const fullContent = code.substring(contentStart, contentEnd);

      // Validate before processing
      if (!validateInput(fullContent, minLength)) {
        return;
      }

      // Helper: extract the ROOT identifier from an expression
      // For ${VAR} -> VAR
      // For ${FN()} -> FN
      // For ${OBJ.prop} -> OBJ
      // For ${FN(A,B)} -> FN (not A, B - we only want the root)
      const getRootIdentifier = (exprNode) => {
        if (!exprNode || typeof exprNode !== 'object') return null;

        if (exprNode.type === 'Identifier') {
          return exprNode.name;
        }

        if (exprNode.type === 'CallExpression') {
          return getRootIdentifier(exprNode.callee);
        }

        if (exprNode.type === 'MemberExpression') {
          return getRootIdentifier(exprNode.object);
        }

        if (exprNode.type === 'ConditionalExpression') {
          return getRootIdentifier(exprNode.test);
        }

        if (exprNode.type === 'BinaryExpression' || exprNode.type === 'LogicalExpression') {
          return getRootIdentifier(exprNode.left);
        }

        if (exprNode.type === 'UnaryExpression') {
          return getRootIdentifier(exprNode.argument);
        }

        return null;
      };

      // Build pieces in the format expected by buildSearchRegexFromPieces:
      // - pieces[i] ends with "${" (except last piece)
      // - pieces[i+1] starts with the closing part after the root identifier
      const pieces = [];

      for (let i = 0; i < quasis.length; i++) {
        let piece = quasis[i].value.raw;

        if (i < expressions.length) {
          // Not the last quasi - add ${ suffix
          piece += '${';
        }

        if (i > 0) {
          // Not the first quasi - need to add prefix from previous expression
          const prevExpr = expressions[i - 1];
          const rootId = getRootIdentifier(prevExpr);

          if (rootId) {
            // Get the source code of the expression
            const exprSource = code.substring(prevExpr.start, prevExpr.end);
            // Find where the root identifier ends in the expression
            const rootIdx = exprSource.indexOf(rootId);
            if (rootIdx !== -1) {
              // Everything after the root identifier becomes the prefix
              const afterRoot = exprSource.substring(rootIdx + rootId.length);
              piece = afterRoot + '}' + piece;
            } else {
              piece = '}' + piece;
            }
          } else {
            piece = '}' + piece;
          }
        }

        pieces.push(piece);
      }

      // Extract root identifier for each expression
      const identifierList = expressions.map(expr => {
        const rootId = getRootIdentifier(expr);
        return rootId || '__UNKNOWN__';
      });

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
        const label = varToLabel[varName];
        // 自动填充人类可读名称
        if (variableMap[varName]) {
          labelEncodedMap[label] = variableMap[varName];
        } else {
          labelEncodedMap[label] = `VAR_${varName}`;
        }
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
  // Helper to merge identifierMap: prefer user-set names, fallback to auto-generated
  const mergeIdentifierMap = (newMap, oldMap) => {
    const merged = { ...newMap };
    if (oldMap) {
      Object.keys(oldMap).forEach(key => {
        // If old map has a non-empty, user-set value (not VAR_* or SET_*), keep it
        const oldValue = oldMap[key];
        if (oldValue && !oldValue.startsWith('VAR_') && !oldValue.startsWith('SET_')) {
          merged[key] = oldValue;
        }
      });
    }
    return merged;
  };

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
    return item.pieces.join(''); // Don't actually insert the variables.
  };

  const newPrompts = newData.prompts.map((newItem, idx) => {
    const newContent = reconstructContent(newItem);

    // Try to find a matching old item by content (ignore identifiers, they may change)
    const matchingOld = oldData.prompts.find(oldItem => {
      const oldContent = reconstructContent(oldItem);
      return newContent === oldContent;
    });

    // If we found a match, copy over the metadata
    if (matchingOld) {
      // Prompt matches exactly
      return {
        ...newItem,
        name: matchingOld.name,
        id: matchingOld.id || slugify(matchingOld.name),
        description: matchingOld.description,
        // Smart merge: keep user-set names, use auto-generated for others
        identifierMap: mergeIdentifierMap(newItem.identifierMap, matchingOld.identifierMap),
        version: matchingOld.version || currentVersion,
      };
    }

    // No exact match found - check if there's a prompt with same name
    const similarOld = oldData.prompts.find(oldItem => {
      return oldItem.name !== '' && oldItem.name === newItem.name;
    });

    if (similarOld && similarOld.version) {
      console.log(
        `Content changed for "${newItem.name}", updating version from ${similarOld.version} to ${currentVersion}`
      );
      return {
        ...newItem,
        id: similarOld.id || slugify(similarOld.name),
        identifierMap: mergeIdentifierMap(newItem.identifierMap, similarOld.identifierMap),
        version: currentVersion,
      };
    }

    // New prompt - add current version
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
