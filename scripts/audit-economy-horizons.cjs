'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const test = path.resolve(__dirname, '../tests/economy/npc-economy-longrun.test.cjs');
const horizons = [90, 180, 365];

for (const days of horizons) {
  const run = spawnSync(process.execPath, [test], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, SOJOURN_LONGRUN_DAYS: String(days) },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (run.status !== 0) {
    process.stderr.write(run.stdout ?? '');
    process.stderr.write(run.stderr ?? '');
    process.exit(run.status ?? 1);
  }
  const summary = run.stdout
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .find((value) => value && value.days === days && value.automaticCombat);
  assert(summary, 'Missing economic audit report at day ' + days);
  assert.equal(
    summary.report.reduce((sum, group) => sum + group.ships, 0),
    33
  );
  assert(summary.population.insuranceFundCredits >= 0);
  assert(summary.report.every((group) => group.finalCredits >= 0));
  console.log(
    JSON.stringify({
      days,
      combat: summary.combat,
      smuggling: summary.smuggling,
      population: summary.population,
      hullUpgrades: summary.report.reduce((sum, group) => sum + group.hullUpgrades, 0),
      completedLegs: summary.report.reduce((sum, group) => sum + group.completedLegs, 0),
      resourceBalance: summary.resourceBalance,
      unexplainedResources: summary.resourceBalance.filter((row) => row.discrepancy !== 0),
      roles: summary.report,
    })
  );
}
console.log('PASS 90/180/365-day NPC economic progression, customs and insurance audit');

const physicalTestPath = '../tests/economy/physical-resource-horizons.test.cjs';
const physicalTest = path.resolve(__dirname, physicalTestPath);
const physicalRun = spawnSync(process.execPath, [physicalTest], {
  cwd: path.resolve(__dirname, '..'),
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});
if (physicalRun.status !== 0) {
  process.stderr.write(physicalRun.stdout ?? '');
  process.stderr.write(physicalRun.stderr ?? '');
  process.exit(physicalRun.status ?? 1);
}
const physicalReports = physicalRun.stdout
  .split('\n')
  .filter((line) => line.startsWith('{'))
  .map((line) => JSON.parse(line))
  .filter((report) => report.physicalFields);
const physicalDays = physicalReports.map((report) => report.days);
assert.deepEqual(physicalDays, horizons);
for (const report of physicalReports) {
  assert(report.resourceBalance.every((row) => row.discrepancy === 0));
  console.log(JSON.stringify(report));
}
console.log('PASS 90/180/365-day physical resource balance audit');

const integratedRun = spawnSync(process.execPath, [test], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, SOJOURN_LONGRUN_DAYS: '365', SOJOURN_INTEGRATED_FIELDS: '1' },
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});
if (integratedRun.status !== 0) {
  process.stderr.write(integratedRun.stdout ?? '');
  process.stderr.write(integratedRun.stderr ?? '');
  process.exit(integratedRun.status ?? 1);
}
const integratedReports = integratedRun.stdout
  .split('\n')
  .filter((line) => line.startsWith('{'))
  .map((line) => JSON.parse(line))
  .filter((report) => report.integratedFields);
const integratedDays = integratedReports.map((report) => report.days);
assert.deepEqual(integratedDays, horizons);
for (const report of integratedReports) {
  assert.equal(report.secondsPerDay, 180);
  const populationSize = report.report.reduce((sum, group) => sum + group.ships, 0);
  assert.equal(populationSize, 33);
  const discrepancies = report.resourceBalance.filter((row) => row.discrepancy !== 0);
  console.log(JSON.stringify({ ...report, unexplainedResources: discrepancies }));
}
assert(integratedReports[2].fieldActivity.minedUnits > 0);
assert(integratedReports[2].fieldActivity.recoveredUnits > 0);
const visitedMiningSites = Object.values(integratedReports[2].fieldActivity.miningSitesByNpc);
assert(
  visitedMiningSites.some((sites) => sites.length > 1),
  'at least one integrated NPC miner must extract ore at different fields'
);
console.log('PASS 90/180/365-day integrated NPC and physical field audit');
