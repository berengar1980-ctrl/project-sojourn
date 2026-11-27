'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const routePath = 'src/systems/navigation/field-ship-routing.ts';
const routing = loadStandaloneTypeScriptModule(root, routePath);
const calls = [];
const { LocalPirateTraffic } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-local-pirate-service.ts',
  {
    [routePath]: {
      ...routing,
      moveFieldShip(ship, target, speed, dt, obstacles) {
        calls.push({ id: ship.npcId, obstacles });
        return false;
      },
    },
  }
);

const cases = [
  { id: 'freighter', job: 'freighter' },
  { id: 'patrol', job: 'patrol' },
  { id: 'security-drone:field:escort-1', job: 'patrol' },
  { id: 'pirate', job: 'pirate', pirate: true },
];
for (const role of cases) {
  const npc = {
    ...role,
    name: role.id,
    shipId: 'patrol-60m-variant-01',
    hullHp: 100,
    locationId: 'field',
  };
  const traffic = new LocalPirateTraffic(2000, 1400, 19);
  traffic.reconcile([npc]);
  const start = traffic.body(npc.id).position;
  const player = { x: start.x + 650, y: start.y };
  const neutral = { id: 'neutral-worker', position: { x: 500, y: 500 }, radius: 75 };
  const prey = { id: 'player', position: player, radius: 40 };
  calls.length = 0;
  traffic.tick(
    0.2,
    [npc],
    player,
    [],
    [],
    () => false,
    undefined,
    undefined,
    (id) => {
      assert.equal(id, npc.id);
      return [neutral, prey];
    }
  );
  assert(calls.length > 0, role.id + ' must use the common route planner');
  assert(calls.every((call) => call.obstacles.includes(neutral)), role.id + ' must see workers');
  assert(
    calls.every((call) => call.obstacles.includes(prey) === !role.pirate),
    role.id + ' must preserve intentional interception'
  );
}

console.log('PASS freighter, patrol, escort and pirate use live field route obstacles');
