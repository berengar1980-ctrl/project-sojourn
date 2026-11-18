'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { LocalPirateTraffic } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-local-pirate-service.ts'
);

function pirateArrivesOnlyAfterSectorArrival() {
  const traffic = new LocalPirateTraffic(1100, 900, 77);
  const pirate = {
    id: 'pirate-01',
    name: 'Raider',
    shipId: 'pirate-raider-60m',
    pirate: true,
    locationId: 'greyrock-belt',
    hullHp: 100,
  };
  traffic.reconcile([{ ...pirate, travel: { targetLocationId: 'greyrock-belt' } }]);
  assert.equal(
    traffic.snapshot([pirate]).length,
    0,
    'Ship in transit must not spawn in local field'
  );
  traffic.reconcile([pirate]);
  assert.equal(traffic.snapshot([pirate]).length, 1);
  let battles = 0;
  const origin = traffic.snapshot([pirate])[0].position;
  traffic.tick(
    0.25,
    [pirate],
    { x: origin.x + 120, y: origin.y },
    [],
    [],
    (pirateId, defenderId) => {
      battles++;
      assert.equal(pirateId, 'pirate-01');
      assert.equal(defenderId, 'player');
      return true;
    }
  );
  assert.equal(battles, 1);
  traffic.tick(0.25, [pirate], { x: origin.x + 120, y: origin.y }, [], [], () => {
    throw new Error('Same fight must not launch twice');
  });
  traffic.reconcile([{ ...pirate, combatMovement: { mode: 'engaged' } }]);
  assert.equal(
    traffic.snapshot([pirate]).length,
    1,
    'Player duel defender must remain visible in its local field'
  );
}

function asteroidCollisionPrevention() {
  const pirate = {
    id: 'pirate-02',
    name: 'Raider 2',
    shipId: 'pirate-raider-60m',
    pirate: true,
    locationId: 'greyrock-belt',
    hullHp: 100,
  };
  const traffic = new LocalPirateTraffic(1600, 1200, 77);
  traffic.reconcile([pirate]);
  const initial = traffic.snapshot([pirate])[0].position;
  const asteroid = {
    kind: 'resource',
    id: 'rock',
    routeBlocking: true,
    position: { x: initial.x + 95, y: initial.y },
    radius: 60,
  };
  for (let i = 0; i < 200; i++) {
    traffic.tick(0.25, [pirate], { x: initial.x + 650, y: initial.y }, [], [asteroid], () => false);
    const p = traffic.snapshot([pirate])[0].position;
    assert(
      Math.hypot(p.x - asteroid.position.x, p.y - asteroid.position.y) >= asteroid.radius + 34.9,
      'Raider must not penetrate solid asteroid'
    );
  }
}
function absentPlayerUsesRealMinerTarget() {
  const traffic = new LocalPirateTraffic(1100, 900, 77);
  const pirate = {
    id: 'pirate-away',
    name: 'Away Raider',
    shipId: 'pirate-raider-60m',
    pirate: true,
    locationId: 'greyrock-belt',
    hullHp: 100,
  };
  traffic.reconcile([pirate]);
  const origin = traffic.snapshot([pirate])[0].position;
  const miner = { npcId: 'miner-away', position: { x: origin.x + 120, y: origin.y } };
  let target = null;
  traffic.tick(0.25, [pirate], null, [miner], [], (_, id) => {
    target = id;
    return true;
  });
  assert.equal(target, 'miner-away', 'Distant pirate cannot attack an absent player');
  traffic.reconcile([{ ...pirate, combatMovement: { mode: 'engaged' } }]);
  assert.equal(traffic.snapshot([pirate]).length, 1, 'background fights retain local contacts');
  traffic.reconcile([pirate]);
  assert.deepEqual(
    traffic.snapshot([pirate])[0].position,
    origin,
    'A returning pirate must not respawn at the edge after combat'
  );
}

pirateArrivesOnlyAfterSectorArrival();
absentPlayerUsesRealMinerTarget();
asteroidCollisionPrevention();
