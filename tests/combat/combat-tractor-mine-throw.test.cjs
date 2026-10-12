'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { maybeThrowTractorMine } = loadStandaloneTypeScriptModule(
  path.resolve(__dirname, '../..'),
  'src/systems/combat/combat-tractor-mine-throw.ts'
);

function scenario() {
  const ship = {
    position: { x: 300, y: 400 }, velocity: { x: 0, y: 0 },
    shieldHp: 0, hullHp: 100, tactic: 'minefield',
    setup: { name: 'Miner', tractorRangeMeters: 650 },
    subsystems: { tractor: 100 },
  };
  const enemy = {
    position: { x: 750, y: 400 }, velocity: { x: 0, y: 0 },
    hullHp: 100,
  };
  const mine = {
    id: 1, owner: 'attacker', position: { x: 420, y: 400 },
    armedSeconds: 0, pursuitRemaining: 0,
    definition: { id: 'ion', triggerRadiusMeters: 90 },
  };
  const runtime = {
    mines: [mine], elapsedSeconds: 3, combatLog: [], lastEvent: '',
  };
  return { ship, enemy, mine, runtime };
}
{
  const { ship, enemy, mine, runtime } = scenario();
  assert.equal(maybeThrowTractorMine(runtime, 'attacker', ship, enemy), true);
  assert(mine.tractorVelocity.x > 0, 'mine travels toward moving target');
  assert.equal(runtime.mines.length, 1, 'no duplicate mine is created');
  assert.equal(ship.tractorThrowCooldown, 16, 'shares asteroid cooldown');
  assert.equal(maybeThrowTractorMine(runtime, 'attacker', ship, enemy), false);
  assert(runtime.combatLog[0].detail.includes('TRACTOR_MINE_THROW'));
}
for (const reason of ['shield', 'tractor', 'reach', 'unarmed', 'hostile', 'flight', 'flee']) {
  const { ship, enemy, mine, runtime } = scenario();
  if (reason === 'shield') ship.shieldHp = 100;
  if (reason === 'tractor') ship.subsystems.tractor = 0;
  if (reason === 'reach') ship.setup.tractorRangeMeters = 50;
  if (reason === 'unarmed') mine.armedSeconds = 0.4;
  if (reason === 'hostile') mine.owner = 'defender';
  if (reason === 'flight') mine.tractorVelocity = { x: 100, y: 0 };
  if (reason === 'flee') ship.tactic = 'flee';
  assert.equal(maybeThrowTractorMine(runtime, 'attacker', ship, enemy), false, reason);
  assert.equal(ship.tractorThrowCooldown ?? 0, 0, 'no cooldown spent on ' + reason);
}
console.log('PASS tractor mine throw eligibility and resource reuse');
