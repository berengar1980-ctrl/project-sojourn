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
  assert.equal(summary.report.reduce((sum, group) => sum + group.ships, 0), 33);
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
    })
  );
}
console.log('PASS 90/180/365-day NPC economic progression, customs and insurance audit');
