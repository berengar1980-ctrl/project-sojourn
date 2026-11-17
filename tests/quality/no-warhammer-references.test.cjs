'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const bannedReferences = [
  ['Warhammer', /warhammer/i],
  ['40k', /\b40k\b/i],
  ['Space Marine', /space marine/i],
  ['Adeptus', /\badeptus\b/i],
  ['Astartes', /\bastartes\b/i],
  ['Imperium of Man', /imperium of man/i],
  ['Rogue Trader', /rogue trader/i],
  ['Promethium', /\bpromethium\b/i],
  ['Plasteel', /\bplasteel\b/i],
  ['Ceramite', /\bceramite\b/i],
  ['Adamantium', /\badamantium\b/i],
  ['Amasec', /\bamasec\b/i],
  ['Recaf', /\brecaf\b/i],
  ['Corpse starch', /corpse[- ]starch/i],
  ['Grox', /\bgrox\b/i],
  ['Archeotech', /\barcheotech\b/i],
];

function collectTextFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];

  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) return collectTextFiles(child);
    if (!entry.isFile()) return [];
    return /\.(ts|md|json|cjs|mjs|html|css|yml|yaml)$/i.test(entry.name) ? [child] : [];
  });
}

const roots = [path.join(root, 'src'), path.join(root, 'docs')];
const violations = [];

for (const file of roots.flatMap(collectTextFiles)) {
  const content = fs.readFileSync(file, 'utf8');
  for (const [label, pattern] of bannedReferences) {
    if (!pattern.test(content)) continue;
    violations.push(path.relative(root, file).replaceAll('\\', '/') + ': ' + label);
  }
}

assert.deepEqual(
  violations,
  [],
  'Project Sojourn must remain independent from Warhammer 40k terminology'
);

console.log('PASS no Warhammer 40k terminology in Project Sojourn source/data/docs');
