'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createCombatant } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const { reviewCombatStrategy } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-strategy-planner.ts'
);
const { scoreWeaponPosture } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-weapon-posture-score.ts'
);
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);

const catalog = (id) => {
  const component = SHIP_COMPONENT_CATALOG.weapon.find((entry) => entry.id === id);
  assert(component, 'missing installed weapon ' + id);
  return component;
};
const rail = catalog('weapon-railgun-1');
const side = catalog('weapon-autocannon-1');
const turret = catalog('weapon1');
const enhance = (component, shield, hull) => ({
  ...component,
  weapon: { ...component.weapon, combatShieldDamage: shield, combatHullDamage: hull },
});
const arena = { width: 3600, height: 2400 };

function makeShip(id, weapons, mounts, x = 700) {
  return createCombatant(
    {
      id,
      name: id,
      shipId: 'patrol-60m-variant-01',
      shieldHp: 150,
      hullHp: 220,
      weapons,
      weaponMounts: mounts.map((facing, slotIndex) => ({
        slotIndex,
        x: 0,
        y: 0,
        facing,
      })),
      hitChance: 0.75,
      dodgeChance: 0,
      damageMultiplier: 1,
      criticalChance: 0,
      cycleTimeMultiplier: 1,
      combatSpeed: 120,
      turnRateRadiansPerSecond: 0.9,
      aiControlled: true,
    },
    'attacker',
    { ...arena, attackerPosition: { x, y: 1000 } }
  );
}

function chosen(front, broadside, shield = 100, mount = {}) {
  const first = makeShip('player', [front, broadside], ['forward', 'port']);
  const enemy = makeShip('enemy', [turret], ['forward'], 1650);
  first.setup.weaponMounts[0] = { ...first.setup.weaponMounts[0], ...mount };
  first.headingRadians = 0;
  enemy.shieldHp = shield;
  reviewCombatStrategy(first, enemy, 'attacker', 0);
  return first.strategy;
}

const strongFront = enhance(rail, 45, 100);
const weakSide = enhance(side, 2, 5);
const heavySide = enhance(side, 55, 140);
assert.equal(chosen(strongFront, weakSide).kind, 'frontal', 'strong front is preferred');
assert.equal(chosen(rail, heavySide).kind, 'broadside', 'strong broadside is preferred');
assert.equal(chosen(rail, side, 100).kind, 'broadside', 'shield phase uses real shield damage');
assert.equal(chosen(rail, side, 0).kind, 'frontal', 'hull phase uses real hull damage');

const restricted = chosen(strongFront, weakSide, 0, { allowedMounts: ['broadside'] });
assert.equal(restricted.kind, 'broadside', 'invalid hardpoint mounts never influence the plan');

const starboard = makeShip('starboard', [weakSide, heavySide], ['port', 'starboard']);
const target = makeShip('target', [turret], ['forward'], 1500);
reviewCombatStrategy(starboard, target, 'attacker', 0);
assert.equal(starboard.strategy.kind, 'broadside');
assert.equal(starboard.strategy.broadsideFacing, 'starboard');

const mixed = makeShip('mixed', [strongFront, weakSide, turret], ['forward', 'port', 'forward']);
const opposing = makeShip('opposing', [turret], ['forward'], 1500);
const main = scoreWeaponPosture(mixed, opposing, { focus: 'forward' });
const port = scoreWeaponPosture(mixed, opposing, { focus: 'broadside', facing: 'port' });
assert(main && port && main.firepower > port.firepower, 'turret cannot dictate bow heading');

const dominant = makeShip('dominant', [strongFront, weakSide], ['forward', 'port']);
const unchangedEnemy = makeShip('enemy', [turret], ['forward'], 1500);
reviewCombatStrategy(dominant, unchangedEnemy, 'attacker', 0);
assert.equal(dominant.strategy.kind, 'frontal');
reviewCombatStrategy(dominant, unchangedEnemy, 'attacker', 32);
assert.equal(
  dominant.strategy.kind,
  'frontal',
  'no-hit review must not force a much weaker broadside posture'
);

const switching = makeShip('switching', [rail, side], ['forward', 'port']);
const switchingTarget = makeShip('target', [turret], ['forward'], 1500);
reviewCombatStrategy(switching, switchingTarget, 'attacker', 0);
assert.equal(switching.strategy.kind, 'broadside');
switchingTarget.shieldHp = 0;
reviewCombatStrategy(switching, switchingTarget, 'attacker', 8);
assert.equal(switching.strategy.kind, 'frontal', 'shield loss changes effective gun priority');

const twinRails = makeShip('twin-rail', [rail, rail, turret], [
  'forward',
  'forward',
  'forward',
]);
const twinTarget = makeShip('twin-target', [turret], ['forward'], 1500);
reviewCombatStrategy(twinRails, twinTarget, 'attacker', 0);
assert.equal(twinRails.strategy.kind, 'skirmish', 'shields favour the effective turret');
twinTarget.shieldHp = 0;
twinRails.cooldowns[0] = 6;
twinRails.cooldowns[1] = 6;
reviewCombatStrategy(twinRails, twinTarget, 'attacker', 8);
assert.equal(
  twinRails.strategy.kind,
  'frontal',
  'twin railguns pre-align for the loaded hull-destruction salvo after shield loss'
);

const narrow = {
  ...strongFront,
  weapon: { ...strongFront.weapon, arcDegrees: 10 },
};
const wide = {
  ...strongFront,
  weapon: { ...strongFront.weapon, arcDegrees: 120 },
};
const narrowShip = makeShip('narrow', [narrow], ['forward']);
const wideShip = makeShip('wide', [wide], ['forward']);
const narrowScore = scoreWeaponPosture(narrowShip, opposing, { focus: 'forward' });
const wideScore = scoreWeaponPosture(wideShip, opposing, { focus: 'forward' });
assert(narrowScore && wideScore && wideScore.firepower > narrowScore.firepower);

const shortHeavy = {
  ...heavySide,
  weapon: { ...heavySide.weapon, rangeMeters: 300 },
};
const longWeak = {
  ...weakSide,
  weapon: { ...weakSide.weapon, rangeMeters: 1800 },
};
const rangedShip = makeShip('ranged', [shortHeavy, longWeak], ['port', 'port']);
const rangeScore = scoreWeaponPosture(rangedShip, opposing, {
  focus: 'broadside',
  facing: 'port',
});
assert(rangeScore && rangeScore.effectiveRange < 600, 'dominant short gun sets useful range');

console.log('PASS mounted arcs, phase damage, usable range and strong-weapon tactical priority');
