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
const shipDefinitions = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-registry.ts'
);
for (let pass = 0; pass < 50; pass += 1) {
  const civilians = createFleetScenarioRoster([
    { group: 'npc', initial: 10, joining: 10, afterSeconds: 5 },
  ]).filter((ship) => ship.group === 'npc');
  assert.equal(civilians.length, 20);
  assert(
    civilians.every((ship) => !ship.draft.shipId.startsWith('pirate-')),
    'civilian NPC roster must never spawn pirate hulls, even if the random catalog offers them'
  );
  assert(
    civilians.every((ship) => !ship.name.toLowerCase().includes('korsaren')),
    'civilian display names must not claim to be pirates'
  );
}
assert.equal(generated.length, 8);
assert.equal(generated.filter((ship) => ship.id === 'player').length, 1);
assert.equal(generated.find((ship) => ship.id === 'npc-2').arrivalSeconds, 5);
assert.equal(generated.find((ship) => ship.id === 'pirates-yellow-2').arrivalSeconds, 10);
assert.equal(generated.find((ship) => ship.id === 'pirates-red-1').arrivalSeconds, 12);
const testDrone = generated.find((ship) => ship.id === 'security-drone:test-1');
assert.equal(testDrone.arrivalSeconds, 15);
const { getShipComponent } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-service.ts'
);
assert(testDrone.draft.weapons.some(Boolean), 'security drone needs working guns');
assert(
  testDrone.draft.weapons.filter(Boolean).every((id) => getShipComponent('weapon', id)?.tier === 3),
  'FleetCombat security drones must use actual Mk III weapons'
);
assert.equal(testDrone.draft.hullId, 'hull3');
assert.equal(testDrone.draft.shieldId, 'shield3');
assert(testDrone.draft.reactorId.includes('reactor3'), 'security drones need Mk III power');
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

// All three modes now use the existing campaign services for neutral world
// behavior; a scheduled reinforcement no longer materializes as an immediate
// gunner in FleetCombat unless it sees and elects to join the conflict.
const aggressivePirate = (id, group, arrivalSeconds) => ({
  ...entry(id, group, arrivalSeconds),
  draft: { ...commonDraft, shipId: 'pirate-marauder-120m' },
});
const roster = [
  entry('player', 'player', 0),
  entry('npc-1', 'npc', 0),
  aggressivePirate('pirates-yellow-1', 'pirates-yellow', 0),
  aggressivePirate('pirates-red-1', 'pirates-red', 0),
  entry('security-drone:test-1', 'drone', 0.16),
];
const scenario = createFleetScenarioRuntime(roster, arena, 1234, 'none', 'empty');
const firstFleet = scenario.fleet;
assert(firstFleet, 'a live pirate contact starts the common native fleet engine');
assert.equal(scenario.arrivedCount, 4);
const actorsAtStart = [
  ...firstFleet.duels.flatMap((service) => [
    service.getParallelActor('attacker'),
    service.getParallelActor('defender'),
  ]),
  ...firstFleet.supporters.map((service) => service.getParallelActor('attacker')),
];
assert.equal(new Set(actorsAtStart).size, actorsAtStart.length);
const playerActor = firstFleet.getActor('player');
assert(playerActor, 'player participates when targeted by an arriving pirate');
const originalPlayerPosition = { ...playerActor.position };
scenario.tick(0.08);
scenario.tick(0.08);
assert.equal(scenario.fleet, firstFleet, 'the same combat instance survives world arrivals');
assert.equal(firstFleet.getActor('player'), playerActor, 'player physical actor never replaced');
assert.equal(scenario.arrivedCount, 5);
assert.equal(scenario.nextArrivalSeconds(), null);
assert(
  firstFleet.getActor('security-drone:test-1') ||
    scenario.worldContacts.some((contact) => contact.id === 'security-drone:test-1'),
  'the drone must exist in the world even if its sensors have not cleared an attack'
);
assert(Number.isFinite(playerActor.position.x) && Number.isFinite(playerActor.position.y));
assert(Number.isFinite(originalPlayerPosition.x));

// A neutral miner does not get converted into a combat AI merely because
// another vessel is fighting nearby. Its world movement is still simulated.
const ships = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');
const minerShip = ships.getAllShipDefinitions().find((ship) => ship.role === 'mining');
assert(minerShip, 'the campaign has a physical miner for this test');
const miner = { ...entry('npc-1', 'npc', 0), draft: { ...commonDraft, shipId: minerShip.id } };
const minerScenario = createFleetScenarioRuntime(
  [entry('player', 'player', 0), miner],
  arena,
  5678,
  'none',
  'empty'
);
assert.equal(minerScenario.fleet, null);
assert.equal(minerScenario.worldContacts.length, 2);
minerScenario.tick(0.08);
assert.equal(minerScenario.fleet, null, 'two non-hostile actors never start a fake 1v1');
assert(minerScenario.worldContacts.some((contact) => contact.id === 'npc-1'));

// A scenario incident starts a real duel, while security drones remain world
// contacts until they have actually detected the relevant hostile ship.
const defenderScenario = createFleetScenarioRuntime(
  [
    entry('player', 'player', 0),
    entry('npc-1', 'npc', 0),
    entry('security-drone:test-1', 'drone', 0),
  ],
  arena,
  9012,
  'player-attacks-npc',
  'empty'
);
assert(defenderScenario.fleet, 'explicit player attack starts native combat');
assert(
  defenderScenario.fleet.getActor('security-drone:test-1') ||
    defenderScenario.worldContacts.some((ship) => ship.id === 'security-drone:test-1'),
  'a protective drone is present, but only joins when its patrol senses the incident'
);
console.log(
  'PASS FleetCombat lab: fixed player, persistent native actors, true NPC world behavior and observed drone entry'
);
