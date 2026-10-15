'use strict';

const { execFileSync } = require('node:child_process');
const { postStatus } = require('./ci-run-and-report.cjs');

function summarizeMotion(scenarios) {
  const groups = new Map();
  for (const combat of scenarios) {
    const group = groups.get(combat.label) ?? [];
    group.push(combat);
    groups.set(combat.label, group);
  }
  return [...groups].map(([label, cases]) => {
    const mean = (key) => cases.reduce((sum, row) => sum + row[key], 0) / cases.length;
    return {
      label,
      cases: cases.length,
      slowPercent: (100 * mean('secondsBothShipsSlow')) / Math.max(1, mean('durationSeconds')),
      longestStallSeconds: Math.max(...cases.map((row) => row.longestBothSlowStreakSeconds)),
      meanRelativeSpeed: mean('meanRelativeSpeedMetersPerSecond'),
      closePassCandidates: cases.reduce((sum, row) => sum + row.closePassCandidates, 0),
      winners: cases.filter((row) => row.winner !== null).length,
      invalidFrames: cases.reduce((sum, row) => sum + row.invalidFrames, 0),
      allUnified: cases.every((row) => row.steeringPath === 'unified'),
    };
  });
}

function formatMotionStatus(summary) {
  return (
    summary.label +
    ': slow ' +
    summary.slowPercent.toFixed(1) +
    '%; longest ' +
    summary.longestStallSeconds.toFixed(1) +
    's; rel ' +
    summary.meanRelativeSpeed.toFixed(1) +
    'm/s; passes ' +
    summary.closePassCandidates +
    '; wins ' +
    summary.winners +
    '/' +
    summary.cases
  );
}

async function run() {
  const raw = execFileSync(process.execPath, ['scripts/combat-motion-baseline.cjs', '90'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  const baseline = JSON.parse(raw);
  const summaries = summarizeMotion(baseline.scenarios);
  let success = baseline.scenarios.length === 12 && summaries.length === 3;
  for (const summary of summaries) {
    const healthy =
      summary.longestStallSeconds < 20 &&
      summary.invalidFrames === 0 &&
      summary.allUnified;
    const detail = formatMotionStatus(summary);
    process.stdout.write(detail + '\n');
    if (!healthy) success = false;
    const posted = await postStatus(
      healthy ? 'success' : 'failure',
      'motion ' + summary.label,
      detail
    );
    if (!posted) success = false;
  }
  process.exitCode = success ? 0 : 1;
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { summarizeMotion, formatMotionStatus };
