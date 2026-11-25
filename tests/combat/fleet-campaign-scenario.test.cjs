'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createFleetScenarioRoster } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/start/fleet-scenario-roster.ts'
);
const groups = [
  { group: 'npc', initial: 1, joining: 2, afterSeconds: 5 },
  { group: 'pirates-yellow', initial: 1, joining: 1, afterSeconds: 10 },
  { group: 'pirates-red', initial: 0, joining: 1, afterSeconds: 12 },
  { group: 'drone', initial: 0, joining: 1, afterSeconds: 15 },
];
const generated = createFleetScenarioRoster(groups);
const { npcDefenseReaction } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-combat-ai.ts'
);
const { getShipDefinition } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-registry.ts'
);
// This same NPC policy runs in the campaign and in the PvP/FleetCombat world.
assert.equal(
  npcDefenseReaction({ job: 'freighter', aggression: 100, hullHp: 100, hullMaxHp: 100 }),
  'flee',
  'even the most aggressive freight captain must prefer escape'
);
for (const [mapKind, role] of [
  ['asteroid_field', 'mining'],
  ['scrap_field', 'salvage'],
  ['empty', 'freighter'],
]) {
  const workers = createFleetScenarioRoster(
    [{ group: 'npc', initial: 2, joining: 0, afterSeconds: 0 }],
    mapKind
  ).filter((ship) => ship.group === 'npc');
  assert.equal(
    getShipDefinition(workers[0].draft.shipId).role,
    role,
    'first civilian worker must have a real campaign job for ' + mapKind
  );
}
for (let pass = 0; pass < 50; pass += 1) {
  const civilians = createFleetScenarioRoster([
    { group: 'npc', initial: 10, joining: 10, afterSeconds: 5 },
  ]).filter((ship) => ship.group === 'npc');
  assert.equal(civilians.length, 20);
  assert(
    civilians.every((ship) => !ship.draft.shipId.startsWith('pirate-')),
    'civilian NPC roster must never spawn pirate hulls, even if the random catalog offers them'
  );
  assert(
    civilians.every((ship) => !ship.name.toLowerCase().includes('korsaren')),
    'civilian display names must not claim to be pirates'
  );
}
assert.equal(generated.length, 8);
assert.equal(generated.filter((ship) => ship.id === 'player').length, 1);
assert.equal(generated.find((ship) => ship.id === 'npc-2').arrivalSeconds, 5);
assert.equal(generated.find((ship) => ship.id === 'pirates-yellow-2').arrivalSeconds, 10);
assert.equal(generated.find((ship) => ship.id === 'pirates-red-1').arrivalSeconds, 12);
const testDrone = generated.find((ship) => ship.id === 'security-drone:test-1');
assert.equal(testDrone.arrivalSeconds, 15);
const { getShipComponent } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-service.ts'
);
assert(testDrone.draft.weapons.some(Boolean), 'security drone needs working guns');
assert(
  testDrone.draft.weapons.filter(Boolean).every((id) => getShipComponent('weapon', id)?.tier === 3),
  'FleetCombat security drones must use actual Mk III weapons'
);
assert.equal(testDrone.draft.hullId, 'hull3');
assert.equal(testDrone.draft.shieldId, 'shield3');
assert(testDrone.draft.reactorId.includes('reactor3'), 'security drones need Mk III power');
assert(
  generated
    .filter((ship) => ship.group === 'pirates-yellow' || ship.group === 'pirates-red')
    .every((ship) => ship.draft.shipId.startsWith('pirate-')),
  'both marked pirate groups use real campaign pirate hulls'
);

// Run the production scene and controller, substituting only the browser panels.
require.extensions['.css'] = () => {};
global.window = {
  addEventListener() {},
  removeEventListener() {},
  localStorage: {
    getItem() {
      return null;
    },
  },
  location: { search: '' },
};
let clock = 0;
Object.defineProperty(performance, 'now', { value: () => clock });
const panels = {};
const panel = (name) => (options) => {
  panels[name] = options.model;
  return {
    destroy() {},
    update(model) {
      panels[name] = model;
    },
  };
};
const replacements = {
  'src/systems/audio/game-audio-service.ts': {
    createGameAudioService: () => new Proxy({}, { get: () => () => {} }),
  },
  'src/app/game-controller-switcher-bridge.ts': { mountControllerShipSwitcher() {} },
  'src/ui/local-space/local-space-panel.ts': { createLocalSpacePanel: panel('mining') },
  'src/ui/salvage/salvage-space-panel.ts': { createSalvageSpacePanel: panel('salvage') },
  'src/ui/settings/settings-menu.ts': {
    createSettingsMenu(audio, exit, profile, save) {
      assert.equal(save, undefined);
      return { destroy() {} };
    },
  },
};
const load = (file) => loadStandaloneTypeScriptModule(root, file, replacements);
const { prepareFleetField } = load('src/app/fleet-field-session.ts');
const { createGameController } = load('src/app/game-controller.ts');
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { createNavigationService } = load('src/systems/navigation/navigation-service.ts');
const { createPlayerProfile } = load('src/core/player-profile.ts');
for (const map of ['empty', 'asteroid_field', 'scrap_field']) {
  const fleetGroups = ['npc', 'drone', 'pirates-yellow', 'pirates-red'].map((group) => ({
    group,
    initial: 5,
    joining: 2,
    afterSeconds: 25,
  }));
  const config = { map, incident: 'none', ships: createFleetScenarioRoster(fleetGroups, map) };
  const session = prepareFleetField(config, 4321);
  const { mining, salvage, spawns } = session.exercise;
  const { width } = mining ?? salvage;
  for (const [id, point] of spawns) {
    if (id.startsWith('pirates-yellow')) assert(point.x < width / 4);
    else if (id.startsWith('pirates-red')) assert(point.x > (width * 3) / 4);
    else assert(point.x > width / 4 && point.x < (width * 3) / 4);
  }
  const points = [...spawns.values()];
  for (let i = 0; i < points.length; i++) {
    for (const other of points.slice(i + 1)) {
      assert(Math.hypot(points[i].x - other.x, points[i].y - other.y) >= 170);
    }
  }
}

