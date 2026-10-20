'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const reputationModule = load('src/systems/reputation/faction-reputation-service.ts');
const inventoryModule = load('src/systems/ships/ship-component-inventory-service.ts');
const loadoutModule = load('src/systems/ships/ship-loadout-service.ts');
const shipRegistry = load('src/systems/ships/ship-registry.ts');
const shipActionsModule = load('src/systems/campaigns/campaign-ship-actions.ts');
const combatActionsModule = load('src/systems/campaigns/campaign-combat-actions.ts');
const gatewayModule = load('src/systems/campaigns/campaign-action-gateway.ts');
const runtimeModule = load('src/systems/campaigns/campaign-runtime.ts');
const eventsModule = load('src/systems/campaigns/campaign-event-bus.ts');

const reputation = reputationModule.createFactionReputationService(['directorate', 'corsairs']);
assert.equal(reputation.score('directorate'), 0);
assert.equal(reputation.change('unknown', 20), false);
assert.equal(reputation.change('directorate', 1.5), false);
assert.equal(reputation.change('directorate', Number.NaN), false);
assert.equal(reputation.change('directorate', 101), false);
assert.equal(reputation.change('directorate', 100), true);
assert.equal(reputation.change('directorate', 1), false, 'out-of-bounds changes do not clamp');
assert.equal(reputation.change('directorate', -200), true);
assert.equal(reputation.change('directorate', -1), false);
const reputationSnapshot = reputation.snapshot();
reputationSnapshot.scores.directorate = 999;
assert.equal(reputation.score('directorate'), -100, 'snapshots must not expose mutable scores');

const ship = shipRegistry.getShipDefinition('salvage-100m-variant-01');
assert(ship);
const player = { credits: 400, cargo: {} };
const components = inventoryModule.createShipComponentInventoryService(player);
const loadouts = loadoutModule.createShipLoadoutService();
const shipActions = shipActionsModule.createCampaignShipActions(components, loadouts, () => ship);
assert.equal(shipActions.grant('weapon', 'invalid-component-id'), false);
assert.equal(shipActions.grant('weapon', 'weapon-plasma-battery-1'), true);
const [reward] = components.list();
assert.equal(reward.source, 'campaign');
assert.equal(reward.sourceWreckId, 'campaign');
assert(player.reservedCargoTons > 0);
assert.equal(shipActions.install(reward.uid, -1), false);
assert.equal(shipActions.install(reward.uid, 0), false, 'cannot overwrite starter weapon');
assert.equal(components.list().length, 1, 'failed installs retain original cargo');
assert.equal(shipActions.install(reward.uid, 1), true, 'compatible vacant slot accepts component');
assert.equal(loadouts.get(ship).weapon[1], 'weapon-plasma-battery-1');
assert.equal(components.list().length, 0, 'successful install consumes one loose component');
assert.equal(player.reservedCargoTons, 0, 'installed components free reserved cargo');
assert.equal(shipActions.install(reward.uid, 2), false, 'consumed item cannot install twice');

player.reservedCargoTons = ship.cargoCapacityTons;
assert.equal(shipActions.grant('weapon', 'weapon-plasma-battery-1'), false);
assert.equal(components.list().length, 0, 'cargo-full refusal creates no item');
player.reservedCargoTons = 0;

let mode = 'star-map';
let position = { x: 200, y: 0 };
let travelling = false;
let pursuing = false;
let currentCombat = null;
let encounterStarts = 0;
const npc = { id: 'pirate_a', hullHp: 20, combatMovement: null };
const engagements = {
  activePlayerCombat: () => currentCombat,
  engageNpcNow(id) {
    if (id !== 'pirate_a') return false;
    encounterStarts += 1;
    currentCombat = { combat: true };
    return true;
  },
};
const sector = { npcs: [npc], livePosition: () => position };
const navigation = {
  getSnapshot: () => ({
    currentPosition: { x: 0, y: 0 },
    isTravelling: travelling,
    isPursuing: pursuing,
  }),
};
const combatActions = combatActionsModule.createCampaignCombatActions(
  engagements,
  sector,
  navigation,
  () => mode
);
assert.equal(combatActions.startExistingNpcEncounter('unknown'), false);
position = { x: 900, y: 0 };
assert.equal(combatActions.startExistingNpcEncounter('pirate_a'), false);
position = { x: 200, y: 0 };
mode = 'combat';
assert.equal(combatActions.startExistingNpcEncounter('pirate_a'), false);
mode = 'star-map';
travelling = true;
assert.equal(combatActions.startExistingNpcEncounter('pirate_a'), false);
travelling = false;
pursuing = true;
assert.equal(combatActions.startExistingNpcEncounter('pirate_a'), false);
pursuing = false;
npc.combatMovement = { blocked: true };
assert.equal(combatActions.startExistingNpcEncounter('pirate_a'), false);
npc.combatMovement = null;

const port = gatewayModule.createCampaignActionGateway({
  reputation,
  equipment: shipActions,
  combat: combatActions,
  trade: {},
  crew: {},
  getShip: () => ship,
});
const runtime = runtimeModule.createCampaignRuntime(
  eventsModule.createCampaignEventBus(),
  undefined,
  undefined,
  port
);
runtime.register({ id: 'mission', version: 1, category: 'core', title: 'Mission' });
runtime.start('mission');
assert.equal(
  runtime.applyAction('mission', 'faction:reward', {
    type: 'reputation.change',
    factionId: 'corsairs',
    delta: -7,
  }),
  'applied'
);
assert.equal(
  runtime.applyAction('mission', 'faction:reward', {
    type: 'reputation.change',
    factionId: 'corsairs',
    delta: -7,
  }),
  'already_applied'
);
assert.equal(reputation.score('corsairs'), -7);
assert.equal(
  runtime.applyAction('mission', 'combat:intro', { type: 'combat.start', npcId: 'pirate_a' }),
  'applied'
);
assert.equal(encounterStarts, 1);
assert.equal(
  runtime.applyAction('mission', 'combat:intro', { type: 'combat.start', npcId: 'pirate_a' }),
  'already_applied'
);
assert.equal(
  runtime.applyAction('mission', 'combat:second', { type: 'combat.start', npcId: 'pirate_a' }),
  'rejected'
);
assert.equal(encounterStarts, 1, 'no second encounter while already fighting');
assert.equal(runtime.snapshot().campaigns.mission.appliedActionIds.length, 2);
runtime.destroy();

const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
const setup = fs.readFileSync(path.join(root, 'src/app/game-controller-campaign-setup.ts'), 'utf8');
assert(controller.includes('createControllerCampaignServicesWithActions('));
assert(setup.includes('createCampaignCombatActions('));
assert(setup.includes('createCampaignShipActions('));
assert(setup.includes('createFactionReputationService('));
console.log('PASS campaign faction reputation, equipment rewards and live NPC combat dispatch');
