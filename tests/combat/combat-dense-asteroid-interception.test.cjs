'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { combatRouteHeading } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-asteroid-routing.ts'
);
const { chooseCombatFlightIntent } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-flight-intent.ts'
);
const { moveCombatant } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-movement.ts'
);
const { createCombatant } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);
const rail = SHIP_COMPONENT_CATALOG.weapon.find((weapon) => weapon.id === 'weapon-railgun-1');
assert(rail, 'railgun fixture exists');

const obstacles = [
  { id: 'a', position: { x: 1270, y: 870 }, radius: 110 },
  { id: 'b', position: { x: 1270, y: 1150 }, radius: 105 },
  { id: 'c', position: { x: 1530, y: 1020 }, radius: 125 },
  { id: 'd', position: { x: 1820, y: 840 }, radius: 110 },
  { id: 'e', position: { x: 1830, y: 1190 }, radius: 115 },
  { id: 'f', position: { x: 2110, y: 1010 }, radius: 95 },
  { id: 'g', position: { x: 1500, y: 1470 }, radius: 110 },
  { id: 'h', position: { x: 1750, y: 1510 }, radius: 80 },
  { id: 'i', position: { x: 1600, y: 580 }, radius: 100 },
  { id: 'j', position: { x: 1920, y: 560 }, radius: 90 },
];
const arena = {
  width: 3400,
  height: 2200,
  attackerPosition: { x: 650, y: 1050 },
  defenderPosition: { x: 2750, y: 1050 },
  obstacles,
};

const routeShip = {
  position: { x: 650, y: 1050 },
  velocity: { x: 0, y: 0 },
  tactic: 'fight',
  setup: { shieldGeometry: { radiusX: 40, radiusY: 40 } },
  asteroidRoute: [],
  nextAsteroidRouteAt: 0,
};
const target = arena.defenderPosition;
const first = combatRouteHeading(routeShip, target, arena, 0.08);
assert(first, 'obstructed approach gets an asteroid detour');
assert.deepEqual(routeShip.asteroidRoute.at(-1), target, 'route targets the enemy');
const waypoint = { ...routeShip.asteroidRoute[0] };
for (let tick = 0; tick < 35; tick += 1) {
  combatRouteHeading(routeShip, target, arena, 0.08);
}
assert.deepEqual(
  routeShip.asteroidRoute[0],
  waypoint,
  'unchanged asteroid flank remains committed beyond the former 750 ms refresh'
);

// A front-gun combatant inside nominal range must close for a genuine
// attack passage, not enter a permanent tangent orbit around its own position.
const forwardPilot = {
  position: { x: 650, y: 1050 },
  velocity: { x: 0, y: 0 },
  headingRadians: 0,
  tactic: 'fight',
  strategy: { kind: 'frontal', focus: 'forward', desiredRange: 1280 },
  subsystems: { engine: 100 },
  setup: {
    combatSpeed: 125,
    weapons: [rail, rail],
    weaponMounts: [
      { slotIndex: 0, x: 26, y: -10, facing: 'forward', arcDegrees: 60 },
      { slotIndex: 1, x: 26, y: 10, facing: 'forward', arcDegrees: 60 },
    ],
  },
};
const targetPilot = {
  position: { x: 1650, y: 1050 },
  velocity: { x: 0, y: 0 },
  shieldHp: 0,
  tactic: 'fight',
};
const frontalApproach = chooseCombatFlightIntent(
  forwardPilot,
  targetPilot,
  1280,
  arena,
  0.08,
  false
);
assert(
  frontalApproach.direction.x > 0.8,
  'front guns must close through asteroids instead of orbiting inside nominal gun range'
);
const blockedOrbit = chooseCombatFlightIntent(
  { ...forwardPilot, strategy: { kind: 'skirmish', focus: 'turret', desiredRange: 1280 } },
  targetPilot,
  1280,
  arena,
  0.08,
  false
);
assert(
  blockedOrbit.direction.x > 0.8,
  'even 360-degree weapons must approach if asteroids block their firing lane'
);
const passing = {
  ...forwardPilot,
  velocity: { x: 100, y: 0 },
  flightPass: undefined,
};
const passIntent = chooseCombatFlightIntent(
  passing,
  targetPilot,
  1280,
  { ...arena, obstacles: [] },
  0.08,
  false
);
assert.equal(passIntent.kind, 'pass', 'front-gun passage starts after a real intercept');
const passDestination = { ...passing.flightPass.destination };
passing.position = { x: 725, y: 1050 };
chooseCombatFlightIntent(passing, targetPilot, 1280, { ...arena, obstacles: [] }, 0.08, false);
assert.deepEqual(
  passing.flightPass.destination,
  passDestination,
  'a committed pass owns a fixed destination'
);

