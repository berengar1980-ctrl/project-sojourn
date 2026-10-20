'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (source) => loadStandaloneTypeScriptModule(root, source);
const story = load('src/data/campaigns/silent-signal.ts').silentSignalCampaign;
const busModule = load('src/systems/campaigns/campaign-event-bus.ts');
const runtimeModule = load('src/systems/campaigns/campaign-runtime.ts');
const worldModule = load('src/systems/campaigns/campaign-world-service.ts');
const navigationModule = load('src/systems/navigation/navigation-service.ts');
const narrowsSector = load('src/data/maps/narrows-sector.ts').narrowsSector;

function arriveAt(nav, destinationId) {
  const before = nav.getSnapshot().currentLocationId;
  nav.selectDestination(destinationId);
  nav.startTravel();
  for (let frame = 0; frame < 6000 && nav.getSnapshot().isTravelling; frame += 1) {
    nav.tick(0.1);
  }
  assert.equal(nav.getSnapshot().currentLocationId, destinationId);
  return before;
}

function createScenario() {
  const nav = navigationModule.createNavigationService(narrowsSector, 'haven', 240);
  const world = worldModule.createCampaignWorldService(narrowsSector, nav);
  const bus = busModule.createCampaignEventBus();
  const wallet = { credits: 0, changes: [] };
  const port = {
    apply(action, owner) {
      if (action.type === 'world.location.add') return world.addLocation(owner, action.location);
      if (action.type === 'world.system.add') {
        return world.addSystem(owner, {
          map: action.map,
          entryLocationId: action.entryLocationId,
          exitLocationId: action.exitLocationId,
        });
      }
      if (action.type === 'world.system.enter') return world.enterSystem(owner, action.systemId);
      if (action.type === 'world.system.return') return world.returnFromSystem(owner);
      if (action.type === 'credits.grant') {
        wallet.credits += action.amount;
        return true;
      }
      if (action.type === 'reputation.change') {
        wallet.changes.push([action.factionId, action.delta]);
        return true;
      }
      return false;
    },
    releaseCampaign: (id) => world.releaseCampaign(id),
  };
  const engine = runtimeModule.createCampaignRuntime(bus, undefined, undefined, port);
  engine.register(story);
  assert.equal(engine.setEnabled(story.id, true), true, 'development story is opt-in');
  bus.emit({
    type: 'game.initialized',
    captainName: 'Test',
    portraitId: 1,
    shipId: 'salvage-100m-variant-01',
    stationId: 'bridge',
  });
  assert.equal(engine.isActive(story.id), true);
  return { nav, world, bus, wallet, engine };
}

function runEnding(ending) {
  const { nav, world, bus, wallet, engine } = createScenario();
  assert(world.world().locations.some((item) => item.id === 'silent-beacon'));
  assert.equal(engine.journal('haven')[0].targetLocationId, 'silent-beacon');
  assert.equal(engine.journal('haven')[0].dialogue, undefined, 'dialogues stay location-gated');

  const firstFrom = arriveAt(nav, 'silent-beacon');
  bus.emit({
    type: 'location.arrived',
    fromLocationId: firstFrom,
    locationId: 'silent-beacon',
  });
  const prompt = engine.journal('silent-beacon')[0];
  assert.equal(prompt.dialogue.id, 'beacon');
  prompt.dialogue.choices[0].label = 'tampered';
  assert.notEqual(engine.journal('silent-beacon')[0].dialogue.choices[0].label, 'tampered');

  const emitChoice = (dialogueId, choiceId, locationId) =>
    bus.emit({
      type: 'dialogue.choice',
      campaignId: story.id,
      dialogueId,
      choiceId,
      locationId,
    });
  emitChoice('beacon', 'decode', 'haven');
  assert.equal(
    engine.journal('silent-beacon')[0].dialogue.id,
    'beacon',
    'choices at incorrect locations cannot advance a stage'
  );
  emitChoice('beacon', 'decode', 'silent-beacon');
  assert.equal(engine.journal('silent-beacon')[0].dialogue.id, 'gate');
  emitChoice('beacon', 'decode', 'silent-beacon');
  assert.equal(world.snapshot().systems[story.id].length, 1, 'worlds cannot duplicate');

  emitChoice('gate', 'enter', 'silent-beacon');
  assert.equal(world.inForeignSystem(), true);
  assert.equal(nav.getSnapshot().currentLocationId, 'silent-entry');
  assert.equal(engine.journal('silent-entry')[0].targetLocationId, 'silent-laboratory');

  const fromResearch = arriveAt(nav, 'silent-laboratory');
  bus.emit({
    type: 'location.arrived',
    fromLocationId: fromResearch,
    locationId: 'silent-laboratory',
  });
  assert.equal(engine.journal('silent-laboratory')[0].dialogue.id, 'crew');
  emitChoice('crew', ending, 'silent-laboratory');
  assert.equal(engine.journal('silent-laboratory')[0].targetLocationId, 'silent-exit');
  emitChoice('crew', ending === 'rescue' ? 'quarantine' : 'rescue', 'silent-laboratory');
  assert.equal(engine.snapshot().campaigns[story.id].data.ending, ending);

  const fromExit = arriveAt(nav, 'silent-exit');
  bus.emit({ type: 'location.arrived', fromLocationId: fromExit, locationId: 'silent-exit' });
  if (ending === 'rescue') {
    assert.equal(engine.journal('silent-exit')[0].dialogue.id, 'exit');
    emitChoice('exit', 'home', 'silent-exit');
  } else {
    assert.equal(world.returnFromSystem(), true, 'map gate permits manual return');
  }
  assert.equal(nav.getSnapshot().currentLocationId, 'silent-beacon');
  bus.emit({
    type: 'location.arrived',
    fromLocationId: 'silent-exit',
    locationId: 'silent-beacon',
  });
  assert.equal(engine.journal('silent-beacon')[0].dialogue.id, 'report');
  emitChoice('report', 'deliver', 'silent-beacon');
  const result = engine.snapshot().campaigns[story.id];
  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, ending === 'rescue' ? 'crew_rescued' : 'ship_quarantined');
  assert.equal(wallet.credits, ending === 'rescue' ? 220 : 300);
  assert.deepEqual(wallet.changes, [
    [ending === 'rescue' ? 'free_traders' : 'terran_directorate', 6],
  ]);
  assert.equal(
    world.world().locations.some((item) => item.id === 'silent-beacon'),
    false
  );
  assert.equal(world.snapshot().systems[story.id], undefined);
  emitChoice('report', 'deliver', 'silent-beacon');
  assert.equal(wallet.changes.length, 1, 'completed rewards never duplicate');
  assert.equal(engine.journal('silent-beacon')[0].status, 'completed');
  engine.destroy();
}

runEnding('rescue');
runEnding('quarantine');

const manifest = fs.readFileSync(path.join(root, 'src/data/campaigns/manifest.ts'), 'utf8');
const starPanel = fs.readFileSync(path.join(root, 'src/app/game-controller-star-map.ts'), 'utf8');
const mapPanel = fs.readFileSync(path.join(root, 'src/ui/map/star-map-panel.ts'), 'utf8');
assert(manifest.includes('silentSignalCampaign'));
assert(starPanel.includes("type: 'dialogue.choice'"));
assert(mapPanel.includes('renderCampaignJournal('));
console.log('PASS first campaign: playable decisions, rewards, journeys and cleanup');
