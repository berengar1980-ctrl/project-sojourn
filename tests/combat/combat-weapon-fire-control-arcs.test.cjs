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

const repeaterCycle = { cooldownSeconds: 0.2 };
assert.equal(control.weaponCycleSeconds(repeaterCycle, 1), 0.2);
assert(Math.abs(control.weaponCycleSeconds(repeaterCycle, 0.88) - 0.176) < 0.000001);
const reloadOwner = { setup: { weapons: [{}, {}] }, cooldowns: [0.2, 1.8] };
control.advanceWeaponCooldowns(reloadOwner, 0.2);
assert.deepEqual(reloadOwner.cooldowns, [0, 1.6], 'independent reload timers advance together');

const mountOwner = {
  position: { x: 100, y: 100 },
  headingRadians: 0,
  setup: {
    weaponMounts: [
      { slotIndex: 0, x: 10, y: -12, facing: 'port' },
      { slotIndex: 1, x: 10, y: 12, facing: 'starboard' },
      { slotIndex: 2, x: 20, y: 0, facing: 'forward' },
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
assert(!geometry.weaponInArc(mountOwner, { x: 400, y: 100 }, 0, railgun));
assert(geometry.weaponInArc(mountOwner, { x: 100, y: -200 }, 0, railgun));
assert(geometry.weaponInArc(mountOwner, { x: 400, y: 100 }, 2, railgun));
assert(geometry.weaponInArc(mountOwner, { x: -200, y: 100 }, 0, turret));
mountOwner.headingRadians = Math.PI / 2;
const muzzle = geometry.weaponMuzzle(mountOwner, 0);
assert(Math.abs(muzzle.x - 112) < 0.0001 && Math.abs(muzzle.y - 110) < 0.0001);
assert(geometry.weaponInArc(mountOwner, { x: 400, y: 100 }, 0, broadside));

const droneMountOwner = {
  ...mountOwner,
  setup: { ...mountOwner.setup, id: 'security-drone:arena:escort-2' },
};
for (const heading of [0, Math.PI / 2, Math.PI]) {
  droneMountOwner.headingRadians = heading;
  for (const [x, y] of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ]) {
    const target = { x: 100 + x * 300, y: 100 + y * 300 };
    assert(geometry.weaponInArc(droneMountOwner, target, 2, railgun));
    assert(geometry.weaponInArc(droneMountOwner, target, 0, broadside));
  }
  assert.deepEqual(geometry.weaponMuzzle(droneMountOwner, 0), droneMountOwner.position);
}

const allWeapons = SHIP_COMPONENT_CATALOG.weapon ?? [];
assert.equal(allWeapons.length, 60);
for (const weapon of allWeapons) {
  assert(weapon.weapon.mount, weapon.name + ' must have an explicit mount role');
  assert(weapon.weapon.arcDegrees > 0, weapon.name + ' needs a firing arc');
}
const pulse = allWeapons.find((weapon) => weapon.id === 'weapon1');
const rail = allWeapons.find((weapon) => weapon.id === 'weapon-railgun-1');
const cannon = allWeapons.find((weapon) => weapon.id === 'weapon-autocannon-1');
assert(pulse && rail && cannon);
const repeater = allWeapons.find((weapon) => weapon.id === 'weapon-front-repeater-1');
assert(
  repeater && repeater.weapon.cooldownSeconds < 0.45,
  'rapid front repeater fires independently'
);
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

const droneCombat = createStrategicCombatService(
  setup('security-drone:arena', [rail]),
  setup('target', []),
  57,
  {
    width: 1600,
    height: 1000,
    attackerPosition: { x: 700, y: 500 },
    attackerHeadingRadians: 0,
    defenderPosition: { x: 350, y: 500 },
  }
);
const armedDrone = droneCombat.getParallelActor('attacker');
armedDrone.cooldowns[0] = 0;
const rearShot = droneCombat.tick(0.08);
assert.equal(
  rearShot.attacker.weaponTelemetry[0].shotsFired,
  1,
  'a forward-mounted railgun fires astern on a drone'
);
assert(
  rearShot.beams[0].end.x < rearShot.beams[0].origin.x,
  'the rail shot travels toward the rear target'
);

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
detached.recentImpacts.push({ serial: -1 });
assert.equal(combat.getSnapshot().recentImpacts.length, 0, 'impact history snapshots detach');

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
assert(shots.attacker.size >= 3 && shots.defender.size >= 3, 'both AIs fire independently');
assert(new Set(firstMountShots).size >= 2, 'the same turret can reload and fire repeatedly');

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
  'PASS independent weapon reloads, gun arcs, AI fire, impact history, projectile steering'
);
