'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const load = (pathInProject) => loadStandaloneTypeScriptModule(root, pathInProject);
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { seedNpcStartupShifts } = load('src/systems/npcs/npc-startup-traffic.ts');

const npcs = createSectorNpcEconomyStates();
seedNpcStartupShifts(npcs);
assert(
  npcs.some((npc) => npc.autonomy && npc.autonomy.phase === 'ready'),
  'some NPCs must start ready to begin real work instead of all resting'
);
assert(
  npcs.some((npc) => npc.autonomy && npc.autonomy.phase === 'resting'),
  'the starting sector must still have a mixture of activity and rest'
);

const civilians = npcs.filter((npc) => !npc.pirate);
const freighters = civilians.filter((npc) => npc.job === 'freighter');
assert.equal(
  new Set(freighters.map((npc) => npc.homePortId)).size,
  freighters.length,
  'freighters must start at distinct real trade ports throughout the sector'
);
const cluster = civilians.filter(
  (npc) => npc.locationId === 'haven' || npc.locationId === 'meridian-exchange'
);
assert(
  cluster.length <= 3,
  'Haven and its neighboring station must not contain the bulk of starting civilian traffic'
);
assert(
  readModuleSource(root, 'src/app/game-controller-star-map.ts').includes(
    'if (npc.hullHp <= 0) return []'
  ),
  'docked and orbiting vessels must stay visible as actual NPC ships'
);
assert(
  !readModuleSource(root, 'src/app/game-controller-star-map.ts').includes('npcVisibleInSpace'),
  'a ship must not disappear just because its economy is in a waiting phase'
);
assert(
  readModuleSource(root, 'src/app/game-controller-economy.ts').includes(
    'seedNpcStartupShifts(npcStates)'
  )
);
assert(
  !readModuleSource(root, 'src/app/game-controller-economy.ts').includes(
    'warmStartNpcTraffic(sectorNpcs, npcEconomy)'
  ),
  'expensive prehistory must no longer block synchronous controller creation'
);
console.log('PASS NPC startup shifts, balanced sector ports and visible stationed ships');
