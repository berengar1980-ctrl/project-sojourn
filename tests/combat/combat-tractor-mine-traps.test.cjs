'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { mineTrapImpulse, pulseCombatTractor } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-tractor-pulse.ts'
);

function scenario() {
  const ship = {
    position: { x: 500, y: 500 }, velocity: { x: 0, y: 0 }, speed: 0,
    shieldHp: 0, hullHp: 100, tactic: 'minefield',
    setup: { name: 'Layer', aiControlled: true, tractorRangeMeters: 600 },
    subsystems: { tractor: 100 },
  };
  const enemy = {
    position: { x: 750, y: 500 }, velocity: { x: 80, y: 0 }, speed: 80,
    hullHp: 100, shieldHp: 100,
  };
  const mine = {
    id: 1, owner: 'attacker', armedSeconds: 0,
    position: { x: 910, y: 130 },
    definition: { triggerRadiusMeters: 90 },
  };
  const runtime = {
    mines: [mine], elapsedSeconds: 2, combatLog: [], beams: [],
    beamSerial: 0, lastEvent: '',
  };
  return { ship, enemy, mine, runtime };
}

const setup = scenario();
setup.mine.position.y = 620;
const vector = mineTrapImpulse(setup.runtime, 'attacker', setup.ship, setup.enemy);
assert(vector && vector.y > 0, 'trap nudges enemy toward armed friendly mine');
const priorY = setup.enemy.velocity.y;
pulseCombatTractor(setup.runtime, 'attacker', setup.ship, setup.enemy, 0.08);
assert(setup.enemy.velocity.y > priorY, 'real velocity changes toward mine');
assert(setup.runtime.combatLog.some((e) => e.detail.includes('TRAKTOR_MINE_TRAP')));
const lockedY = setup.enemy.velocity.y;
pulseCombatTractor(setup.runtime, 'attacker', setup.ship, setup.enemy, 0.08);
assert.equal(setup.enemy.velocity.y, lockedY, 'cooldown still applies');

for (const reason of ['enemy_mine', 'unarmed', 'far_mine', 'no_shield', 'no_tractor', 'out_of_range']) {
  const { ship, enemy, mine, runtime } = scenario();
  mine.position.y = 620;
  if (reason === 'enemy_mine') mine.owner = 'defender';
  if (reason === 'unarmed') mine.armedSeconds = 1;
  if (reason === 'far_mine') mine.position.y = 1000;
  if (reason === 'no_shield') ship.shieldHp = 100;
  if (reason === 'no_tractor') ship.subsystems.tractor = 0;
  if (reason === 'out_of_range') ship.setup.tractorRangeMeters = 100;
  pulseCombatTractor(runtime, 'attacker', ship, enemy, 0.08);
  assert.equal(runtime.beams.length, 0, reason + ': no wasted tractor pulse');
}
console.log('PASS tractor-assisted mine trap, cooldown, and safety gates');
