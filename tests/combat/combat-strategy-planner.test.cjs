'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);
const rail = SHIP_COMPONENT_CATALOG.weapon.find((weapon) => weapon.id === 'weapon-railgun-1');
const side = SHIP_COMPONENT_CATALOG.weapon.find((weapon) => weapon.id === 'weapon-autocannon-1');
assert(rail && side);

function ship(id, weapon) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 200,
    hullHp: 300,
    weapons: [weapon],
    weaponMounts: [
      {
        slotIndex: 0,
        x: 12,
        y: -10,
        facing: weapon.weapon.mount === 'forward' ? 'forward' : 'port',
      },
    ],
    hitChance: 0.7,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 95,
    accelerationMetersPerSecond2: 35,
    turnRateRadiansPerSecond: 1.2,
    aiControlled: true,
    aiAggression: 90,
  };
}
const fight = createStrategicCombatService(ship('A', rail), ship('B', side), 70, {
  width: 2200,
  height: 1400,
  attackerPosition: { x: 700, y: 700 },
  defenderPosition: { x: 1600, y: 700 },
});
let snap = fight.tick(0.08);
assert.equal(snap.attacker.strategy.kind, 'frontal');
assert.equal(snap.defender.strategy.kind, 'broadside');
const initial = [snap.attacker.strategy.kind, snap.defender.strategy.kind];
for (let i = 0; i < 150; i++) snap = fight.tick(0.08);
assert.deepEqual(
  [snap.attacker.strategy.kind, snap.defender.strategy.kind],
  initial,
  'continued reviews do not manufacture strategy changes'
);
const original = snap.attacker.strategy.kind;
snap.attacker.strategy.kind = 'escape';
assert.equal(fight.getSnapshot().attacker.strategy.kind, original, 'strategy snapshot is detached');
console.log('PASS stable independent combat strategies');
