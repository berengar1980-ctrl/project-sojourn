'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { resolveSecurityDroneDebrisContacts, DRONE_SHIELD_RADIUS_METERS } = load(
  'src/systems/operations/security-drone-debris-contact.ts'
);
const { AsteroidSecurityDrone } = load('src/systems/operations/asteroid-security-drone.ts');
const { equipSecurityDroneMk3 } = load('src/app/game-controller-security-drone-loadout.ts');
const {
  getShipDefinition,
  getShipComponent,
  fitsWeaponHardpoint,
  isShipCombatWeaponSlotActive,
  calculateShipModeEnergy,
} = load('src/systems/ships/index.ts');
const rock = {
  id: 'small-debris',
  kind: 'debris',
  routeBlocking: false,
  position: { x: 116, y: 100 },
  radius: 8,
  collisionRadius: 8,
  rotation: 0,
  physics: { velocity: { x: 0, y: 0 }, angularVelocity: 0 },
};
const count = resolveSecurityDroneDebrisContacts({ x: 100, y: 100 }, { x: 90, y: 0 }, [rock]);
assert.equal(count, 1, 'Tiny nonblocking rock must collide with a drone shield');
assert(
  Math.hypot(rock.position.x - 100, rock.position.y - 100) >=
    DRONE_SHIELD_RADIUS_METERS + rock.collisionRadius,
  'The debris is moved outside the solid drone shield'
);
assert(rock.physics.velocity.x > 0, 'Contact transfers a physical outward impulse');
assert.equal(
  resolveSecurityDroneDebrisContacts({ x: 100, y: 100 }, { x: 90, y: 0 }, [rock]),
  0,
  'Separated debris is not contacted repeatedly'
);

const patrol = new AsteroidSecurityDrone(1000, 700, []);
const touching = {
  ...rock,
  id: 'other-debris',
  position: { x: patrol.position.x + 10, y: patrol.position.y },
  physics: { velocity: { x: 0, y: 0 }, angularVelocity: 0 },
};
patrol.tick(0.08, [touching], [], []);
assert(patrol.snapshot().shieldContactSeconds > 0, 'Collision makes the shield briefly flash');

const ship = getShipDefinition('patrol-60m-variant-01');
assert(ship, 'Patrol combat chassis should exist');
const npc = {
  id: 'security-drone:field-1',
  shipId: ship.id,
  hullMaxHp: 100,
  hullHp: 75,
};
equipSecurityDroneMk3(npc);
assert.deepEqual(npc.installedComponents.hull, ['hull3']);
assert.deepEqual(npc.installedComponents.shield, ['shield3']);
assert(npc.hullMaxHp > 0 && npc.hullHp > 0);
const energy = calculateShipModeEnergy(npc.installedComponents);
assert(energy.output >= energy.combat, 'All Mk III weapons and shield must have sufficient power');
const droneShip = getShipDefinition(npc.shipId);
assert.equal(droneShip.id, '24m-security-drone', 'legacy patrol is migrated to GC-87');
assert.equal(npc.hullHp, Math.round(npc.hullMaxHp * 0.75), 'migration preserves hull condition');
const mounts = droneShip.sprite.hardpoints.weaponMounts ?? [];
assert.equal(mounts.length, 3);
for (const mount of mounts) {
  if (!isShipCombatWeaponSlotActive(droneShip, mount.slotIndex)) continue;
  const weaponId = npc.installedComponents.weapon[mount.slotIndex];
  assert(weaponId, 'Every active mount must be armed');
  const weapon = getShipComponent('weapon', weaponId);
  assert.equal(weapon?.tier, 3, 'Every installed weapon is Mk III');
  assert(fitsWeaponHardpoint(droneShip, mount.slotIndex, weapon.weapon));
}
console.log('PASS drone debris collision, shield flash, and Mk III weapon/hull/shield loadout');
