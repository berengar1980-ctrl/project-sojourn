'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { moveFieldShip, fieldRouteTarget } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/field-ship-routing.ts'
);

const rock = { id: 'solid-rock', position: { x: 500, y: 500 }, radius: 90 };
const target = { x: 940, y: 500 };
const ship = { position: { x: 80, y: 500 }, headingRadians: 0, speed: 0 };
const first = fieldRouteTarget(ship, target, [rock], 65);
assert.notDeepEqual(first, target, 'straight blocked route must avoid asteroid');
assert(
  Math.hypot(first.x - rock.position.x, first.y - rock.position.y) > rock.radius + 65,
  'waypoint must clear the solid asteroid'
);
assert.deepEqual(fieldRouteTarget(ship, target, [rock], 65), first);

let minimumDistance = Infinity;
let arrived = false;
for (let i = 0; i < 350; i += 1) {
  arrived = moveFieldShip(ship, target, 140, 0.08, [rock], 65);
  minimumDistance = Math.min(
    minimumDistance,
    Math.hypot(ship.position.x - rock.position.x, ship.position.y - rock.position.y)
  );
  if (arrived) break;
}
assert(arrived, 'ship must reach its work site after routing around solid obstacles');
assert(minimumDistance >= rock.radius + 50, 'route must not cut through solid asteroid');
assert.deepEqual(ship.position, target);

const direct = { position: { x: 80, y: 50 }, headingRadians: 0, speed: 0 };
assert.deepEqual(fieldRouteTarget(direct, { x: 940, y: 50 }, [rock], 65), {
  x: 940,
  y: 50,
});
console.log('PASS shared field routing avoids solid asteroids and reaches targets');
