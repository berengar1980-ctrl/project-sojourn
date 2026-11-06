'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { createNpcSectorService } = load('src/systems/npcs/npc-sector-service.ts');
const ai = load('src/systems/npcs/npc-combat-ai.ts');

const captains = createSectorNpcEconomyStates().slice(0, 9);
const service = createNpcSectorService(narrowsSector, captains);
const neighboringPlaces = ['haven', 'meridian-exchange', 'haven-moon'];

for (const locationId of neighboringPlaces) {
  const owner = narrowsSector.locations.find((location) => location.id === locationId);
  assert(owner);
  const { npcOrbitDestination } = load('src/systems/npcs/npc-orbit.ts');
  const positions = captains.map((npc) =>
    npcOrbitDestination(narrowsSector, npc, locationId)
  );
  assert(positions.every((position) => position && Number.isFinite(position.x) && Number.isFinite(position.y)));
  const unique = new Set(positions.map((point) => point.x.toFixed(3) + ':' + point.y.toFixed(3)));
  assert.equal(unique.size, captains.length, 'every captain needs a distinct holding berth');
  for (const position of positions) {
    assert(
      Math.hypot(position.x - owner.position.x, position.y - owner.position.y) > owner.radius,
      'no ship belongs on its target planet or station'
    );
    for (const neighborId of neighboringPlaces) {
      if (neighborId === locationId) continue;
      const neighbor = narrowsSector.locations.find((location) => location.id === neighborId);
      assert(neighbor);
      assert(
        Math.hypot(position.x - neighbor.position.x, position.y - neighbor.position.y) >
          neighbor.radius + 16,
        'holding berth must not overlap nearby moons or stations'
      );
    }
  }
}

const freighter = captains.find((entry) => entry.job === 'freighter');
const pirate = createSectorNpcEconomyStates().find((entry) => entry.pirate);
assert(freighter && pirate);
freighter.aggression = 99;
assert.equal(
  ai.npcLooksHostileToPatrol(freighter),
  false,
  'civilian personality aggression must not trigger automatic patrol attacks'
);
assert.equal(ai.npcLooksHostileToPatrol(pirate), true);

console.log('PASS neighboring planet/moon/station berths and civilian patrol targeting');
