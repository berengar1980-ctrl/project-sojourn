'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const test = path.resolve(__dirname, '../tests/economy/npc-economy-longrun.test.cjs');

const mode = process.env.SOJOURN_AUDIT_MODE ?? 'all';
const days = Number(process.env.SOJOURN_AUDIT_DAYS ?? 365);
assert([90, 180, 365].includes(days));
const horizons = [90, 180, 365].filter((day) => day <= days);
assert(['all', 'strategic', 'physical', 'integrated'].includes(mode));

function auditStrategic() {
  const run = spawnSync(process.execPath, [test], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, SOJOURN_LONGRUN_DAYS: String(days), SOJOURN_INTEGRATED_FIELDS: '0' },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (run.status !== 0) {
    process.stderr.write(run.stdout ?? '');
    process.stderr.write(run.stderr ?? '');
    process.exit(run.status ?? 1);
  }
  const reports = run.stdout
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line))
    .filter((value) => value.automaticCombat && !value.integratedFields);
  assert.deepEqual(
    reports.map((report) => report.days),
    horizons
  );
  for (const summary of reports) {
    const days = summary.days;
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
        lossAudit: summary.lossAudit,
        hullUpgrades: summary.report.reduce((sum, group) => sum + group.hullUpgrades, 0),
        completedLegs: summary.report.reduce((sum, group) => sum + group.completedLegs, 0),
        resourceBalance: summary.resourceBalance,
        unexplainedResources: summary.resourceBalance.filter((row) => row.discrepancy !== 0),
        roles: summary.report,
      })
    );
  }
  console.log('PASS strategic NPC economic progression, customs and insurance audit');
}

function auditPhysical() {
  const physicalTestPath = '../tests/economy/physical-resource-horizons.test.cjs';
  const physicalTest = path.resolve(__dirname, physicalTestPath);
  const physicalRun = spawnSync(process.execPath, [physicalTest], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, SOJOURN_PHYSICAL_DAYS: String(days) },
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
  console.log('PASS selected-horizon physical resource balance audit');
}

function auditIntegrated() {
  const integratedRun = spawnSync(process.execPath, [test], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      SOJOURN_LONGRUN_DAYS: String(days),
      SOJOURN_INTEGRATED_FIELDS: '1',
      SOJOURN_PROFILE: process.env.SOJOURN_PROFILE ?? '0',
    },
    // Keep JSON reports on stdout, but stream progress and failures immediately.
    stdio: ['ignore', 'pipe', 'inherit'],
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
    assert.deepEqual(discrepancies, [], 'integrated resource balance must reconcile');
    const { combatWrecksCreated, combatWrecksExpired } = report.fieldActivity;
    assert(combatWrecksCreated > 0, 'integrated combat must create wrecks');
    assert(combatWrecksExpired > 0, 'integrated combat wrecks must be removed');
    assert(combatWrecksExpired <= combatWrecksCreated, 'cannot remove more wrecks than created');
    assert.equal(
      combatWrecksCreated,
      combatWrecksExpired + report.fieldActivity.combatWrecksActive,
      'unique wreck lifecycle must reconcile'
    );
    assert.equal(
      report.lossAudit.scheduledLosses,
      report.population.replacementCount + report.population.outstanding
    );
    console.log(JSON.stringify({ ...report, unexplainedResources: discrepancies }));
  }
  for (const report of integratedReports) {
    const loss = report.lossAudit;
    assert.equal(loss.multipleWrecksForGeneration, 0, 'one wreck per destroyed generation');
    assert.equal(loss.observedWithoutWreck, 0, 'every reported destruction must create a wreck');
    assert.equal(loss.scheduledWithoutWreck, 0, 'every retired combat ship must have a wreck');
    assert.equal(
      loss.wreckWithoutRetirement,
      loss.wreckAwaitingRetirement,
      'every regular NPC wreck must reconcile with retirement'
    );
  }
  assert(integratedReports.at(-1).fieldActivity.minedUnits > 0);
  assert(integratedReports.at(-1).fieldActivity.recoveredUnits > 0);
  const visitedMiningSites = Object.values(integratedReports.at(-1).fieldActivity.miningSitesByNpc);
  assert(
    visitedMiningSites.some((sites) => sites.length > 1),
    'at least one integrated NPC miner must extract ore at different fields'
  );
  console.log('PASS selected-horizon integrated NPC and physical field audit');
}

if (mode === 'all' || mode === 'strategic') auditStrategic();
if (mode === 'all' || mode === 'physical') auditPhysical();
if (mode === 'all' || mode === 'integrated') auditIntegrated();
