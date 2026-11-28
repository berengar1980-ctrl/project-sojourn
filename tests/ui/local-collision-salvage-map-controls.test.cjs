'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const mapPanel = fs.readFileSync(path.join(root, 'src/ui/map/star-map-panel.ts'), 'utf8');
const mapRenderer = readModuleSource(root, 'src/ui/map/topdown-map-renderer.ts');
const miningNpc = readModuleSource(root, 'src/systems/npcs/npc-local-mining-service.ts');
const miningContacts = readModuleSource(root, 'src/systems/npcs/npc-local-mining-contacts.ts');
const rockFootprint = readModuleSource(root, 'src/systems/local-space/local-asteroid-footprint.ts');
const debrisContact = readModuleSource(root, 'src/systems/local-space/field-debris-contact.ts');
const salvageNpc = fs.readFileSync(
  path.join(root, 'src/systems/npcs/npc-local-salvage-service.ts'),
  'utf8'
);
const salvageContacts = readModuleSource(root, 'src/systems/npcs/npc-local-salvage-contacts.ts');
const salvagePanel = readModuleSource(root, 'src/ui/salvage/salvage-space-panel.ts');
const salvageControls = readModuleSource(root, 'src/ui/salvage/salvage-space-panel-controls.ts');
const salvageWorkSelector = readModuleSource(root, 'src/ui/salvage/salvage-work-selector.ts');

assert(
  mapPanel.includes('NAMEN // AN') &&
    mapPanel.includes('NAMEN // AUS') &&
    mapRenderer.includes('setLabelsVisible'),
  'star map must offer a persistent names on/off toggle'
);
assert(
  miningNpc.includes('resolveMinerCollisions(') &&
    miningContacts.includes('resolveShipShieldObstacleCollisions') &&
    miningContacts.includes('solidFieldRockObstacles(rocks)') &&
    rockFootprint.includes('filter((rock) => rock.routeBlocking)') &&
    miningContacts.includes('resolveShipFieldDebrisContacts') &&
    debrisContact.includes('resolveShieldCollisions('),
  'NPC miners must collide with local asteroids'
);
assert(
  salvageNpc.includes('resolveNpcSalvageLocalContacts') &&
    salvageContacts.includes('resolveShipShieldObstacleCollisions') &&
    salvageContacts.includes('resolveSalvageShieldContacts'),
  'player and NPC ships must collide with wrecks in salvage space'
);
assert(
  salvagePanel.includes('NAHBEREICHSSCAN ERFORDERLICH') &&
    salvagePanel.includes('ANFLUG FÜR NAHBEREICHSSCAN') &&
    salvageControls.includes('BERGUNG STARTEN') &&
    salvageWorkSelector.includes('BERGUNGSMODUL FEHLT'),
  'salvage UI must explain scanning, expose one central work action and missing equipment'
);
assert(
  salvagePanel.includes('new SalvageWorkSelector(') &&
    salvageWorkSelector.includes("container.addEventListener('click'") &&
    salvageWorkSelector.includes('button[data-work-choice]') &&
    salvageWorkSelector.includes('this.container.replaceChildren(heading, buttons, hint)') &&
    salvageWorkSelector.includes("startButton.addEventListener('click'"),
  'persistent selectable salvage work buttons must dispatch via the central start action'
);

console.log('PASS local collision wiring, star-map name toggle and salvage guidance');
