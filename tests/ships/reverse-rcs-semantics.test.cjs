'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const thrusters = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-maneuver-thrusters.ts'
);

const hardpoints = {
  sourceWidth: 400,
  sourceHeight: 200,
  pivot: { x: 200, y: 100 },
  engines: [],
  weaponLasers: [],
  miningLasers: [],
  tractorBeams: [],
  maneuverThrusters: [
    { id: 'rcs-bow-upper', x: 300, y: 50, width: 7, forceX: 0, forceY: 1 },
    { id: 'rcs-bow-lower', x: 300, y: 150, width: 7, forceX: 0, forceY: -1 },
    { id: 'rcs-stern-upper', x: 100, y: 50, width: 7, forceX: 0, forceY: 1 },
    { id: 'rcs-stern-lower', x: 100, y: 150, width: 7, forceX: 0, forceY: -1 },
    { id: 'rcs-front-upper', x: 390, y: 80, width: 7, forceX: -1, forceY: 0 },
    { id: 'rcs-front-lower', x: 390, y: 120, width: 7, forceX: -1, forceY: 0 },
  ],
  shield: {
    centerX: 200,
    centerY: 100,
    radiusX: 210,
    radiusY: 110,
    maxHp: 100,
    modifier: 1,
  },
};

const reverseDemand = thrusters.longitudinalManeuverDemand(-18);
assert.equal(reverseDemand, -1);

const reverse = thrusters.activeManeuverThrusterBursts(
  hardpoints,
  {
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    lateralThrust: 0,
    longitudinalThrust: reverseDemand,
  },
  0
);
assert.deepEqual(
  reverse.map((entry) => entry.id).sort(),
  ['rcs-front-lower', 'rcs-front-upper'],
  'reverse correction must fire the forward-facing axial RCS pair'
);

const turn = thrusters.activeManeuverThrusterBursts(
  hardpoints,
  {
    turnRateRadiansPerSecond: 0,
    angularThrust: 1,
    lateralThrust: 0,
    longitudinalThrust: 0,
  },
  0
);
assert(
  turn.some((entry) => entry.id.startsWith('rcs-bow-') || entry.id.startsWith('rcs-stern-')),
  'turning must use lateral maneuver thrusters'
);
assert(
  turn.every((entry) => !entry.id.startsWith('rcs-front-')),
  'axial front RCS must not be recruited for ordinary turning'
);

const forward = thrusters.activeManeuverThrusterBursts(
  hardpoints,
  {
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    lateralThrust: 0,
    longitudinalThrust: thrusters.longitudinalManeuverDemand(50),
  },
  0
);
assert.equal(forward.length, 0, 'forward flight must not fire reverse-only front RCS');

console.log('PASS reverse-only front RCS and turn-only lateral RCS semantics');
