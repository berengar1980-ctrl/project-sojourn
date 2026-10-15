'use strict';
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const cache = new Map();
const load = (name) => loadStandaloneTypeScriptModule(root, name, cache);
const { SHIP_COMPONENT_CATALOG } = load('src/data/ships/ship-component-catalog.ts');
const { createCombatant } = load('src/systems/combat/strategic-combat-geometry.ts');
const arena = {
  width: 4000,
  height: 3000,
  attackerPosition: { x: 1400, y: 1500 },
  defenderPosition: { x: 2000, y: 1500 },
  exitPoint: { x: 80, y: 1500 },
  allowBoarding: false,
  obstacles: [],
};
function setup(id, guns = ['weapon-railgun-1'], facings = ['forward']) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    hullHp: 100000,
    shieldHp: 100000,
    weapons: guns.map((gunId) => SHIP_COMPONENT_CATALOG.weapon.find((w) => w.id === gunId)),
    weaponMounts: guns.map((_, slotIndex) => ({
      slotIndex,
      x: 0,
      y: 0,
      facing: facings[slotIndex] ?? 'forward',
    })),
    hitChance: 1,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 120,
    accelerationMetersPerSecond2: 35,
    turnRateRadiansPerSecond: 1,
    aiControlled: true,
    aiAggression: 90,
  };
}
function pair(guns, facings) {
  const a = createCombatant(setup('a', guns, facings), 'attacker', arena);
  const b = createCombatant(setup('b', guns, facings), 'defender', arena);
  a.combatTacticLocked = b.combatTacticLocked = true;
  return [a, b];
}
module.exports = { root, load, setup, pair, arena };
