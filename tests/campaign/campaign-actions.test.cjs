'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (p) => loadStandaloneTypeScriptModule(root, p);
const trades = load('src/systems/economy/player-trade-service.ts');
const crews = load('src/systems/crew/crew-roster-service.ts');
const ships = load('src/systems/ships/ship-registry.ts');
const profiles = load('src/core/player-profile.ts');
const gatewayModule = load('src/systems/campaigns/campaign-action-gateway.ts');
const eventsModule = load('src/systems/campaigns/campaign-event-bus.ts');
const campaignModule = load('src/systems/campaigns/campaign-runtime.ts');

const ship = ships.getShipDefinition('salvage-100m-variant-01');
assert(ship, 'canonical starting hull must exist');
const player = profiles.createPlayerProfile({
  portraitId: 1,
  captainName: 'Mara',
  shipName: 'Wanderin',
});
const trade = trades.createPlayerTradeService({}, 100);
const crew = crews.createCrewRosterService(player);
const port = gatewayModule.createCampaignActionGateway({ trade, crew, getShip: () => ship });

assert.equal(port.apply({ type: 'credits.take', amount: 101 }), false);
assert.equal(port.apply({ type: 'credits.grant', amount: Number.NaN }), false);
assert.equal(port.apply({ type: 'credits.grant', amount: 0 }), false);
assert.equal(port.apply({ type: 'credits.take', amount: 1.5 }), false);
assert.equal(trade.player.credits, 100, 'failed credit changes must be inert');
assert.equal(port.apply({ type: 'credits.grant', amount: 50 }), true);
assert.equal(port.apply({ type: 'credits.take', amount: 50 }), true);
assert.equal(trade.player.credits, 100);

assert.equal(port.apply({ type: 'cargo.grant', resourceId: 'invented', quantity: 1 }), false);
assert.equal(port.apply({ type: 'cargo.grant', resourceId: 'steel', quantity: 1.5 }), false);
assert.equal(
  port.apply({ type: 'cargo.grant', resourceId: 'steel', quantity: ship.cargoCapacityTons + 1 }),
  false
);
assert.deepEqual(trade.snapshot().cargo, {}, 'failed cargo grants must not create lots');
assert.equal(port.apply({ type: 'cargo.grant', resourceId: 'steel', quantity: 3 }), true);
assert.equal(port.apply({ type: 'cargo.take', resourceId: 'steel', quantity: 4 }), false);
assert.equal(trade.player.cargo.steel.qty, 3);
assert.equal(port.apply({ type: 'cargo.take', resourceId: 'steel', quantity: 1 }), true);
assert.equal(trade.player.cargo.steel.qty, 2);
assert.equal(port.apply({ type: 'cargo.take', resourceId: 'steel', quantity: 2 }), true);
assert.equal(trade.player.cargo.steel, undefined);
trade.player.cargo.steel = { qty: 4, totalCost: 200, lastOriginId: 'haven' };
assert.equal(port.apply({ type: 'cargo.take', resourceId: 'steel', quantity: 1 }), true);
assert.equal(trade.player.cargo.steel.qty, 3);
assert.equal(trade.player.cargo.steel.totalCost, 150, 'removals retain proportional cost basis');
const observation = trade.snapshot();
observation.cargo.steel.qty = 900;
assert.equal(trade.player.cargo.steel.qty, 3, 'economy snapshots must detach lots');

assert.equal(port.apply({ type: 'crew.dismiss', crewId: 'player' }), false);
assert.equal(port.apply({ type: 'crew.hire', crewId: 'not-in-catalog' }), false);
const available = crew.availableDefinitions();
assert(available.length, 'crew catalog must contain recruitable characters');
const crewId = available[0].id;
assert.equal(port.apply({ type: 'crew.hire', crewId }), true);
assert(crew.member(crewId));
assert.equal(port.apply({ type: 'crew.hire', crewId }), false, 'crew may not duplicate');
assert.equal(port.apply({ type: 'crew.assign', crewId, stationId: 'not-a-station' }), false);
const existingStations = crews.createCrewRosterService(player).runtimeOptions(ship);
const stationId = Object.keys(existingStations.assignments)[0];
assert(stationId, 'ship must have an available station');
assert.equal(port.apply({ type: 'crew.assign', crewId, stationId }), true);
assert.equal(crew.assignments(ship)[stationId], crewId);
assert.equal(port.apply({ type: 'crew.dismiss', crewId }), true);
assert.equal(crew.member(crewId), null);
assert.notEqual(crew.assignments(ship)[stationId], crewId, 'dismissal clears station assignment');

