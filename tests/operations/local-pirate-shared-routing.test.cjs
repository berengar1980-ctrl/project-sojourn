'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { LocalPirateTraffic } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-local-pirate-service.ts'
);

const pirate = {
  id: 'route-corsair',
  name: 'Corsair',
  shipId: 'pirate-raider-60m',
  pirate: true,
  locationId: 'test-field',
  hullHp: 100,
};
const rock = {
  id: 'blocking-rock',
  routeBlocking: true,
  position: { x: 500, y: 500 },
  radius: 100,
};
const npc = { npcId: 'civilian-miner', position: { x: 950, y: 500 } };
const traffic = new LocalPirateTraffic(1400, 1100, 31);
traffic.reconcile([pirate]);
traffic.syncCombatPose(pirate.id, { x: 80, y: 500 }, 0, { x: 0, y: 0 });

let intercepted = false;
let closest = Infinity;
for (let i = 0; i < 400; i += 1) {
  traffic.tick(0.08, [pirate], null, [npc], [rock], (_, target) => {
    assert.equal(target, npc.npcId);
    intercepted = true;
    return true;
  });
  const pose = traffic.snapshot([pirate])[0].position;
  closest = Math.min(closest, Math.hypot(pose.x - rock.position.x, pose.y - rock.position.y));
  if (i === 75) {
    const saved = traffic.exportState();
    const loaded = LocalPirateTraffic.fromCheckpoint(1400, 1100, 31, [pirate], saved);
    assert.deepEqual(loaded.exportState(), saved, 'A* waypoint progress must survive checkpoint');
  }
  if (intercepted) break;
}
assert(intercepted, 'shared A* should reach the miner after routing around rock');
assert(closest >= rock.radius + 34.9, 'corsair must never clip through solid asteroid');
console.log('PASS shared pirate field A* avoids asteroids and preserves checkpoint route');
