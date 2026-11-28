'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { performCombatThrust } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-movement.ts'
);
const { advanceAutopilotRoute } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/local-space-autopilot.ts'
);

const flightPerformance = {
  combatSpeed: 120,
  accelerationMetersPerSecond2: 30,
  turnRateRadiansPerSecond: 0.6,
};
const dt = 0.08;

function createCombatant(headingRadians, velocity) {
  return {
    id: 'combatant',
    name: 'combatant',
    position: { x: 10_000, y: 10_000 },
    velocity: { ...velocity },
    headingRadians,
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    lateralThrust: 0,
    longitudinalThrust: 0,
    boostActive: false,
    boostRampSeconds: 0,
    shieldHp: 100,
    hullHp: 100,
    subsystems: { engine: 100, tractor: 0 },
    setup: {
      id: 'parity-hull',
      combatSpeed: flightPerformance.combatSpeed,
      accelerationMetersPerSecond2: flightPerformance.accelerationMetersPerSecond2,
      turnRateRadiansPerSecond: flightPerformance.turnRateRadiansPerSecond,
      tractorRangeMeters: 0,
      weapons: [],
      weaponMounts: [],
    },
  };
}

function createLocalShip(headingRadians, velocity) {
  return {
    position: { x: 10_000, y: 10_000 },
    velocity: { ...velocity },
    headingRadians,
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    lateralThrust: 0,
    longitudinalThrust: 0,
    get speed() {
      return Math.hypot(this.velocity.x, this.velocity.y);
    },
  };
}

function assertClose(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-5, `${label}: ${actual} != ${expected}`);
}

function compareFlight({
  headingRadians,
  speedFactor,
  initialVelocity,
  steps,
  initialPosition = { x: 10_000, y: 10_000 },
  bounds,
}) {
  const arena = {
    width: bounds?.right ?? 1_000_000_000,
    height: bounds?.bottom ?? 1_000_000_000,
    useFieldBounds: true,
  };
  const combatant = createCombatant(headingRadians, initialVelocity);
  combatant.position = { ...initialPosition };
  const enemy = {
    position: { x: 10_000, y: 10_000 },
    velocity: { x: 0, y: 0 },
    headingRadians: 0,
    shieldHp: 100,
    hullHp: 100,
    powerFault: undefined,
    subsystems: { engine: 100, tractor: 0 },
    setup: { tractorRangeMeters: 0 },
  };
  const localShip = createLocalShip(headingRadians, initialVelocity);
  localShip.position = { ...initialPosition };
  const route = [
    {
      x: localShip.position.x + Math.cos(headingRadians) * 1_000_000,
      y: localShip.position.y + Math.sin(headingRadians) * 1_000_000,
    },
  ];

  for (let frame = 0; frame < steps; frame += 1) {
    performCombatThrust(
      combatant,
      enemy,
      dt,
      arena,
      { x: Math.cos(headingRadians), y: Math.sin(headingRadians) },
      speedFactor
    );
    advanceAutopilotRoute(
      localShip,
      route,
      0,
      flightPerformance.combatSpeed * speedFactor,
      dt,
      false,
      false,
      1,
      undefined,
      flightPerformance,
      bounds
    );

    for (const axis of ['x', 'y']) {
      assertClose(localShip.position[axis], combatant.position[axis], `position.${axis}`);
      assertClose(localShip.velocity[axis], combatant.velocity[axis], `velocity.${axis}`);
    }
    assertClose(localShip.headingRadians, combatant.headingRadians, 'heading');
    assertClose(
      localShip.turnRateRadiansPerSecond,
      combatant.turnRateRadiansPerSecond,
      'turn rate'
    );
  }
}

compareFlight({
  headingRadians: 0,
  speedFactor: 1,
  initialVelocity: { x: 0, y: 0 },
  steps: 50,
});
compareFlight({
  headingRadians: Math.PI / 2,
  speedFactor: 1,
  initialVelocity: { x: 0, y: 0 },
  steps: 25,
});
compareFlight({
  headingRadians: 0,
  speedFactor: 0.25,
  initialVelocity: { x: 80, y: 0 },
  steps: 35,
});
compareFlight({
  headingRadians: 0,
  speedFactor: 1,
  initialVelocity: { x: 20, y: 0 },
  initialPosition: { x: 999.5, y: 500 },
  bounds: { left: 0, top: 0, right: 1000, bottom: 1000 },
  steps: 5,
});

const rcsShip = createLocalShip(0, { x: 0, y: 0 });
rcsShip.position = { x: 500, y: 500 };
advanceAutopilotRoute(
  rcsShip,
  [{ x: 500, y: 600 }],
  0,
  100,
  dt,
  true,
  false,
  1,
  undefined,
  flightPerformance,
  { left: 0, top: 0, right: 1000, bottom: 1000 }
);
assert(rcsShip.lateralThrust > 0.9, 'RCS indicator must report the active lateral command');
assert(rcsShip.velocity.y > 0, 'RCS command must produce lateral movement');

const reverseShip = createLocalShip(0, { x: 0, y: 0 });
reverseShip.position = { x: 500, y: 500 };
advanceAutopilotRoute(
  reverseShip,
  [{ x: 490, y: 500 }],
  0,
  100,
  dt,
  true,
  true,
  1,
  undefined,
  flightPerformance,
  { left: 0, top: 0, right: 1000, bottom: 1000 }
);
assert(reverseShip.longitudinalThrust < 0, 'reverse correction must command reverse thrust');
assert(reverseShip.velocity.x < 0, 'reverse correction must move toward the close rear waypoint');

console.log('PASS PvP and local autopilot share acceleration, turn and braking trajectories');
