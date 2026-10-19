'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const fire = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-weapon-fire-control.ts'
);
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);
const { createCombatant } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const weapon = (id) => {
  const component = SHIP_COMPONENT_CATALOG.weapon.find((entry) => entry.id === id);
  assert(component, id);
  return component;
};
const rail = weapon('weapon-railgun-1');
const repeater = weapon('weapon-front-repeater-1');
const ion = weapon('weapon-ion-laser-1');
const arena = {
  width: 2200,
  height: 1200,
  attackerPosition: { x: 500, y: 600 },
  defenderPosition: { x: 950, y: 600 },
};

function combatant(name, weapons, shieldHp = 200, hullHp = 350) {
  return createCombatant(
    {
      id: name,
      name,
      shipId: 'patrol-60m-variant-01',
      shieldHp,
      hullHp,
      weapons,
      hitChance: 0.98,
      dodgeChance: 0,
      criticalChance: 0,
      damageMultiplier: 1,
      cycleTimeMultiplier: 1,
    },
    name === 'target' ? 'defender' : 'attacker',
    arena
  );
}
function choices(components) {
  return components.map((component, index) => ({ index, component }));
}
function decide(source, target, time = 5) {
  return fire.selectFireControlVolley(source, target, choices(source.setup.weapons), time);
}
const source = combatant('source', [rail, repeater, ion]);
const target = combatant('target', []);
source.cooldowns.fill(0);
assert.deepEqual(decide(source, target), [2], 'real ion shield DPS beats nominal railgun damage');
target.shieldHp = 0;
assert.deepEqual(decide(source, target), [0], 'railgun becomes best against unshielded hull');
target.shieldHp = 200;
const mixed = combatant('mixed', [rail, repeater, repeater]);
mixed.cooldowns.fill(0);
assert.deepEqual(
  decide(mixed, target),
  [1, 2],
  'fast loaded front repeaters share a salvo without wasting the rail shot'
);
fire.commitFireControlVolley(mixed, 5, [1]);
assert.deepEqual(decide(mixed, target, 5.6), [], 'decision cadence reduces excess fire');
assert.deepEqual(
  decide(mixed, target, 5.65).sort((a, b) => a - b),
  [1, 2],
  'two repeaters share the next cadence regardless of round-robin order'
);
assert.equal(mixed.cooldowns[1], 0, 'selection does not modify individual weapon reloads');

const heavy = combatant('heavy', [rail, rail]);
heavy.cooldowns.fill(0);
target.shieldHp = 0;
target.hullHp = 350;
assert.deepEqual(decide(heavy, target), [0, 1], 'two powerful shots may share one salvo');
target.hullHp = 40;
assert.deepEqual(decide(heavy, target), [0], 'one lethal rail should not waste the second');
target.hullHp = 350;
heavy.cooldowns[0] = 3;
assert.deepEqual(decide(heavy, target), [1], 'a cooling gun cannot join the salvo');
heavy.cooldowns[0] = 0.15;
assert.deepEqual(
  decide(heavy, target),
  [1],
  'near-equal high-impact guns do not stall indefinitely'
);

const waiting = combatant('waiting', [repeater, rail]);
waiting.cooldowns[0] = 0;
waiting.cooldowns[1] = 0.16;
assert.deepEqual(
  decide(waiting, target),
  [],
  'defer a weak shot very briefly for a much stronger gun about to finish reloading'
);
waiting.cooldowns[1] = 0;
assert.deepEqual(decide(waiting, target, 5.16), [1], 'release the strong gun when ready');
assert.equal(
  waiting.nextFireDecisionAt,
  undefined,
  'unlaunched evaluations spend no fire-control slot'
);

const onlyRail = combatant('only-rail', [rail]);
onlyRail.cooldowns[0] = 0;
target.shieldHp = 200;
assert.deepEqual(decide(onlyRail, target), [0], 'never reserve the only usable gun indefinitely');
assert.equal(fire.weaponCycleSeconds(repeater.weapon, 1), 0.2);
assert.equal(fire.weaponCycleSeconds(rail.weapon, 1), 7.2);
console.log(
  'PASS damage-aware shield/hull switching, paced fire, heavy salvos and bounded waiting'
);
