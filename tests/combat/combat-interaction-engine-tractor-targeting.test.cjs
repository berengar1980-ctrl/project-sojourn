'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const geometry = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const targeting = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-subsystem-targeting.ts'
);
const damage = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-damage.ts'
);
const arena = {
  width: 1800,
  height: 1100,
  attackerPosition: { x: 500, y: 550 },
  defenderPosition: { x: 900, y: 550 },
};
const setup = (id) => ({
  id,
  name: id,
  shipId: 'patrol-test',
  shieldHp: 60,
  hullHp: 100,
  weapons: [],
  hitChance: 1,
  dodgeChance: 0,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  combatSpeed: 100,
  tractorRangeMeters: 500,
});
const source = geometry.createCombatant(setup('hunter'), 'attacker', arena);
const enemy = geometry.createCombatant(setup('runner'), 'defender', arena);
enemy.headingRadians = 0;
enemy.tactic = 'flee';
source.strategy = { kind: 'frontal', targetSubsystem: 'tractor' };
assert.equal(
  targeting.effectiveTargetSubsystem(source, enemy),
  'hull',
  'active shield always takes hits before subsystem targeting'
);
const shieldImpact = damage.applyDamage(
  enemy,
  400,
  80,
  source,
  false,
  source.position,
  'laser',
  1,
  undefined,
  'tractor'
);
assert.equal(shieldImpact.layer, 'shield');
assert.equal(enemy.subsystems.tractor, 100);
assert.equal(enemy.hullHp, 100);
assert.equal(enemy.shieldHp, 0);

assert.equal(
  targeting.effectiveTargetSubsystem(source, enemy),
  'engine',
  'escaping ships prioritize engines even if the attacker selected tractor'
);
assert.equal(
  targeting.canEngagePreferredSubsystem(source, enemy),
  true,
  'stern approach exposes engines'
);
const engineHit = damage.applyDamage(
  enemy,
  0,
  600,
  source,
  false,
  source.position,
  'laser',
  2,
  undefined,
  targeting.effectiveTargetSubsystem(source, enemy)
);
assert.equal(engineHit.subsystem, 'engine');
assert.equal(enemy.subsystems.engine, 0);
assert.equal(enemy.subsystems.tractor, 100);
assert.equal(enemy.hullHp, 100);
assert.equal(
  targeting.effectiveTargetSubsystem(source, enemy),
  'tractor',
  'attacker returns to selected tractor after fleeing engines destroyed'
);

const tractorHit = damage.applyDamage(
  enemy,
  0,
  600,
  source,
  false,
  source.position,
  'laser',
  3,
  undefined,
  targeting.effectiveTargetSubsystem(source, enemy)
);
assert.equal(tractorHit.subsystem, 'tractor');
assert.equal(enemy.subsystems.tractor, 0);
assert.equal(enemy.hullHp, 100, 'targeted damage does not bypass hull-only defeat condition');
assert.equal(
  targeting.effectiveTargetSubsystem(source, enemy),
  'hull',
  'destroyed subsystem cannot absorb further targeted damage'
);

const frontTarget = geometry.createCombatant(setup('front-target'), 'defender', arena);
frontTarget.shieldHp = 0;
frontTarget.headingRadians = Math.PI;
frontTarget.tactic = 'flee';
assert.equal(
  targeting.engineShotAvailable(source, frontTarget),
  false,
  'no directed engine hit from the ship nose'
);
assert.equal(
  targeting.canEngagePreferredSubsystem(source, frontTarget),
  false,
  'AI should hold fire until fleeing engine is exposed'
);
assert.equal(
  targeting.effectiveTargetSubsystem(source, frontTarget),
  'hull',
  'front-angle fallback does not invent an engine hit'
);
source.position = { x: 900, y: 800 };
assert.equal(
  targeting.engineShotAvailable(source, frontTarget),
  true,
  'broadside angle exposes the propulsion subsystem'
);
console.log('PASS selective engine/tractor targeting, shield gating and firing arcs');
