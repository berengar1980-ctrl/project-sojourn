'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createCombatant, snapshot } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const { advanceRuntimeWeapons, advanceRuntimeProjectiles } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-weapons.ts'
);
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);
const weapon = (id) => {
  const component = SHIP_COMPONENT_CATALOG.weapon.find((entry) => entry.id === id);
  assert(component);
  return component;
};
const rail = weapon('weapon-railgun-1');
const missile = weapon('weapon-he-missile-1');
const arena = {
  width: 2400,
  height: 1600,
  attackerPosition: { x: 500, y: 800 },
  defenderPosition: { x: 850, y: 800 },
  obstacles: [],
};
function setup(name, weapons, shields = 0) {
  return {
    id: name,
    name,
    shipId: 'patrol-60m-variant-01',
    shieldHp: shields,
    hullHp: 600,
    weapons,
    weaponMounts: weapons.map((_, index) => ({
      slotIndex: index,
      x: 25,
      y: index * 6,
      facing: 'forward',
      arcDegrees: 360,
    })),
    hitChance: 0.98,
    dodgeChance: 0,
    criticalChance: 0,
    damageMultiplier: 1,
    cycleTimeMultiplier: 1,
  };
}
const ship = createCombatant(setup('attacker', [rail, missile]), 'attacker', arena);
const victim = createCombatant(setup('defender', []), 'defender', arena);
ship.cooldowns.fill(0);
const runtime = {
  attacker: ship,
  defender: victim,
  arena,
  elapsedSeconds: 2,
  random: () => 0.01,
  projectiles: [],
  projectileSerial: 0,
  beams: [],
  beamSerial: 0,
  impactSerial: 0,
  lastImpact: null,
  recentImpacts: [],
};
advanceRuntimeWeapons(runtime, 'attacker', ship, victim, 0.08);
assert.equal(ship.weaponTelemetry[0].shotsFired, 1, 'railgun shot is counted at fire time');
assert(ship.weaponTelemetry[0].hullDamageDealt > 0, 'railgun gets measured hull damage');
assert.equal(ship.weaponTelemetry[0].shieldDamageDealt, 0);
const recorded = ship.weaponTelemetry[0].hullDamageDealt;
const frozen = snapshot(ship);
frozen.weaponTelemetry[0].hullDamageDealt = -999;
assert.equal(ship.weaponTelemetry[0].hullDamageDealt, recorded, 'HUD snapshots are detached');

ship.cooldowns[0] = 999;
ship.cooldowns[1] = 0;
runtime.elapsedSeconds = 3;
advanceRuntimeWeapons(runtime, 'attacker', ship, victim, 0.08);
assert.equal(ship.weaponTelemetry[1].shotsFired, 1, 'projectile launch counts exactly once');
assert.equal(ship.weaponTelemetry[1].hullDamageDealt, 0, 'no damage before projectile arrival');
assert.equal(runtime.projectiles[0]?.weaponIndex, 1, 'projectile retains its physical gun slot');
for (let i = 0; i < 35 && runtime.projectiles.length; i++) {
  advanceRuntimeProjectiles(runtime, 0.08);
}
assert.equal(runtime.projectiles.length, 0, 'projectile resolves');
assert(ship.weaponTelemetry[1].hullDamageDealt > 0, 'projectile damage credits launcher');
assert.equal(ship.weaponTelemetry[1].shotsFired, 1, 'projectile impact is not another shot');

const { recordWeaponDamage } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-weapon-telemetry.ts'
);
recordWeaponDamage(ship, 0, 'obstacle', 50);
recordWeaponDamage(ship, 0, 'miss', 50);
assert.equal(ship.weaponTelemetry[0].hullDamageDealt, recorded, 'misses never grant damage');
recordWeaponDamage(ship, 0, 'shield', 2);
assert.equal(ship.weaponTelemetry[0].shieldDamageDealt, 2, 'shield damage is separate');
console.log(
  'PASS per-hardpoint shots, delayed projectile damage, shield/hull totals and snapshots'
);