// A nearby asteroid's radial avoidance must never reverse an established
// waypoint; the ship's actual initial thrust must follow the committed flank.
const steeringArena = {
  width: 3400,
  height: 2200,
  attackerPosition: { x: 1100, y: 1170 },
  defenderPosition: { x: 2700, y: 1050 },
  obstacles: [{ id: 'nearby', position: { x: 1270, y: 1150 }, radius: 105 }],
};
const steeringSetup = (id) => ({
  id,
  name: id,
  shipId: 'patrol-60m-variant-01',
  shieldHp: 100,
  hullHp: 900,
  weapons: [rail, rail],
  weaponMounts: [
    { slotIndex: 0, x: 26, y: -10, facing: 'forward', arcDegrees: 60 },
    { slotIndex: 1, x: 26, y: 10, facing: 'forward', arcDegrees: 60 },
  ],
  hitChance: 0.95,
  dodgeChance: 0,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  combatSpeed: 125,
  turnRateRadiansPerSecond: 1,
  accelerationMetersPerSecond2: 36,
});
const steeringShip = createCombatant(steeringSetup('steering'), 'attacker', steeringArena);
const steeringTarget = createCombatant(steeringSetup('target'), 'defender', steeringArena);
steeringShip.strategy = {
  kind: 'frontal',
  focus: 'forward',
  desiredRange: 1280,
  score: 1,
  reason: 'track the target while clearing an asteroid',
};
const detour = combatRouteHeading(steeringShip, steeringTarget.position, steeringArena, 0.08);
assert(detour, 'nearby asteroid must produce a navigable flank');
moveCombatant(steeringShip, steeringTarget, 'attacker', 0.08, steeringArena, []);
const thrust = Math.hypot(steeringShip.velocity.x, steeringShip.velocity.y);
const committedProgress =
  (steeringShip.velocity.x * detour.x + steeringShip.velocity.y * detour.y) /
  Math.max(0.001, thrust);
assert(
  committedProgress > 0.7,
  'radial asteroid repulsion must not overpower the already chosen safe detour'
);

function ship(id) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 0,
    hullHp: 1800,
    weapons: [rail, rail],
    weaponMounts: [
      { slotIndex: 0, x: 26, y: -10, facing: 'forward', arcDegrees: 60 },
      { slotIndex: 1, x: 26, y: 10, facing: 'forward', arcDegrees: 60 },
    ],
    hitChance: 0.98,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 125,
    accelerationMetersPerSecond2: 36,
    turnRateRadiansPerSecond: 1,
    aiControlled: true,
    aiAggression: 92,
  };
}
const fight = createStrategicCombatService(ship('left'), ship('right'), 3041, arena);
let snapshot = fight.getSnapshot();
const openingRange = Math.hypot(
  snapshot.attacker.position.x - snapshot.defender.position.x,
  snapshot.attacker.position.y - snapshot.defender.position.y
);
let closest = openingRange;
let postOpeningRailHits = 0;
let lastSerial = 0;
for (let tick = 0; tick < 1200 && !snapshot.winner; tick += 1) {
  snapshot = fight.tick(0.08);
  const separation = Math.hypot(
    snapshot.attacker.position.x - snapshot.defender.position.x,
    snapshot.attacker.position.y - snapshot.defender.position.y
  );
  closest = Math.min(closest, separation);
  const unseen = snapshot.recentImpacts.filter((hit) => hit.serial > lastSerial);
  lastSerial = Math.max(lastSerial, ...unseen.map((hit) => hit.serial));
  if (snapshot.elapsedSeconds > 10) {
    postOpeningRailHits += unseen.filter(
      (hit) => hit.weaponFamily === 'railgun' && hit.layer === 'hull'
    ).length;
  }
}
assert(
  closest < openingRange * 0.75,
  'ships should penetrate the dense asteroid cluster, not circle in separate local orbits'
);
assert(
  postOpeningRailHits >= 2,
  'railguns must deliver follow-up shots, not only the initial frontal salvo'
);
console.log('PASS stable asteroid flank, dense-field interception and repeat railgun salvos');
