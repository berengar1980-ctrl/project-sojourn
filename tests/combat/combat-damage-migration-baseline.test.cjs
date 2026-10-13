'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root, 'src/data/ships/ship-component-catalog.ts'
);
const { SHIP_MINE_CATALOG } = loadStandaloneTypeScriptModule(
  root, 'src/data/combat/ship-mines.ts'
);
const { createCombatant } = loadStandaloneTypeScriptModule(
  root, 'src/systems/combat/strategic-combat-geometry.ts'
);
const { applyDamage } = loadStandaloneTypeScriptModule(
  root, 'src/systems/combat/strategic-combat-damage.ts'
);
const arena = { width: 1800, height: 1000,
  attackerPosition: { x: 400, y: 500 }, defenderPosition: { x: 1000, y: 500 } };
const baseline = 0.18;
const expected = (raw, crew, critical) =>
  Math.max(1, raw * baseline * crew * (critical ? 1.5 : 1));
function ship(id, side, hp, crew) {
  return createCombatant({
    id, name: id, shipId: 'patrol', shieldHp: hp, hullHp: 2000,
    weapons: [], hitChance: 1, dodgeChance: 0, damageMultiplier: crew,
    criticalChance: 0, cycleTimeMultiplier: 1,
  }, side, arena);
}
for (const component of SHIP_COMPONENT_CATALOG.weapon) {
  const profile = component.weapon;
  assert(profile, component.id + ' missing weapon profile');
  for (const [crew, critical] of [[0.75, false], [1, false], [1.2, true]]) {
    const attacker = ship('attacker', 'attacker', 0, crew);
    const target = ship('target', 'defender', 0, 1);
    const hit = applyDamage(target, profile.shieldDamage, profile.hullDamage, attacker,
      critical, attacker.position, 'laser', 1);
    assert(Math.abs(hit.damage - expected(profile.hullDamage, crew, critical)) < 0.000001,
      component.id + ': hull damage differs from original balance');
  }
}
for (const mine of SHIP_MINE_CATALOG) {
  const attacker = ship('attacker', 'attacker', 0, 1);
  const target = ship('target', 'defender', 0, 1);
  const hit = applyDamage(target, mine.shieldDamage, mine.hullDamage, attacker,
    false, attacker.position, 'missile', 1);
  assert(Math.abs(hit.damage - expected(mine.hullDamage, 1, false)) < 0.000001,
    mine.id + ': mine damage differs from original balance');
}
console.log('PASS legacy combat damage reference across all weapon and mine tiers');
