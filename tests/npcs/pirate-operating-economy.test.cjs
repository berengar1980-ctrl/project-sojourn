'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { pirateHuntDestination } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-sector-routing.ts'
);

function location(id, x, trade = false) {
  return {
    id,
    position: { x, y: 0 },
    activities: { trade },
    dangerLevel: 0,
  };
}

const world = {
  width: 5000,
  height: 1000,
  locations: [
    location('blackjaw-outpost', 0),
    location('origin', 100),
    location('rich', 700, true),
    location('poor', 2000, true),
  ],
};
const pirate = {
  id: 'pirate-test',
  pirate: true,
  factionId: 'pirates',
  locationId: 'origin',
  credits: 3000,
  fuelUse: 1,
  aggression: 50,
  hullHp: 100,
  hullMaxHp: 100,
  successfulRuns: 0,
};
const vessel = {
  id: 'freighter-test',
  job: 'freighter',
  pirate: false,
  cargo: { ore: 50 },
  locationId: 'rich',
};
const livePosition = (npc) => world.locations.find((entry) => entry.id === npc.locationId).position;
const quote = (destinationId) => ({
  fuelExpense: destinationId === 'rich' ? 400 : 200,
});

assert.equal(
  pirateHuntDestination(world, { ...pirate }, [vessel], livePosition, quote),
  'rich',
  'pirates should favor cargo opportunities after operating costs'
);
assert.equal(
  pirateHuntDestination(
    world,
    { ...pirate },
    [vessel],
    livePosition,
    (destinationId) => (destinationId === 'rich' ? null : { fuelExpense: 200 })
  ),
  'blackjaw-outpost',
  'a lucrative but unreachable target must not be selected'
);
assert.equal(
  pirateHuntDestination(world, { ...pirate, credits: 250 }, [vessel], livePosition, () => ({
    fuelExpense: 6000,
  })),
  'blackjaw-outpost',
  'a cash-poor pirate should retreat instead of funding a loss-making raid'
);
assert.equal(
  pirateHuntDestination(world, { ...pirate, hullHp: 25 }, [vessel], livePosition, quote),
  'blackjaw-outpost',
  'heavy damage takes priority over hunting opportunities'
);

console.log('PASS pirates favor fundable loot, reject unaffordable raids and retreat when damaged');
