'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);
const ships = load('src/systems/ships/ship-registry.ts');
const stats = load('src/systems/ships/ship-stats.ts');
const policy = load('src/systems/ships/ship-combat-role-policy.ts');
const loadouts = load('src/systems/ships/ship-loadout-service.ts');
const equipment = load('src/systems/ships/ship-mining-capability.ts');
const mounts = load('src/systems/combat/combat-loadout-mounts.ts');
const campaign = load('src/app/game-controller-combat.ts');
const duel = load('src/ui/start/duel-combatant-setup.ts');
const physics = load('src/systems/combat/combat-inertial-thrust.ts');
const grapplePhysics = load('src/systems/combat/combat-grapple-physics.ts');
const throwLogic = load('src/systems/combat/combat-tractor-asteroid-throw.ts');

const maxWeapons = { patrol: 6, freighter: 2, mining: 1, salvage: 1 };
const activeSlots = {
  patrol: [0, 1, 2, 3, 4, 5],
  freighter: [0, 3],
  mining: [0],
  salvage: [0],
};
const isIndustrial = (role) => role === 'mining' || role === 'salvage';
const fitting = [
  'weapon-front-repeater-1',
  'weapon-plasma-battery-1',
  'weapon-autocannon-1',
  'weapon1',
  'weapon-he-missile-1',
  'weapon-railgun-1',
];

for (const ship of ships.getAllShipDefinitions()) {
  const role = ship.role;
  assert.deepEqual(
    policy.shipActiveCombatWeaponMounts(ship).map((mount) => mount.slotIndex),
    activeSlots[role],
    ship.id + ': correct active role hardpoints'
  );
  assert.equal(stats.resolveShipGameplayStats(ship).weaponSlots, maxWeapons[role]);
  assert.equal(policy.shipHasIndustrialTractor(ship), isIndustrial(role));

  const configured = { ...equipment.defaultInstalledShipComponents(ship), weapon: fitting };
  const armed = mounts.combatEquippedWeapons(ship, fitting);
  assert.equal(armed.length, maxWeapons[role], ship.id + ': invalid slots are ignored');
  assert.equal(mounts.combatWeaponMounts(ship, armed).length, maxWeapons[role]);

  const player = campaign.createPlayerCombatant(ship, { installed: configured });
  const competitor = duel.duelCombatant(
    0,
    { shipId: ship.id, weapons: [...fitting], mines: [], crewId: '' },
    ship
  );
  for (const setup of [player, competitor]) {
    assert.equal(setup.weapons.length, maxWeapons[role], ship.id + ': shared battle loadout');
    assert.equal(setup.weaponMounts.length, maxWeapons[role]);
    assert.equal(setup.tractorRangeMeters >= 400, true, ship.id + ': boarding tractor');
    assert.equal(setup.tractorCanManipulateObjects, isIndustrial(role));
  }

  const loadout = loadouts.createShipLoadoutService();
  for (let slot = 0; slot < 6; slot += 1) {
    if (activeSlots[role].includes(slot)) continue;
    assert.equal(loadout.setSlot(ship, 'weapon', slot, fitting[slot]), false);
  }
}
assert.equal(ships.getAllShipDefinitions().length, 28, 'all 28 ship variants checked');
const freighter = ships.getAllShipDefinitions().find((ship) => ship.role === 'freighter');
assert.equal(stats.shipHullMaxHp(freighter), 115, 'freighter is sturdier than a patrol vessel');
assert.equal(
  policy.shipCombatTractorRange({ tractor: ['tractor3'] }),
  510,
  'optional tractor upgrade extends the common boarding range'
);

// The universal tractor can accelerate the ship from a massive stationary anchor,
// without giving the patrol or freighter permission to throw that asteroid.
const anchor = {
  id: 'anchor',
  kind: 'resource',
  radius: 65,
  position: { x: 100, y: 300 },
};
const base = {
  position: { x: 280, y: 300 },
  shieldHp: 0,
  hullHp: 100,
  boostActive: true,
  subsystems: { tractor: 100 },
  setup: { name: 'Patrol', tractorRangeMeters: 400, tractorCanManipulateObjects: false },
};
const direction = { x: 1, y: 0 };
const arena = { asteroids: [anchor], obstacles: [] };
assert.equal(physics.tractorAccelerationFactor(base, direction, arena), 1.2);
assert.equal(
  physics.tractorAccelerationFactor({ ...base, boostActive: false }, direction, arena),
  1
);
assert.equal(physics.tractorAccelerationFactor(base, direction, { asteroids: [] }), 1);
assert.equal(
  physics.tractorAccelerationFactor({ ...base, subsystems: { tractor: 0 } }, direction, arena),
  1
);

const source = {
  ...base,
  velocity: { x: 0, y: 0 },
  speed: 0,
  setup: { ...base.setup, shieldGeometry: { radiusX: 25, radiusY: 20 } },
};
const victim = {
  position: { x: 460, y: 300 },
  velocity: { x: 0, y: 0 },
  speed: 0,
  shieldHp: 0,
  setup: { shieldGeometry: { radiusX: 25, radiusY: 20 } },
};
const grapple = {
  success: true,
  resolved: true,
  ropeLength: 280,
  tension: 0,
  tractorAssisted: false,
};
const tether = grapplePhysics.advanceCombatGrappleTether(grapple, source, victim, 0.08);
assert.equal(tether.tractorAssisted, true, 'all ship classes can accelerate boarding by tractor');
assert(tether.ropeLength < grapple.ropeLength, 'tractor winch reels in faster');

const rock = { ...anchor, radius: 12, position: { x: 260, y: 300 } };
const enemy = {
  position: { x: 650, y: 300 },
  velocity: { x: 0, y: 0 },
  hullHp: 150,
  shieldHp: 100,
};
const runtime = {
  arena: { asteroids: [rock], obstacles: [] },
  mines: [],
  thrownAsteroids: [],
  elapsedSeconds: 0,
  combatLog: [],
  impactSerial: 0,
};
const civilian = {
  ...base,
  tactic: 'fight',
  setup: { ...base.setup, tractorCanManipulateObjects: false },
};
throwLogic.maybeLaunchTractorAsteroid(runtime, 'attacker', civilian, enemy);
assert.equal(runtime.thrownAsteroids.length, 0, 'patrol/freighter cannot throw rocks');
assert.equal(runtime.arena.asteroids.length, 1, 'ordinary boarding tractor never consumes rock');
const industrial = {
  ...civilian,
  setup: { ...civilian.setup, tractorCanManipulateObjects: true },
};
throwLogic.maybeLaunchTractorAsteroid(runtime, 'attacker', industrial, enemy);
assert.equal(runtime.thrownAsteroids.length, 1, 'miner/salvager can manipulate rocks');
assert.equal(runtime.arena.asteroids.length, 0, 'captured industrial projectile leaves world');

console.log(
  'PASS 28 shared ship-class loadouts, tractor anchor, boarding and industrial-only throws'
);
