'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const policy = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/pirate-interception-policy.ts'
);

const haven = {
  id: 'haven',
  position: { x: 100, y: 100 },
  radius: 38,
  kind: 'planet',
  dangerLevel: 0,
  activities: { dock: true, refuel: true },
};
const pirateStation = {
  id: 'blackjaw-outpost',
  position: { x: 1800, y: 100 },
  radius: 18,
  kind: 'station',
  stationType: 'pirate',
  dangerLevel: 3,
  activities: { dock: true, refuel: true },
};
const world = { regions: [], locations: [haven, pirateStation] };
const raider = { pirate: true, pirateClass: 'raider', factionId: 'pirates' };
const marauder = { pirate: true, pirateClass: 'marauder', factionId: 'pirates' };
const loadedCivilian = {
  job: 'freighter',
  cargo: { steel: 20 },
  travel: { destinationId: 'haven' },
};
assert(
  !policy.pirateMayIntercept(world, raider, { x: 110, y: 100 }),
  'civilian arrival protection must prevent opportunistic raids'
);
assert(
  !policy.pirateMayIntercept(world, marauder, { x: 800, y: 100 }),
  'heavy pirates must not hunt in green space'
);
assert(
  policy.pirateMayIntercept(world, marauder, { x: 1800, y: 100 }),
  'heavy pirates can still operate in dangerous pirate regions'
);
assert(
  policy.canRaidCivilianCargo(world, marauder, loadedCivilian, { x: 1800, y: 100 }),
  'heavy pirate can intercept loaded in-flight civilian in red space'
);
assert(
  !policy.canRaidCivilianCargo(
    world,
    marauder,
    { ...loadedCivilian, travel: undefined },
    { x: 1800, y: 100 }
  ),
  'passive port traffic must not be auto-raided'
);
assert(
  !policy.canRaidCivilianCargo(
    world,
    marauder,
    { ...loadedCivilian, smugglingProtectionFaction: 'pirates' },
    { x: 1800, y: 100 }
  ),
  'protection agreements must prevent the gang from raiding protected smugglers'
);
console.log(
  'PASS real pirate interception policy: location safety, class eligibility, cargo, travel and protection'
);
