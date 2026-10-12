'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { usefulMineCorridor } = loadStandaloneTypeScriptModule(root, 'src/systems/combat/strategic-combat-mines.ts');
const { avoidDetectedMine } = loadStandaloneTypeScriptModule(root, 'src/systems/combat/strategic-combat-movement.ts');

const ship = (x, y, vx = 0, vy = 0) => ({
  position: { x, y },
  velocity: { x: vx, y: vy },
  setup: { aiControlled: true, sensorCrewSkill: 100, sensorTier: 6, sensorRangeMeters: 1000, sensorRangeMultiplier: 1 },
});
const layer = ship(400, 300);
const approach = ship(80, 300, 120, 0);
assert.equal(usefulMineCorridor(layer, approach), true, 'enemy trajectory approaches the mine zone');
assert.equal(usefulMineCorridor(layer, ship(80, 550, 120, 0)), false, 'parallel path misses the mine zone');
assert.equal(usefulMineCorridor(layer, ship(80, 300, -120, 0)), false, 'retreating enemy does not waste a mine');
const mine = {
  id: 1,
  owner: 'defender',
  position: { x: 250, y: 300 },
  definition: { id: 'mine-ion-1', kind: 'ion', triggerRadiusMeters: 90, stealth: 0, tier: 1 },
};
const pilot = ship(100, 300, 100, 0);
const evade = avoidDetectedMine(pilot, 'attacker', [mine], { x: 1, y: 0 });
assert(evade && Math.abs(evade.y) > 0.3, 'detectable mine ahead leads to lateral course change');
assert.equal(avoidDetectedMine(pilot, 'defender', [mine], { x: 1, y: 0 }), null, 'own mines are ignored');
assert.equal(avoidDetectedMine(pilot, 'attacker', [{ ...mine, position: { x: 250, y: 600 } }], { x: 1, y: 0 }), null, 'out-of-lane mine does not redirect AI');
console.log('PASS tactical mine corridor evaluation and lateral avoidance');
