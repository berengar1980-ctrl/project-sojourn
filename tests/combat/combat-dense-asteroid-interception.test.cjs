'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { combatRouteHeading } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-asteroid-routing.ts'
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
