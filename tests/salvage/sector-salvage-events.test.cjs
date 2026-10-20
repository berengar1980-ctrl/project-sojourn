'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const generator = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/salvage-field-generator.ts'
);
const eventModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/sector-salvage-event-service.ts'
);
const eventFieldModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/salvage-event-field-generator.ts'
);
const componentModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-service.ts'
);
const researchModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/shipyard-research-service.ts'
);
const navigationModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/navigation-service.ts'
);
const { narrowsSector } = loadStandaloneTypeScriptModule(root, 'src/data/maps/narrows-sector.ts');

const normalField = generator.generateSalvageField('drift-wreck', 9001, 3);
assert(
  normalField.wrecks.every((wreck) => wreck.component === null && wreck.componentStatus === 'none'),
  'ordinary wreck fields must never offer ship-component recovery'
);

const events = eventModule.createSectorSalvageEventService(narrowsSector, 0x50a7a9e);
let capturedSpecial = null;
let capturedDistress = null;
for (let day = 0; day <= 24; day += 1) {
  events.advanceDay(day, { x: 3500, y: 3000 }, true);
  assert(
    events.active.length <= eventModule.MAX_ACTIVE_SALVAGE_EVENTS,
    'no more than three salvage world events may be active'
  );
  assert(
    events.active.filter((event) => event.type === 'distress-rescue').length <=
      eventModule.MAX_ACTIVE_DISTRESS_EVENTS,
    'no more than one distress salvage event may be active'
  );
  capturedSpecial ??= events.active.find((event) => event.type === 'special-wreck') ?? null;
  capturedDistress ??= events.active.find((event) => event.type === 'distress-rescue') ?? null;
}
assert(capturedSpecial, 'salvager gameplay must eventually spawn a special wreck signal');
assert(capturedDistress, 'salvager gameplay must eventually spawn a distress call');

const specialField = eventFieldModule.generateSectorSalvageEventField(capturedSpecial);
assert.equal(
  specialField.wrecks.length,
  1,
  'world-event salvage must open a focused one-wreck map'
);
const specialCandidate = specialField.wrecks[0].component;
assert(specialCandidate, 'special wreck event must expose a recoverable ship component');
const specialDefinition = componentModule.getShipComponent(
  specialCandidate.type,
  specialCandidate.componentId
);
assert(specialDefinition, 'recovered component must resolve to a real component definition');
assert(specialDefinition.tier >= 1 && specialDefinition.tier <= 6);
const research = researchModule.createShipyardResearchService();
if (specialDefinition.specialSalvage) {
  assert(
    specialDefinition.salvageModifier === 'efficiency' ||
      specialDefinition.salvageModifier === 'performance',
    'a salvaged bonus must be efficiency or performance'
  );
  assert(
    specialDefinition.salvageModifierPct >= 1 && specialDefinition.salvageModifierPct <= 25,
    'a salvaged bonus must be between 1 and 25 percent'
  );
  const specialBase = componentModule.getShipComponent(
    specialCandidate.type,
    specialDefinition.baseId
  );
  assert(specialBase, 'bonus component must retain its exact original model');
  if (specialDefinition.salvageModifier === 'efficiency') {
    assert(specialBase.power > 0, 'passive components cannot have an efficiency bonus');
    assert(
      specialDefinition.power <= specialBase.power,
      'efficiency salvage must not increase component energy demand'
    );
  } else if (specialBase.weapon) {
    assert(
      specialDefinition.weapon.shieldDamage >= specialBase.weapon.shieldDamage &&
        specialDefinition.weapon.hullDamage >= specialBase.weapon.hullDamage,
      'performance salvage must improve weapon damage'
    );
  }
  assert.equal(
    research.registerComponent(specialCandidate.type, specialCandidate.componentId),
    true,
    'selling a new bonus component must advance shared research'
  );
  const key = specialCandidate.type + ':' + specialBase.id;
  assert.equal(
    research.snapshot()[key][specialDefinition.salvageModifier],
    specialDefinition.salvageModifierPct,
    'research must remember the best bonus for this exact model and Mk tier'
  );
  assert(
    research
      .variants(specialCandidate.type, specialDefinition.tier)
      .some(
        (variant) =>
          variant.baseId === specialBase.id &&
          variant.salvageModifier === specialDefinition.salvageModifier &&
          variant.salvageModifierPct === specialDefinition.salvageModifierPct
      ),
    'discovered bonus must be available for the exact same component model'
  );
} else {
  assert.equal(
    specialDefinition.salvageModifier,
    undefined,
    'ordinary salvaged components must not have a bonus modifier'
  );
  assert.equal(
    research.registerComponent(specialCandidate.type, specialCandidate.componentId),
    false,
    'selling a normal component must not unlock a bonus'
  );
}

