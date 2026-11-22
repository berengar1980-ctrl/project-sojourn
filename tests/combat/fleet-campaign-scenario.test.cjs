'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createFleetScenarioRoster } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/start/fleet-scenario-roster.ts'
);
const { createFleetScenarioRuntime } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/start/fleet-scenario-runtime.ts'
);

const groups = [
  { group: 'npc', initial: 1, joining: 2, afterSeconds: 5 },
  { group: 'pirates-yellow', initial: 1, joining: 1, afterSeconds: 10 },
  { group: 'pirates-red', initial: 0, joining: 1, afterSeconds: 12 },
  { group: 'drone', initial: 0, joining: 1, afterSeconds: 15 },
];
const generated = createFleetScenarioRoster(groups);
assert.equal(generated.length, 8);
assert.equal(generated.filter((ship) => ship.id === 'player').length, 1);
assert.equal(generated.find((ship) => ship.id === 'npc-2').arrivalSeconds, 5);
assert.equal(generated.find((ship) => ship.id === 'pirates-yellow-2').arrivalSeconds, 10);
assert.equal(generated.find((ship) => ship.id === 'pirates-red-1').arrivalSeconds, 12);
assert.equal(generated.find((ship) => ship.id === 'drone-1').arrivalSeconds, 15);
assert(
  generated
    .filter((ship) => ship.group === 'pirates-yellow' || ship.group === 'pirates-red')
    .every((ship) => ship.draft.shipId.startsWith('pirate-')),
  'both marked pirate groups use real campaign pirate hulls'
);

const commonDraft = {
  shipId: 'patrol-60m-variant-01',
  weapons: [],
  mines: [],
  crewId: generated[0].draft.crewId,
  reactorId: 'reactor4',
  shieldId: 'shield1',
  hullId: 'hull1',
};
const entry = (id, group, arrivalSeconds) => ({
  id,
  group,
  name: id,
  draft: commonDraft,
  arrivalSeconds,
});
const arena = { width: 4200, height: 2600, obstacles: [], asteroids: [] };

// Six-sided hostility can evolve without starting another battle or ticking
// a target a second time.
const roster = [
  entry('player', 'player', 0),
  entry('npc-1', 'npc', 0),
  entry('pirates-yellow-1', 'pirates-yellow', 0),
  entry('pirates-red-1', 'pirates-red', 0),
  entry('drone-1', 'drone', 0.16),
];
const scenario = createFleetScenarioRuntime(roster, arena, 1234, 'none');
const originalFleet = scenario.fleet;
assert(originalFleet, 'pirate sighting starts a live encounter on the common map');
assert.equal(scenario.arrivedCount, 4);
assert.equal(originalFleet.getActor('drone-1'), null);
const playerActor = originalFleet.getActor('player');
assert(playerActor);
assert.equal(originalFleet.getActor('pirates-yellow-1').setup.pirateMark, 'broken-spear');
assert.equal(originalFleet.getActor('pirates-red-1').setup.pirateMark, 'black-tide');
scenario.tick(0.08);
scenario.tick(0.08);
assert.equal(scenario.fleet, originalFleet, 'reinforcements keep the same native combat');
assert(originalFleet.getActor('drone-1'), 'security drone joins at its scheduled time');
assert.equal(originalFleet.getActor('player'), playerActor, 'the player is never recreated');
assert.equal(scenario.nextArrivalSeconds(), null);
assert.equal(scenario.arrivedCount, 5);
assert.equal(originalFleet.duels.length, 1);
assert.equal(originalFleet.supporters.length, 3);

// A neutral player and a civilian are not forced into a duel until a pirate
// arrives. Their actor identities are then unique on the same battlefield.
const delayed = createFleetScenarioRuntime(
  [
    entry('player', 'player', 0),
    entry('npc-1', 'npc', 0),
    entry('pirates-yellow-1', 'pirates-yellow', 0.16),
  ],
  arena,
  5678,
  'none'
);
assert.equal(delayed.fleet, null);
delayed.tick(0.08);
assert.equal(delayed.fleet, null);
delayed.tick(0.08);
assert(delayed.fleet);
assert(delayed.fleet.getActor('player'));
assert(delayed.fleet.getActor('npc-1'));

// In the player-attacks-NPC scenario the observing drone can engage the
// attacker without changing its permanent anti-pirate policy.
const defenderScenario = createFleetScenarioRuntime(
  [entry('player', 'player', 0), entry('npc-1', 'npc', 0), entry('drone-1', 'drone', 0)],
  arena,
  9012,
  'player-attacks-npc'
);
assert(defenderScenario.fleet);
assert(defenderScenario.fleet.getActor('drone-1'));
assert.equal(defenderScenario.fleet.getSnapshot().finished, false);
console.log('PASS FleetCombat lab: fixed player, markings, timed same-map joins and drone defence');
