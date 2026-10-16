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
const original = SHIP_COMPONENT_CATALOG.weapon.find((entry) => entry.id === 'weapon-ion-laser-1');
assert(original?.weapon);
const gun = {
  ...original,
  weapon: {
    ...original.weapon,
    cooldownSeconds: 0.2,
    combatHullDamage: 2,
    hullDamage: 2,
  },
};
function setup(id) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 0,
    hullHp: 2000,
    weapons: [gun],
    weaponMounts: [{ slotIndex: 0, x: 0, y: 0, facing: 'forward' }],
    hitChance: 1,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 65,
    accelerationMetersPerSecond2: 30,
    turnRateRadiansPerSecond: 1,
    aiControlled: false,
  };
}
const arena = {
  width: 2100,
  height: 1300,
  attackerPosition: { x: 640, y: 650 },
  defenderPosition: { x: 1090, y: 650 },
  attackerHeadingRadians: 0,
  defenderHeadingRadians: Math.PI,
};
let checked = false;
for (let seed = 1; seed <= 30 && !checked; seed += 1) {
  const fight = createStrategicCombatService(setup('hook'), setup('victim'), seed, arena);
  assert(fight.fireGrapple('attacker'));
  if (!fight.getSnapshot().grapple?.success) continue;
  let lastHp = fight.getSnapshot().defender.hullHp;
  let attached = false;
  let damagedWhileAttached = false;
  for (let step = 0; step < 180; step += 1) {
    const snap = fight.tick(0.08);
    if (snap.grapple?.resolved && !snap.winner) {
      attached = true;
      damagedWhileAttached ||= snap.defender.hullHp < lastHp;
    }
    lastHp = snap.defender.hullHp;
    if (snap.winner) break;
  }
  assert(attached, 'successful hook must have a tethered flight phase');
  assert(damagedWhileAttached, 'gunfire must continue after hook attachment before docking');
  checked = true;
}
assert(checked, 'must exercise at least one successful grapple');
console.log('PASS weapons and damage stay active during an attached boarding grapple');
