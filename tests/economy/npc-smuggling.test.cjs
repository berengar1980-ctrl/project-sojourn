'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { createNpcSmugglingService, resolveNpcSmugglingInspection, npcSmugglingScan } = load(
  'src/systems/economy/npc-smuggling-service.ts'
);
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');

const npcs = createSectorNpcEconomyStates();
const smugglers = npcs.filter((x) => x.smuggler);
assert.equal(npcs.length, 33, 'use existing physical NPC fleet');
assert.equal(smugglers.length, 3);
assert(smugglers.every((x) => x.job === 'freighter' && x.smugglingProtectionFaction));
const market = createEconomyMarketService(sectorPorts, economyResources);
assert(market.getEntry('blackjaw-outpost', 'narcotics'));
assert(market.getEntry('crown', 'narcotics'));
assert(market.getEntry('eidolon', 'stolen-data'));
assert(market.getEntry('aurora', 'alien-artifacts'));

const trader = smugglers[0];
const patrol = npcs.find((x) => x.job === 'patrol');
assert(patrol);
trader.cargo.narcotics = 7;
trader.smugglingConcealment = 0;
trader.smugglingSuspicion = 50;
const before = trader.credits;
const scan = npcSmugglingScan(trader, 0.9, () => 0);
assert.equal(scan[0].qty, 7);
const rolls = [0, 0.99];
const seized = resolveNpcSmugglingInspection(trader, patrol, 0.9, () => rolls.shift() ?? 0.99);
assert.equal(seized, 'seized');
assert.equal(trader.cargo.narcotics, undefined);
assert.equal(trader.smugglingConfiscated, 7);
assert(trader.credits < before, 'confiscation charges an actual fine');
assert.equal(trader.smugglingFinesPaid, before - trader.credits);
assert(trader.credits >= 0, 'fine never creates negative cash');

trader.cargo['stolen-data'] = 4;
trader.smugglingConcealment = 0.9;
const clean = resolveNpcSmugglingInspection(trader, null, 0.3, () => 0.99);
assert.equal(clean, 'clear', 'a scan is not an automatic confiscation');
assert.equal(trader.cargo['stolen-data'], 4);

const logs = [];
const service = createNpcSmugglingService(
  npcs,
  {
    livePosition: (npc) => (npc.travel ? { x: 0, y: 0 } : { x: 8000, y: 8000 }),
  },
  (message) => logs.push(message),
  () => 0.99
);
const allied = npcs.filter((x) => x.pirate && x.factionId === trader.smugglingProtectionFaction);
const rival = npcs.filter((x) => x.pirate && x.factionId !== trader.smugglingProtectionFaction);
const alliedBefore = allied.reduce((s, x) => s + x.credits, 0);
const rivalBefore = rival.reduce((s, x) => s + x.credits, 0);
const creditsBefore = trader.credits;
service.recordSale(trader, 'stolen-data', 4, 10000);
assert.equal(service.stats.illegalUnitsSold, 4);
assert.equal(service.stats.protectionFees, 500);
assert.equal(trader.credits, creditsBefore - 500);
assert.equal(
  allied.reduce((s, x) => s + x.credits, 0),
  alliedBefore + 325
);
assert.equal(
  rival.reduce((s, x) => s + x.credits, 0),
  rivalBefore
);
service.recordSale(trader, 'steel', 4, 10000);
assert.equal(service.stats.protectionFees, 500, 'legal sales never pay protection');
trader.smugglingSuspicion = 20;
service.advanceDay(6);
assert.equal(trader.smugglingSuspicion, 17);
service.advanceDay(6);
assert.equal(trader.smugglingSuspicion, 17, 'daily decay must run once');

const tradeSource = readModuleSource(root, 'src/systems/economy/npc-trade-actions.ts');
const runtime = readModuleSource(root, 'src/app/game-controller.ts');
const economy = readModuleSource(root, 'src/app/game-controller-economy.ts');
const events = readModuleSource(root, 'src/app/game-controller-events.ts');
const engagement = readModuleSource(root, 'src/systems/combat/star-map-engagement-service.ts');
const notice = readModuleSource(root, 'src/ui/customs/underworld-contact-notice.ts');
assert(tradeSource.includes('npc.smuggler'), 'non-smugglers must not buy contraband');
assert(runtime.includes('tickControllerNpcOperations(economy, deltaSeconds)'));
assert(
  readModuleSource(root, 'src/app/game-controller-npc-tick.ts').includes(
    'economy.npcSmuggling.tick(deltaSeconds)'
  )
);
assert(economy.includes('npcSmuggling.recordSale('));
const interceptionPolicy = readModuleSource(root, 'src/systems/combat/pirate-interception-policy.ts');
assert(engagement.includes('canRaidCivilianCargo('), 'combat must use the shared pirate interception policy');
assert(
  interceptionPolicy.includes('civilian.smugglingProtectionFaction !== pirate.factionId'),
  'pirates must still honor existing smuggler protection agreements'
);
assert(events.includes('showUnderworldContactNotice(context.root)'));
assert(events.includes('hiddenHoldIntelContacted = true'));
assert(notice.includes('NACHRICHT SPEICHERN'));
console.log(
  'PASS actual NPC contraband sales, inspections, cargo seizure and underworld notice wiring'
);
