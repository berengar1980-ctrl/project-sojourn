'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
const starPanel = fs.readFileSync(path.join(root, 'src/ui/map/star-map-panel.ts'), 'utf8');
const portPanel = fs.readFileSync(path.join(root, 'src/ui/port/port-panel.ts'), 'utf8');
const portModel = fs.readFileSync(path.join(root, 'src/features/port/port-view-model.ts'), 'utf8');
const portData = fs.readFileSync(path.join(root, 'src/data/ports/tutorial-ports.ts'), 'utf8');
const portTypes = fs.readFileSync(path.join(root, 'src/core/port-types.ts'), 'utf8');

assert(portTypes.includes('CommodityId'), 'port commodities must use stable internal ids');
assert(portTypes.includes('PortCrewCandidate'), 'port crew candidates must have domain data');
assert(
  portData.includes("locationId: 'karth-forge'") && portData.includes('shipyard: true'),
  'Karth Forge must expose shipyard services'
);
assert(
  portData.includes("locationId: 'haven'") && portData.includes('shipyard: false'),
  'ports without a shipyard must keep shipyard services unavailable'
);
assert(
  portModel.includes('stockPressure') &&
    portModel.includes('demandPressure') &&
    portModel.includes('productionPressure'),
  'market prices must reflect stock, demand and production'
);
assert(
  portPanel.includes('data-port-tab="trade"') &&
    portPanel.includes('data-port-tab="crew"') &&
    portPanel.includes('data-port-tab="equipment"') &&
    portPanel.includes('data-port-tab="shipyard"'),
  'port UI must expose trade, crew, equipment and shipyard navigation'
);
assert(
  portPanel.includes('SCHIFFSSTATIONEN') && portPanel.includes('CREW ZUWEISEN'),
  'crew UI must expose ship station assignment slots'
);
assert(
  portPanel.includes('WERFT // KOMPONENTEN') && portPanel.includes('SCHIFFSKAUF'),
  'shipyard UI must separate components from ship purchases'
);
assert(
  portPanel.includes('STANDARDISIERTE PREISE') && portPanel.includes('KEINE HANDELSWARE'),
  'equipment UI must communicate non-arbitrage standardized pricing'
);
assert(starPanel.includes('ANDOCKEN'), 'current dockable locations must expose docking');
assert(
  controller.includes("type SceneMode = 'star-map' | 'local-space' | 'port'"),
  'port must be a dedicated application scene'
);
assert(
  controller.includes('tutorialPortByLocationId') && controller.includes('createPortViewModel'),
  'controller must resolve docked UI by stable location id'
);

console.log('PASS docked port UI architecture and market presentation');