const navigation = navigationModule.createNavigationService(narrowsSector, 'haven', 420);
const eventPoint = { x: 4175, y: 3140 };
let snapshot = navigation.selectPointDestination('test-salvage-event', eventPoint);
assert.equal(snapshot.previewRoute?.toId, 'test-salvage-event');
assert.equal(snapshot.previewRoute?.points.at(-1).x, eventPoint.x);
navigation.startTravel();
for (let index = 0; index < 600 && navigation.getSnapshot().isTravelling; index += 1) {
  navigation.tick(0.1);
}
snapshot = navigation.getSnapshot();
assert.equal(snapshot.currentLocationId, 'test-salvage-event');
navigation.selectDestination('karth-industrial');
assert(
  navigation.getSnapshot().previewRoute,
  'after a dynamic salvage event the player must be able to plot a normal route from deep space'
);
navigation.startTravel();
assert(navigation.getSnapshot().isTravelling);

const distressEvents = eventModule.createSectorSalvageEventService(narrowsSector, 0x50a7a9e);
let distress = null;
for (let day = 0; day <= 12 && !distress; day += 1) {
  distressEvents.advanceDay(day, { x: 3500, y: 3000 }, true);
  distress = distressEvents.active.find((event) => event.type === 'distress-rescue') ?? null;
}
assert(distress);
const diagnosis = distressEvents.diagnoseDistress(distress.id);
assert(diagnosis?.success, 'distress call must support technical diagnosis');
assert.equal(distressEvents.event(distress.id)?.distressStage, 'diagnosed');

const controller = readModuleSource(root, 'src/app/game-controller.ts');
const controllerEvents = readModuleSource(root, 'src/app/game-controller-events.ts');
const starController = readModuleSource(root, 'src/app/game-controller-star-map.ts');
const portController = readModuleSource(root, 'src/app/game-controller-port.ts');
const shipyardTransactions = readModuleSource(
  root,
  'src/systems/ships/shipyard-component-transactions.ts'
);
const npcEvents = fs.readFileSync(
  path.join(root, 'src/systems/npcs/npc-salvage-event-service.ts'),
  'utf8'
);
assert(
  controller.includes('controllerSalvageEventCallbacks') &&
    controllerEvents.includes('mountControllerBoarding') &&
    controllerEvents.includes('createCrewBoardingEncounter') &&
    controllerEvents.includes('boardingRequired'),
  'distress traps must enter the real tactical crew boarding flow'
);
assert(
  starController.includes('economy.salvageEvents.playerVisible') &&
    starController.includes('selectPointDestination'),
  'active salvage events must appear as selectable dynamic world-map targets'
);
assert(
  portController.includes('sellShipyardComponent(shipyardTransactions(context), uid)') &&
    shipyardTransactions.includes('research.registerComponent') &&
    shipyardTransactions.includes('salvagedComponentAppraisal'),
  'player sale of salvage components must feed the shared shipyard research store'
);
assert(
  npcEvents.includes('claimForNpc') &&
    npcEvents.includes('startEventTravel') &&
    npcEvents.includes('startReturnTravel') &&
    npcEvents.includes('research.registerComponent') &&
    npcEvents.includes('tryNpcComponentUpgrade'),
  'NPC salvagers must claim events, fly to them, return to shipyards, share research and buy researched variants'
);

console.log(
  'PASS sector salvage events, event-only components, research, travel, NPCs and boarding'
);