for (const map of ['asteroid_field', 'scrap_field']) {
  const stagedGroups = [
    { group: 'npc', initial: 1, joining: 3, afterSeconds: 1 },
    { group: 'drone', initial: 0, joining: 2, afterSeconds: 1 },
    { group: 'pirates-yellow', initial: 1, joining: 0, afterSeconds: 0 },
    { group: 'pirates-red', initial: 1, joining: 0, afterSeconds: 0 },
  ];
  const config = { map, incident: 'none', ships: createFleetScenarioRoster(stagedGroups, map) };
  const session = prepareFleetField(config, 4321);
  const prepare = session.exercise.prepare;
  let ctx;
  const game = createGameController({
    root: { replaceChildren() {} },
    ship: session.ship,
    playerProfile: createPlayerProfile({
      portraitId: 1,
      captainName: 'Captain',
      shipName: 'Probe',
    }),
    navigation: createNavigationService(
      narrowsSector,
      session.location.id,
      session.ship.navigation.cruiseSpeed
    ),
    fieldExercise: {
      ...session.exercise,
      prepare(value) {
        ctx = value;
        prepare(value);
      },
    },
    onReturnToMainMenu() {},
  });
  const mining = map === 'asteroid_field';
  assert.equal(ctx.state.mode, mining ? 'local-space' : 'salvage-space');
  const playerBody = mining
    ? ctx.state.localSpace.getSnapshot().instance.ship
    : ctx.state.salvageScene.body('player');
  assert.deepEqual(playerBody.position, session.exercise.spawns.get('player'));
  const traffic = ctx.economy.localPirates.get(session.location.id);
  for (const [id, heading] of [
    ['pirates-yellow-1', 0],
    ['pirates-red-1', Math.PI],
  ]) {
    assert.deepEqual(traffic.body(id).position, session.exercise.spawns.get(id));
    assert.equal(traffic.body(id).headingRadians, heading);
  }

  assert.equal(ctx.economy.sectorNpcs.npcs.length, 3);
  function advance(count) {
    for (let n = 0; n < count; n++) {
      clock += 80;
      session.advance(0.08);
      game.tick(0.08);
    }
  }
  advance(10);
  assert.equal(ctx.economy.sectorNpcs.npcs.length, 3);
  advance(5);
  assert.equal(ctx.economy.sectorNpcs.npcs.length, 8);
  const body = (id) =>
    mining
      ? ctx.economy.localPirates.get(session.location.id).body(id)
      : ctx.state.salvageScene.body(id);
  const escort = 'security-drone:' + session.location.id + ':escort-2';
  assert(body(escort), 'scheduled second drone has a physical field body');
  assert(body('npc-2'), 'campaign field simulates the freighter');
  assert(body('npc-3'), 'campaign field simulates the patrol');
  const workers = mining
    ? ctx.state.localNpcMining.ships.map((s) => s.npcId)
    : ['npc-1', 'npc-4'].filter((id) => body(id));
  assert.deepEqual(workers.sort(), ['npc-1', 'npc-4']);
  assert.strictEqual(
    mining ? ctx.state.localSpace.getSnapshot().instance : ctx.state.salvageScene.getField(),
    mining ? session.exercise.mining : session.exercise.salvage
  );
  if (mining) {
    const { startPlayerMiningCombat } = load('src/app/game-controller-mining-combat-action.ts');
    startPlayerMiningCombat(ctx, 'npc-1');
  } else ctx.state.salvageScene.attackNpc('npc-1');
  assert(ctx.engagements.activePlayerFleet(), 'physical contact entered the career fleet');
  advance(3);
  assert.equal(
    ctx.state.mode,
    mining ? 'local-space' : 'salvage-space',
    'combat stays on mounted campaign field'
  );
  assert(
    panels[mining ? 'mining' : 'salvage'].combat,
    'the mounted field presents the native combat snapshot'
  );
  game.destroy();
}
