'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createSmugglingService, HIDDEN_CARGO_HOLD } = load(
  'src/systems/economy/smuggling-service.ts'
);
const { playerCargoUsed } = load('src/systems/economy/player-trade-service.ts');

const pirateFleet = [
  { pirate: true, factionId: 'pirates', credits: 100 },
  { pirate: true, factionId: 'pirates', credits: 100 },
  { pirate: true, factionId: 'pirates2', credits: 100 },
];
const player = {
  credits: 2500000,
  cargo: {
    narcotics: { qty: 20, totalCost: 11200 },
    'alien-artifacts': { qty: 3, totalCost: 7200 },
    ferrite: { qty: 4, totalCost: 160 },
  },
};
const smuggling = createSmugglingService(player, pirateFleet);
assert.equal(HIDDEN_CARGO_HOLD.capacity, 24);
assert.equal(HIDDEN_CARGO_HOLD.normalCargoPenalty, 12);
assert.equal(HIDDEN_CARGO_HOLD.cost, 750000);
assert.equal(smuggling.learnIntel(20), false, 'informant is unavailable before day 21');
assert.equal(smuggling.learnIntel(21), true);
assert.equal(player.credits, 2200000);
assert.equal(smuggling.install('ship-a', 'ordinary-port', 45), false);
assert.equal(
  smuggling.install('ship-a', 'blackjaw-outpost', 35),
  false,
  'cargo must fit after retrofit'
);
assert.equal(smuggling.install('ship-a', 'blackjaw-outpost', 45), true);
assert.equal(smuggling.install('ship-a', 'blackjaw-outpost', 45), false, 'one upgrade per ship');
assert.equal(player.credits, 1450000);
assert.equal(smuggling.normalPenalty('ship-a'), 12);
assert.equal(player.smugglingNormalPenalty, 12);
assert.equal(smuggling.hiddenCapacity('ship-a'), 24);
assert.equal(smuggling.conceal('ferrite', 3, 'ship-a'), 0, 'legal cargo cannot be concealed');
assert.equal(smuggling.conceal('narcotics', 30, 'ship-a'), 20);
assert.equal(smuggling.conceal('alien-artifacts', 10, 'ship-a'), 3);
assert.equal(player.cargo.narcotics.hiddenQty, 20);
assert.equal(smuggling.hiddenUsed(), 23);
assert.equal(playerCargoUsed(player), 4);
assert.equal(smuggling.conceal('alien-artifacts', 3, 'ship-a'), 0);
assert.equal(smuggling.reveal('narcotics', 12, 'ship-a', 45), 12);
assert.equal(smuggling.hiddenUsed(), 11);
assert.equal(playerCargoUsed(player), 16);
assert.equal(
  smuggling.reveal('alien-artifacts', 5, 'ship-a', 24),
  0,
  'cannot overflow normal hold'
);
assert.equal(smuggling.conceal('narcotics', 12, 'ship-a'), 12);

const visibleScan = smuggling.scan(0.5, 'ship-a', () => 0.4);
assert.deepEqual(visibleScan, [], 'Voidbound concealment masks cargo at this roll');
assert.equal(smuggling.reveal('narcotics', 2, 'ship-a', 45), 2);
const detected = smuggling.scan(0.5, 'ship-a', () => 0.4);
assert.equal(detected.length, 1);
assert.equal(detected[0].visibleQty, 2);
assert.equal(detected[0].hiddenQty, 0);

assert.equal(smuggling.protect('pirates', 'gallows-anchor'), false);
assert.equal(smuggling.protect('pirates', 'blackjaw-outpost'), true);
assert.equal(smuggling.protectionFee('ferrite', 1000), 0);
assert.equal(smuggling.protectionFee('narcotics', 1000), 50);
assert.equal(smuggling.recordSale('narcotics', 1000), 50);
assert.equal(smuggling.state.totalProtectionFees, 50);
assert.equal(pirateFleet[0].credits + pirateFleet[1].credits, 233);
assert.equal(pirateFleet[2].credits, 100, 'other gang receives no protection money');

const noIllegal = { credits: 5000, cargo: { ferrite: { qty: 5, totalCost: 200 } } };
const falsePositive = createSmugglingService(noIllegal);
assert(falsePositive.inspectionChance('harbor', 'high', 'ship-x') > 0);
assert.equal(falsePositive.startInspection('harbor', 'ordinary-port', 0.9), true);
assert.equal(falsePositive.startInspection('harbor', 'ordinary-port', 0.9), false);
falsePositive.decide('comply', 'ship-x', 40, () => 0);
assert.equal(falsePositive.state.inspection.outcome, 'clear');
assert.equal(falsePositive.decide('ack', 'ship-x', 40), null);

const seizedPlayer = {
  credits: 1000000,
  cargo: {
    narcotics: { qty: 8, totalCost: 8000, hiddenQty: 4 },
  },
};
const customs = createSmugglingService(seizedPlayer);
assert.equal(customs.startInspection('harbor', 'port', 0.9), true);
const first = customs.decide('papers', 'ship-x', 40, () => 1);
assert.equal(first.papersTried, true);
assert.equal(first.stage, 'request');
assert.equal(customs.decide('comply', 'ship-x', 40, () => 0).outcome, 'seized');
assert.equal(seizedPlayer.cargo.narcotics, undefined);
assert(seizedPlayer.credits < 1000000);
assert.equal(customs.decide('ack', 'ship-x', 40), null);

assert.equal(customs.startInspection('patrol', 'port', 0.6, 'patrol-01'), true);
assert.equal(customs.decide('flee', 'ship-x', 40, () => 0).outcome, 'escaped');
assert.equal(customs.decide('ack', 'ship-x', 40), null);
assert.equal(customs.startInspection('patrol', 'port', 0.6, 'patrol-01'), true);
assert.equal(customs.decide('fight', 'ship-x', 40).outcome, 'resisted');

const controller = readModuleSource(root, 'src/app/game-controller.ts');
const space = readModuleSource(root, 'src/app/game-controller-customs.ts');
const port = readModuleSource(root, 'src/app/game-controller-port.ts');
const ui = readModuleSource(root, 'src/ui/customs/customs-inspection-panel.ts');
assert(controller.includes('inspectPatrolTravel(context, deltaSeconds)'));
assert(controller.includes('inspectDockArrival(context)'));
assert(controller.includes('if (tickCustoms(context)) return'));
assert(space.includes("npc.job === 'patrol'"));
assert(space.includes('context.economy.sectorNpcs.livePosition(npc)'));
assert(port.includes('createSmugglingPortOptions('));
assert(ui.includes('customs-mandatory-backdrop'));
console.log(
  'PASS Voidbound-style concealed hold, physical customs, confiscation, protection and wiring'
);
