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
const fight = createStrategicCombatService(ship('A', rail), ship('B', side), 71, {
  width: 2200,
  height: 1400,
  attackerPosition: { x: 700, y: 700 },
  defenderPosition: { x: 1600, y: 700 },
});
let snap = fight.getSnapshot();
assert.equal(snap.attacker.nextStrategyReviewAt, 0);
assert.equal(snap.defender.nextStrategyReviewAt, 4);
assert.equal(snap.attacker.strategy, null);
assert.equal(snap.defender.strategy, null);

snap = fight.tick(0.08);
assert.equal(snap.attacker.strategy.kind, 'frontal');
assert.equal(snap.defender.strategy, null);
assert.equal(snap.attacker.nextStrategyReviewAt, 8);
for (let i = 0; i < 48; i += 1) snap = fight.tick(0.08);
assert.equal(snap.defender.strategy, null, 'defender has not yet planned before four seconds');
snap = fight.tick(0.08);
assert.equal(snap.defender.strategy.kind, 'broadside');
assert.equal(snap.defender.nextStrategyReviewAt, 12);
const attackerKind = snap.attacker.strategy.kind;
for (let i = 0; i < 48; i += 1) snap = fight.tick(0.08);
assert.equal(snap.attacker.strategy.kind, attackerKind, 'strategy is stable between reviews');
assert.equal(snap.attacker.nextStrategyReviewAt, 8);
for (let i = 0; i < 52; i += 1) snap = fight.tick(0.08);
assert.equal(snap.attacker.nextStrategyReviewAt, 16, 'attacker reviews at eight seconds');
assert.equal(snap.defender.nextStrategyReviewAt, 12, 'defender reviews four seconds later');
const original = snap.attacker.strategy.kind;
snap.attacker.strategy.kind = 'escape';
assert.equal(fight.getSnapshot().attacker.strategy.kind, original, 'strategy snapshot is detached');
console.log('PASS staggered independent combat strategies');
