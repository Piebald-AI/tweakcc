const { test } = require('node:test');
const assert = require('node:assert/strict');

const { extractStrings, seededExtract } = require('./promptExtractor.js');

// Prose that the new-prompt heuristic accepts (long, addressed to the model).
const prose = topic =>
  `You are an AI assistant helping with ${topic}. ` +
  Array.from(
    { length: 12 },
    (_, i) =>
      `Step ${i + 1}: you should check the ${topic} carefully and tell the user what you found.`
  ).join(' ');

const modules = entries => new Map(Object.entries(entries));

// The published-file shape for every literal of `source`, named in order.
const seedFrom = (source, names) => ({
  prompts: extractStrings('seed.js', {
    source,
    accept: text => text.length >= 20,
    subsetFilter: false,
  }).prompts.map((p, i) => ({
    ...p,
    name: names[i],
    id: names[i],
    version: '1.0.0',
  })),
});

test('an unchanged prompt keeps its id and published text across renamed locals', () => {
  const seed = seedFrom(
    `const a = \`Use the \${A.name} tool to read files before editing them.\`;`,
    ['read-first']
  );
  const { prompts, stats } = seededExtract(
    modules({
      'chunk.js': `const z = \`Use the \${Qx.name} tool to read files before editing them.\`;`,
    }),
    seed
  );
  assert.equal(stats.exact, 1);
  assert.equal(prompts[0].id, 'read-first');
  assert.deepEqual(prompts[0].pieces, seed.prompts[0].pieces);
});

test('an edited prompt keeps its id and takes the new text', () => {
  const before = prose('build');
  const after = before.replace(/what you found\.$/, 'what you found, briefly.');
  const seed = seedFrom(`const a = ${JSON.stringify(before)};`, ['build']);
  const { prompts, stats } = seededExtract(
    modules({ 'chunk.js': `const a = ${JSON.stringify(after)};` }),
    seed
  );
  assert.equal(stats.edited, 1);
  assert.equal(prompts[0].id, 'build');
  assert.equal(prompts[0].pieces.join(''), after);
});

test('a prompt that is gone is counted as removed', () => {
  const seed = seedFrom(`const a = ${JSON.stringify(prose('deploys'))};`, [
    'deploys',
  ]);
  const { prompts, stats } = seededExtract(
    modules({ 'chunk.js': `const a = "nothing to see here";` }),
    seed
  );
  assert.equal(stats.removed, 1);
  assert.equal(prompts.length, 0);
});

test('only literals that are new in this build are reported as new prompts', () => {
  const known = prose('tests');
  const fresh = prose('migrations');
  const curatedOut = prose('telemetry');
  const seed = seedFrom(`const a = ${JSON.stringify(known)};`, ['tests']);
  const previous = modules({
    'chunk.js': `const a = ${JSON.stringify(known)}; const c = ${JSON.stringify(curatedOut)};`,
  });
  const { prompts, stats } = seededExtract(
    modules({
      'chunk.js': `const a = ${JSON.stringify(known)}; const b = ${JSON.stringify(fresh)}; const c = ${JSON.stringify(curatedOut)};`,
    }),
    seed,
    { previousSources: previous }
  );
  assert.equal(stats.new, 1);
  const added = prompts.find(p => p.id.startsWith('new-prompt-'));
  assert.equal(added.pieces.join(''), fresh);
  assert.match(added.name, /^New prompt: You are an AI assistant helping/);
});

test('source escapes stay as written; non-ASCII escapes become characters', () => {
  const known = `const k = ${JSON.stringify(prose('tests'))};`;
  const seed = seedFrom(known, ['tests']);
  const { prompts } = seededExtract(
    modules({
      'chunk.js': `${known} const a = "You are an AI assistant. Quote it as \\"done\\" \\u2014 or write \\\\u2014 for a dash. ${prose('quotes')}";`,
    }),
    seed
  );
  const text = prompts
    .find(p => p.id.startsWith('new-prompt-'))
    .pieces.join('');
  assert.ok(text.includes('as \\"done\\" \u2014 or write \\\\u2014 for'));
});

test('an edited prompt in a text module takes the text as the file holds it', () => {
  const before = `# Guide\n\nYou are an AI assistant. Say "hi".\n\n${prose('docs')}`;
  const after = before.replace(/what you found\.$/, 'what you found, briefly.');
  const seed = seedFrom(`const a = ${JSON.stringify(before)};`, ['docs']);
  const { prompts, stats } = seededExtract(
    modules({ 'docs/guide.md': `var __t = ${JSON.stringify(after)};` }),
    seed
  );
  assert.equal(stats.edited, 1);
  assert.equal(prompts[0].pieces.join(''), after);
});

// A seed prompt from a template literal, with its variables named in order.
const namedSeed = (template, varNames) => {
  const seed = seedFrom(`const a = \`${template}\`;`, ['p']);
  seed.prompts[0].identifierMap = Object.fromEntries(
    varNames.map((name, label) => [String(label), name])
  );
  return seed;
};
// Variable name at each slot of an extracted prompt.
const slotNames = p => p.identifiers.map(label => p.identifierMap[label]);

test('the seed names are not reused when the variables repeat differently', () => {
  const seed = namedSeed(
    'Use ${A} for reading files, then ${B} for writing them, and ${A} once more at the end.',
    ['READ_TOOL', 'WRITE_TOOL']
  );
  const { prompts } = seededExtract(
    modules({
      'chunk.js':
        'const a = `Use ${x} for reading files, then ${y} for writing them, and ${y} once more at the end.`;',
    }),
    seed
  );
  assert.deepEqual(prompts[0].identifiers, [0, 1, 1]);
  assert.deepEqual(slotNames(prompts[0]), [
    'READ_TOOL',
    'WRITE_TOOL',
    'WRITE_TOOL',
  ]);
});

test('names follow their text when a variable is added earlier in the prompt', () => {
  const tail = prose('variables');
  const seed = namedSeed(
    `Open the file with \${A} before anything else. Save every change through \${B} when done. ${tail}`,
    ['OPEN_TOOL', 'SAVE_TOOL']
  );
  const { prompts, stats } = seededExtract(
    modules({
      'chunk.js': `const a = \`Open the file with \${x} before anything else. Check access with \${n} first. Save every change through \${y} when done. ${tail}\`;`,
    }),
    seed
  );
  assert.equal(stats.edited, 1);
  assert.deepEqual(slotNames(prompts[0]), ['OPEN_TOOL', '', 'SAVE_TOOL']);
});

test('another copy of a known prompt is not reported as new', () => {
  const text = prose('copies');
  const seed = seedFrom(`const a = ${JSON.stringify(text)};`, ['copies']);
  const { stats } = seededExtract(
    modules({
      'chunk.js': `const a = ${JSON.stringify(text)}; const b = ${JSON.stringify(text)};`,
    }),
    seed
  );
  assert.equal(stats.new, 0);
});

test('new prompts with the same opening words get distinct ids', () => {
  const known = `const k = ${JSON.stringify(prose('tests'))};`;
  const a = prose('builds');
  const b = a.replace(/what you found\.$/, 'what went wrong.');
  const { prompts } = seededExtract(
    modules({
      'chunk.js': `${known} const a = ${JSON.stringify(a)}; const b = ${JSON.stringify(b)};`,
    }),
    seedFrom(known, ['tests'])
  );
  const ids = prompts
    .filter(p => p.id.startsWith('new-prompt-'))
    .map(p => p.id)
    .sort();
  assert.equal(ids.length, 2);
  assert.equal(ids[1], `${ids[0]}-2`);
});
