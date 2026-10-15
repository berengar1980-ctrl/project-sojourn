'use strict';

// node scripts/report-combat-comparison.cjs baseline-main.json candidate-pr234.json
const fs = require('node:fs');
const [baselineFile, candidateFile] = process.argv.slice(2);
if (!baselineFile || !candidateFile) {
  console.error('Usage: node scripts/report-combat-comparison.cjs main.json pr234.json');
  process.exit(2);
}
function load(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.schema !== 'sojourn-combat-comparison-v1' || !Array.isArray(data.results)) {
    throw new Error('Invalid combat comparison report: ' + file);
  }
  return data;
}
const baseline = load(baselineFile);
const candidate = load(candidateFile);
if (baseline.stepSeconds !== candidate.stepSeconds ||
    baseline.maximumSeconds !== candidate.maximumSeconds) {
  throw new Error('Baseline and candidate simulation settings differ');
}
const key = (item) => item.case + ':' + item.seed + ':' + item.mode;
const reference = new Map(baseline.results.map((item) => [key(item), item]));
const selected = new Map(candidate.results.map((item) => [key(item), item]));
const fields = ['distance', 'meanSpeed', 'stationarySeconds', 'headingMismatchSeconds',
  'intentChanges', 'closePasses', 'exchangePlans', 'exchangeResults', 'impacts'];
const fmt = (number) => Number(number.toFixed(2));
function aggregate(metric) {
  if (Array.isArray(metric)) return metric.reduce((total, value) => total + value, 0);
  return metric;
}
const comparisons = [];
for (const [id, before] of reference) {
  const after = selected.get(id);
  if (!after) throw new Error('Missing candidate scenario ' + id);
  const changes = {};
  for (const field of fields) {
    const oldValue = aggregate(before[field]);
    const newValue = aggregate(after[field]);
    changes[field] = { main: fmt(oldValue), candidate: fmt(newValue),
      difference: fmt(newValue - oldValue) };
  }
  comparisons.push({ case: before.case, seed: before.seed, mode: before.mode,
    changes, escapeProgress: before.escapeDistanceToExit === null ? null : {
      main: before.escapeDistanceToExit,
      candidate: after.escapeDistanceToExit,
      difference: fmt(after.escapeDistanceToExit - before.escapeDistanceToExit),
    } });
}
if (selected.size !== reference.size) throw new Error('Candidate includes unmatched scenarios');
const lines = [
  '# Project Sojourn — combat choreography comparison',
  '',
  'Negative stationary-time difference is good; positive distance difference is not automatically good.',
  'Do not judge fight quality by damage or winner alone.',
  '',
  '| Scenario | Seed | Mode | Distance Δ | Stationary seconds Δ | Intent changes Δ | Exchange results Δ | Impacts Δ |',
  '|---|---:|---|---:|---:|---:|---:|---:|',
];
for (const row of comparisons) {
  const v = row.changes;
  lines.push('| ' + row.case + ' | ' + row.seed + ' | ' + row.mode + ' | ' +
    v.distance.difference + ' | ' + v.stationarySeconds.difference + ' | ' +
    v.intentChanges.difference + ' | ' + v.exchangeResults.difference + ' | ' +
    v.impacts.difference + ' |');
}
lines.push('', '## Further metrics (machine-readable)', '',
  '```json', JSON.stringify(comparisons, null, 2), '```', '');
process.stdout.write(lines.join('\n'));