const bus = eventsModule.createCampaignEventBus();
const engine = campaignModule.createCampaignRuntime(bus, undefined, undefined, port);
engine.register({
  id: 'test_a',
  title: 'Test A',
  version: 1,
  category: 'core',
  onEvent(event, ctx) {
    if (event.type !== 'game.initialized') return;
    ctx.start();
    assert.equal(
      ctx.applyAction('reward:opening', { type: 'credits.grant', amount: 25 }),
      'applied'
    );
    assert.equal(
      ctx.applyAction('reward:opening', { type: 'credits.grant', amount: 25 }),
      'already_applied'
    );
  },
});
const init = {
  type: 'game.initialized',
  captainName: 'Mara',
  portraitId: 1,
  shipId: ship.id,
  stationId: player.stationId,
};
bus.emit(init);
assert.equal(trade.player.credits, 125);
assert.equal(
  engine.applyAction('test_a', 'reward:opening', { type: 'credits.grant', amount: 25 }),
  'already_applied'
);
assert.equal(
  engine.applyAction('test_a', 'payment:failure', { type: 'credits.take', amount: 900 }),
  'rejected'
);
assert.deepEqual(engine.snapshot().campaigns.test_a.appliedActionIds, ['reward:opening']);
assert.equal(
  engine.applyAction('test_a', 'payment:failure', { type: 'credits.take', amount: 25 }),
  'applied',
  'failed actions must be retryable'
);
assert.equal(trade.player.credits, 100);
const snapshot = engine.snapshot();
snapshot.campaigns.test_a.appliedActionIds.push('forged');
assert.equal(engine.snapshot().campaigns.test_a.appliedActionIds.length, 2);
assert.equal(engine.complete('test_a', 'done'), true);
assert.equal(
  engine.applyAction('test_a', 'after:finish', { type: 'credits.grant', amount: 10 }),
  'rejected'
);
engine.destroy();

const restored = campaignModule.createCampaignRuntime(
  eventsModule.createCampaignEventBus(),
  engine.snapshot(),
  undefined,
  port
);
restored.register({ id: 'test_a', title: 'Test A', version: 1, category: 'core' });
assert.equal(
  restored.applyAction('test_a', 'reward:opening', { type: 'credits.grant', amount: 25 }),
  'rejected',
  'completed campaign cannot apply actions after restore'
);
assert.equal(trade.player.credits, 100);
restored.destroy();

const active = campaignModule.createCampaignRuntime(
  eventsModule.createCampaignEventBus(),
  undefined,
  undefined,
  port
);
active.register({ id: 'test_a', title: 'Test A', version: 1, category: 'core' });
active.register({ id: 'test_b', title: 'Test B', version: 1, category: 'core' });
active.start('test_a');
active.start('test_b');
assert.equal(
  active.applyAction('test_a', 'reward:shared', { type: 'credits.grant', amount: 10 }),
  'applied'
);
assert.equal(
  active.applyAction('test_b', 'reward:shared', { type: 'credits.grant', amount: 10 }),
  'applied'
);
assert.equal(trade.player.credits, 120, 'receipt keys must be scoped to campaigns');
active.destroy();

const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
const setup = fs.readFileSync(
  path.join(root, 'src/app/game-controller-campaign-setup.ts'),
  'utf8'
);
assert(controller.includes('createControllerCampaignServicesWithActions('));
assert(setup.includes('createCampaignActionGateway('), 'controller wires real domain owners');
console.log(
  'PASS campaign gateway exact economy actions, crew transactions and once-only receipts'
);
