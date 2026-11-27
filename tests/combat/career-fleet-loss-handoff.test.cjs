'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, 'src/systems/combat/' + name);
const { campaignHullPoints } = load('campaign-combat-hull.ts');
const { createNpcFleetEncounter } = load('career-fleet-encounter.ts');
const { reportFieldFleetLosses } = load('star-map-engagement-fleet-resolution.ts');
const { NativeFleetBoarding } = load('native-fleet-boarding.ts');
const { materializeNativeFleetWrecks } = load('native-fleet-wrecks.ts');

for (const hp of [0.01, 0.4, 0.49, 0.8, 1]) assert.equal(campaignHullPoints(hp, 100), 1);
assert.equal(campaignHullPoints(0, 100), 0);
assert.equal(campaignHullPoints(-1, 100), 0);
assert.equal(campaignHullPoints(100.4, 100), 100);

function npc(id, job) {
  return {
    id,
    name: id,
    job,
    shipId: 'patrol-60m-variant-01',
    pirate: job === 'pirate',
    pirateMark: job === 'pirate' ? 'black-tide' : undefined,
    aggression: 80,
    hullHp: 800,
    hullMaxHp: 800,
    installedComponents: { weapon: [] },
    locationId: 'haven',
    cargo: {},
    cargoCapacity: 50,
  };
}
for (const local of [false, true]) {
  const attacker = npc('pirate-a', 'pirate');
  const victim = npc('victim', 'miner');
  const patrol = npc('patrol-a', 'patrol');
  const roster = [attacker, victim, patrol];
  const arena = {
    width: 4200,
    height: 2600,
    obstacles: [],
    asteroids: [],
    ...(local ? { backdropSeed: 42 } : {}),
  };
  const encounter = createNpcFleetEncounter(attacker, victim, roster, arena);
  const position = () => ({ x: 100, y: 100 });
  encounter.joinNearby(position(), roster, position);
  assert(encounter.fleet.getActor(patrol.id));
  const emitted = [];
  const retired = [];
  const runtime = {
    options: {
      onFieldFleetLosses(_snapshot, losses, locationId) {
        assert.equal(locationId, 'haven');
        emitted.push(...losses.map((loss) => loss.id));
      },
      sectorNpcs: {
        recoverFromCombat(ship) {
          assert.equal(ship.hullHp, 0);
          retired.push(ship.id);
        },
      },
    },
  };
  encounter.fleet.getActor(victim.id).hullHp = 0.4;
  encounter.tick(0.08);
  assert(victim.hullHp > 0, 'fractional live hull is not a loss');
  reportFieldFleetLosses(runtime, encounter);
  assert.deepEqual(emitted, []);
  encounter.fleet.getActor(victim.id).hullHp = 0;
  encounter.tick(0.08);
  reportFieldFleetLosses(runtime, encounter);
  assert.deepEqual(emitted, [victim.id]);
  assert.equal(encounter.members.has(victim.id), false);
  victim.replacementGeneration = 1;
  victim.hullHp = 800;
  encounter.fleet.getActor(attacker.id).hullHp = 0;
  encounter.fleet.getActor(patrol.id).hullHp = 0;
  encounter.tick(0.08);
  reportFieldFleetLosses(runtime, encounter);
  reportFieldFleetLosses(runtime, encounter);
  assert.deepEqual(emitted.sort(), roster.map((ship) => ship.id).sort());
  assert.deepEqual(retired.sort(), emitted);
  assert.equal(victim.hullHp, 800, 'old actor cannot damage replacement generation');
  assert.equal(encounter.members.size, 0);
}

// A third party can destroy either coupled boarding participant. Both must die,
// and the actual native wreck materializer must emit two distinct hulls.
for (const destroyedSide of ['attacker', 'defender']) {
  const actors = {
    attacker: { setup: { id: 'boarder', aiControlled: true }, hullHp: 100 },
    defender: { setup: { id: 'target', aiControlled: true }, hullHp: 100 },
  };
  for (const actor of Object.values(actors)) {
    Object.assign(actor, {
      position: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 },
      headingRadians: 0,
    });
  }
  const status = { boardingInitiator: 'attacker', attackerId: 'boarder', defenderId: 'target' };
  const service = {
    getStatus: () => status,
    getParallelActor: (side) => actors[side],
    resolveNpcBoarding(bothDestroyed) {
      assert.equal(bothDestroyed, true);
      actors.attacker.hullHp = 0;
      actors.defender.hullHp = 0;
    },
    getSnapshot: () => actors,
  };
  const boarding = new NativeFleetBoarding();
  assert(boarding.start(service, status, 0));
  actors[destroyedSide].hullHp = 0;
  boarding.resolve(1, false);
  assert.equal(boarding.drainResults().length, 1);
  assert.equal(boarding.active, false);
  const wrecks = [];
  const recorded = new Set();
  materializeNativeFleetWrecks(Object.values(actors), wrecks, recorded, 1, 1);
  materializeNativeFleetWrecks(Object.values(actors), wrecks, recorded, 1, 2);
  assert.deepEqual(
    wrecks.map((wreck) => wreck.destroyedShipId).sort(),
    ['boarder', 'target']
  );
}
console.log('PASS career fleet destruction handoff, replacement isolation and boarding wreck pairs');
