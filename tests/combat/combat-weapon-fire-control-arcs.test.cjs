'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const control = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-weapon-fire-control.ts'
);
const geometry = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-weapon-geometry.ts'
);
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { advanceRuntimeProjectiles } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-weapons.ts'
);
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);

assert.deepEqual(
  [1, 2, 3, 4].map(control.fireControlRechargeSeconds),
  [0.9, 0.8, 0.72, 0.68],
  'Voidbound recharge intervals must remain deterministic'
);

const fireOwner = {
  fireControl: { max: 3, charges: 3, nextRechargeAt: 0, lastShotAt: -10000 },
};
assert(control.consumeFireControl(fireOwner, 10), 'first shot consumes a shared charge');
assert(!control.consumeFireControl(fireOwner, 10.2), 'all weapons share a 450ms command interval');
assert(control.consumeFireControl(fireOwner, 10.45), 'second pulse can fire the same gun');
assert.equal(fireOwner.fireControl.charges, 1);
control.rechargeFireControl(fireOwner, 10.71);
assert.equal(fireOwner.fireControl.charges, 1, 'recharge must not arrive early');
control.rechargeFireControl(fireOwner, 10.72);
assert.equal(fireOwner.fireControl.charges, 2, 'charges refill sequentially');
control.rechargeFireControl(fireOwner, 11.44);
assert.equal(fireOwner.fireControl.charges, 3, 'second charge follows the first');

const mountOwner = {
  position: { x: 100, y: 100 },
  headingRadians: 0,
  setup: {
    weaponMounts: [
      { slotIndex: 0, x: 10, y: -12, facing: 'port' },
      { slotIndex: 1, x: 10, y: 12, facing: 'starboard' },
    ],
  },
};
const broadside = { mount: 'broadside', arcDegrees: 90 };
const railgun = { mount: 'forward', arcDegrees: 60 };
const turret = { mount: 'turret', arcDegrees: 360 };
assert(geometry.weaponInArc(mountOwner, { x: 100, y: -200 }, 0, broadside));
assert(!geometry.weaponInArc(mountOwner, { x: 100, y: 400 }, 0, broadside));
assert(geometry.weaponInArc(mountOwner, { x: 100, y: 400 }, 1, broadside));
assert(!geometry.weaponInArc(mountOwner, { x: 100, y: -200 }, 1, broadside));
assert(geometry.weaponInArc(mountOwner, { x: 400, y: 100 }, 0, railgun));
assert(!geometry.weaponInArc(mountOwner, { x: 100, y: -200 }, 0, railgun));
assert(geometry.weaponInArc(mountOwner, { x: -200, y: 100 }, 0, turret));
mountOwner.headingRadians = Math.PI / 2;
const muzzle = geometry.weaponMuzzle(mountOwner, 0);
assert(Math.abs(muzzle.x - 112) < 0.0001 && Math.abs(muzzle.y - 110) < 0.0001);
assert(geometry.weaponInArc(mountOwner, { x: 400, y: 100 }, 0, broadside));

const allWeapons = SHIP_COMPONENT_CATALOG.weapon ?? [];
assert.equal(allWeapons.length, 48);
for (const weapon of allWeapons) {
  assert(weapon.weapon.mount, weapon.name + ' must have an explicit mount role');
  assert(weapon.weapon.arcDegrees > 0, weapon.name + ' needs a firing arc');
}
const pulse = allWeapons.find((weapon) => weapon.id === 'weapon1');
const rail = allWeapons.find((weapon) => weapon.id === 'weapon-railgun-1');
const cannon = allWeapons.find((weapon) => weapon.id === 'weapon-autocannon-1');
assert(pulse && rail && cannon);
assert(pulse.weapon.cooldownSeconds < 0.45, 'small turrets can reuse spare charges quickly');
assert(rail.weapon.cooldownSeconds > 6, 'railgun must recharge slowly');
assert(rail.weapon.hullDamage > cannon.weapon.hullDamage * 5);

function setup(id, weapons) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 500,
    hullHp: 500,
    weapons,
    hitChance: 0.85,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 75,
    weaponMounts: [
      { slotIndex: 0, x: 10, y: -10, facing: 'port' },
      { slotIndex: 1, x: 10, y: 10, facing: 'starboard' },
      { slotIndex: 2, x: 20, y: 0, facing: 'forward' },
    ],
  };
}

const combat = createStrategicCombatService(
  setup('player', [pulse, pulse, pulse]),
  setup('npc', [pulse, pulse, pulse]),
  7,
  {
    width: 1600,
    height: 1000,
    attackerPosition: { x: 600, y: 500 },
    defenderPosition: { x: 940, y: 500 },
  }
);
const detached = combat.getSnapshot();
detached.attacker.fireControl.charges = -999;
assert.equal(combat.getSnapshot().attacker.fireControl.charges, 3);

const shots = { attacker: new Set(), defender: new Set() };
const firstMountShots = [];
for (let tick = 0; tick < 90; tick += 1) {
  const snap = combat.tick(0.08);
  for (const beam of snap.beams) {
    shots[beam.owner].add(beam.id);
    if (beam.owner === 'attacker' && beam.weaponIndex === 0) {
      firstMountShots.push(beam.id);
    }
  }
}
assert(shots.attacker.size >= 3 && shots.defender.size >= 3, 'both AIs fire via shared control');
assert(new Set(firstMountShots).size >= 2, 'the same turret can consume successive pulses');

function testProjectile(kind, targetY) {
  const attacker = { position: { x: 100, y: 100 } };
  const defender = {
    position: { x: 900, y: targetY },
    shieldHp: 0,
    hullHp: 100,
    setup: { name: 'target' },
  };
  const projectile = {
    id: 1,
    owner: 'attacker',
    kind,
    family: kind === 'missile' ? 'guided_missile' : 'plasma_battery',
    position: { x: 100, y: 100 },
    direction: { x: 1, y: 0 },
    target: 'defender',
    speed: 400,
    ttlSeconds: 10,
    shieldDamage: 20,
    hullDamage: 20,
    critical: false,
  };
  const runtime = {
    attacker,
    defender,
    projectiles: [projectile],
    arena: { obstacles: [] },
  };
  advanceRuntimeProjectiles(runtime, 0.1);
  return projectile;
}
assert.equal(testProjectile('plasma', 400).position.y, 100, 'plasma must stay ballistic');
assert(testProjectile('missile', 400).position.y > 100, 'missiles must steer toward the target');

console.log(
  'PASS shared fire impulses, 450ms command gap, gun arcs, AI fire, snapshot, projectile steering'
);
