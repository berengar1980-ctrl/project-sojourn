'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const load = (pathInProject) => loadStandaloneTypeScriptModule(root, pathInProject);
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { seedNpcStartupShifts } = load('src/systems/npcs/npc-startup-traffic.ts');
const { npcVisibleInSpace } = load('src/systems/npcs/npc-sector-visibility.ts');

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

const civilian = npcs.find((npc) => npc.job === 'freighter');
const worker = npcs.find((npc) => npc.job === 'miner');
assert(civilian && worker);
assert.equal(npcVisibleInSpace(civilian), false, 'docked freighter must not float on the map');
civilian.travel = { targetLocationId: 'haven' };
assert.equal(npcVisibleInSpace(civilian), true, 'real cargo journey must remain visible');
delete civilian.travel;
worker.locationId = worker.workLocationId;
worker.autonomy.phase = 'working';
assert.equal(npcVisibleInSpace(worker), true, 'working miner is visible at the actual field');
worker.autonomy.phase = 'resting';
assert.equal(npcVisibleInSpace(worker), false, 'resting miner stays docked');
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
console.log('PASS NPC startup shifts, docked ship visibility and responsive initialization');
