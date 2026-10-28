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
