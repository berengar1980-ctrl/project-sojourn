'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const priorityPath = 'src/systems/navigation/field-traffic-priority.ts';
const trafficPath = 'src/systems/navigation/field-traffic-obstacles.ts';
const priority = loadStandaloneTypeScriptModule(root, priorityPath);
const traffic = loadStandaloneTypeScriptModule(root, trafficPath, { [priorityPath]: priority });
const { moveFieldShip } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/field-ship-routing.ts',
  { [priorityPath]: priority, [trafficPath]: traffic }
);
const bounds = { width: 1200, height: 1200 };

function crossing(legs, reverse = false) {
  const ships = legs.map(([start, target], index) => ({
    npcId: 'ship-' + index,
    position: { x: start[0], y: start[1] },
    headingRadians: 0,
    speed: 0,
    target: { x: target[0], y: target[1] },
    arrived: false,
  }));
  const order = reverse ? [...ships].reverse() : ships;
  for (const ship of ships) {
    priority.registerTrafficPose(ship, ship.npcId, false, bounds);
    priority.beginTrafficLeg(ship, ship.target);
  }
  for (let step = 0; step < 900 && ships.some((ship) => !ship.arrived); step++) {
    for (const ship of order) {
      if (ship.arrived) continue;
      const obstacles = ships
        .filter((other) => other !== ship)
        .map((other) => ({
          id: other.npcId,
          position: { ...other.position },
          radius: 25,
          velocity: {
            x: Math.cos(other.headingRadians) * other.speed,
            y: Math.sin(other.headingRadians) * other.speed,
          },
          intent: priority.trafficIntent(other, other.npcId),
        }));
      const before = { ...ship.position };
      ship.arrived = moveFieldShip(ship, ship.target, 100, 0.1, obstacles, 25, 'patrol');
      assert(Math.hypot(ship.position.x - before.x, ship.position.y - before.y) <= 10.001);
      assert(Number.isFinite(ship.position.x) && Number.isFinite(ship.position.y));
      assert(ship.position.x >= 0 && ship.position.x <= bounds.width);
      assert(ship.position.y >= 0 && ship.position.y <= bounds.height);
    }
  }
  assert(
    ships.every((ship) => ship.arrived),
    'crossing ships must finish within 90 seconds: ' + JSON.stringify(ships)
  );
}

const fourWay = [
  [[160, 580], [1040, 580]],
  [[1040, 620], [160, 620]],
  [[620, 160], [620, 1040]],
  [[580, 1040], [580, 160]],
];
const headOn = [
  [[200, 580], [1000, 580]],
  [[1000, 620], [200, 620]],
];
crossing(headOn);
crossing(headOn, true);
crossing(fourWay);
crossing(fourWay, true);
console.log('PASS crossing traffic makes bounded progress in both scheduler orders');
