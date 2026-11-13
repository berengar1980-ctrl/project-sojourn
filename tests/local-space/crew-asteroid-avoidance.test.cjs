'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const avoidance = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/local-space-hazard-avoidance.ts'
);
const asteroid = {
  id: 'crossing-rock',
  kind: 'resource',
  routeBlocking: true,
  position: { x: 380, y: 225 },
  radius: 30,
  physics: {
    velocity: { x: 0, y: 30 },
    angularVelocity: 0,
    mass: 100,
    momentOfInertia: 100,
    centerOfMassOffset: { x: 0, y: 0 },
  },
  deposits: [],
  scanLevel: 'unscanned',
  rotation: 0,
};
const ship = {
  position: { x: 100, y: 300 },
  headingRadians: 0,
  speed: 120,
  turnRateRadiansPerSecond: 0,
  angularThrust: 0,
  lateralThrust: 0,
};
const hazard = avoidance.findRouteAsteroidHazard(ship, { x: 800, y: 300 }, [asteroid], 24, 130);
assert(hazard, 'moving asteroid crossing the future route must be detected');
assert(hazard.timeToCrossing > 0);
assert.equal(
  avoidance.findRouteAsteroidHazard(ship, { x: 800, y: 300 }, [asteroid], 24, 130, asteroid.id),
  null,
  'deliberately approached mining target must not be treated as a navigation obstacle'
);
assert.equal(
  avoidance.findRouteAsteroidHazard(
    ship,
    { x: 800, y: 300 },
    [{ ...asteroid, physics: { ...asteroid.physics, velocity: { x: 0, y: -30 } } }],
    24,
    130
  ),
  null,
  'a rock moving away from the flight line is not an imminent collision'
);
const rookies = avoidance.asteroidAvoidanceOdds(10, 10, 3);
const veterans = avoidance.asteroidAvoidanceOdds(95, 95, 3);
assert(veterans.detect > rookies.detect && veterans.react > rookies.react);
assert(
  avoidance.crewAvoidsAsteroid(95, 95, 3, () => 0),
  'two successful checks allow rerouting'
);
assert.equal(
  avoidance.crewAvoidsAsteroid(0, 0, 1, () => 0.5),
  false
);
assert.equal(
  avoidance.crewAvoidsAsteroid(95, 95, 3, () => 0.99),
  false
);
console.log('PASS predictive hazards and independent helm/sensor chance checks');
