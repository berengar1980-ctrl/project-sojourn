'use strict';

// Analyze reports created on both refs with the same runner.
const fs = require('node:fs');
const { inspectTrajectory } = require('./combat-trajectory-diagnostics.cjs');
const [mainFile, prFile] = process.argv.slice(2);
if (!mainFile || !prFile) {
  console.error('Usage: node scripts/diagnose-combat-comparison.cjs main.json pr.json');
  process.exit(2);
}
function load(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.schema !== 'sojourn-combat-comparison-v1') throw new Error('Unsupported report');
  return data.results;
}
const before = new Map(load(mainFile).map((entry) => [entry.case + ':' + entry.seed, entry]));
const after = load(prFile);
if (after.length !== before.size) throw new Error('Scenario count mismatch');
const result = [];
for (const entry of after) {
  const original = before.get(entry.case + ':' + entry.seed);
  if (!original || entry.mode !== original.mode) throw new Error('Unmatched scenario');
  result.push({
    scenario: entry.case,
    seed: entry.seed,
    mode: entry.mode,
    main: inspectTrajectory(original),
    pr: inspectTrajectory(entry),
    escape: entry.case === 'escape' ? {
      main: { winner: original.winner, duration: original.durationSeconds,
        distanceToExit: original.escapeDistanceToExit },
      pr: { winner: entry.winner, duration: entry.durationSeconds,
        distanceToExit: entry.escapeDistanceToExit },
    } : undefined,
  });
}
process.stdout.write(JSON.stringify({
  note: '0.8s trajectory samples: passage candidates, weapon-facing geometry and suspected orbits are diagnostic estimates, not authoritative physics events.',
  results: result,
}, null, 2) + '\n');
