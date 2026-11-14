'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { SectorLegalRegistry } = load('src/systems/operations/sector-legal-registry.ts');
const { advanceNpcPenalCustody } = load('src/app/game-controller-law-enforcement.ts');

const npc = {
  id: 'miner-1',
  name: 'Miner 1',
  shipId: 'miner-hull',
  locationId: 'haven',
  credits: 0,
  activityId: 'dock',
  activity: 'Wartet',
};
const legal = new SectorLegalRegistry();
legal.registerShip('miner-hull:miner-1', npc.id);
legal.reportOffense('miner-hull:miner-1', 'player', 'Raubbau', 1000, 1);
legal.declareWanted('miner-hull:miner-1');
const prisonerIds = new Set();
const player = { credits: 0 };
const context = {
  economy: {
    legal,
    sectorNpcs: { npcs: [npc], isTravelling: () => false },
    npcPrisoners: prisonerIds,
    situations: { currentDay: 1 },
    trade: { player },
  },
  systemLog: { write: () => {} },
};
advanceNpcPenalCustody(context);
assert(prisonerIds.has(npc.id), 'Wanted NPC is arrested at a real Directorate port');
assert.equal(legal.status('miner-hull:miner-1'), 'custody');
for (let day = 2; day <= 4; day++) {
  context.economy.situations.currentDay = day;
  advanceNpcPenalCustody(context);
}
assert.equal(legal.debt('miner-hull:miner-1'), 0);
assert.equal(legal.status('miner-hull:miner-1'), 'clear');
assert(!prisonerIds.has(npc.id));
assert.equal(player.credits, 1000, 'Penal labor pays the actual creditor without duplication');
assert.equal(npc.activity, 'Entlassung aus Straflager');
console.log('PASS legal custody: NPC detention, genuine daily labor and creditor release');
