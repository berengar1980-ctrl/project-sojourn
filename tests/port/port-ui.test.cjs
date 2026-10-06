'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
const starPanel = fs.readFileSync(path.join(root, 'src/ui/map/star-map-panel.ts'), 'utf8');
const portPanel = fs.readFileSync(path.join(root, 'src/ui/port/port-panel.ts'), 'utf8');
const portModel = fs.readFileSync(path.join(root, 'src/features/port/port-view-model.ts'), 'utf8');
const marketService = fs.readFileSync(
  path.join(root, 'src/systems/economy/market-service.ts'),
  'utf8'
);
const portData = fs.readFileSync(path.join(root, 'src/data/ports/sector-ports.ts'), 'utf8');
const { sectorPorts } = loadStandaloneTypeScriptModule(root, 'src/data/ports/sector-ports.ts');
const karth = sectorPorts.find((port) => port.locationId === 'karth-industrial');
const haven = sectorPorts.find((port) => port.locationId === 'haven');
const portTypes = fs.readFileSync(path.join(root, 'src/core/port-types.ts'), 'utf8');

assert(
  portTypes.includes('EconomyResourceId'),
  'port commodities must use shared stable economy resource ids'
);
assert(portTypes.includes('PortCrewCandidate'), 'port crew candidates must have domain data');
assert(karth?.shipyard, 'Karth Industrial must expose shipyard services');
assert.equal(
  haven?.shipyard,
  false,
  'ports without a shipyard must keep shipyard services unavailable'
);
assert(
  portData.includes('makePort'),
  'sector port data must use the shared market profile builder'
);
assert(
  marketService.includes('scarcity') &&
    marketService.includes('demandPressure') &&
    marketService.includes('productionPressure'),
  'market prices must reflect stock, demand and production'
);
assert(
  portModel.includes("{ id: 'trade', label: 'HANDEL', enabled: true }") &&
    portModel.includes("{ id: 'crew', label: 'CREW', enabled: true }") &&
    portModel.includes("{ id: 'equipment', label: 'AUSRÜSTUNG', enabled: true }") &&
    portModel.includes("{ id: 'shipyard', label: 'WERFT', enabled: port.shipyard }") &&
    portPanel.includes('data-port-tab='),
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
  controller.includes(
    "type SceneMode = 'star-map' | 'local-space' | 'salvage-space' | 'port'"
  ),
  'port must be a dedicated application scene'
);
assert(
  controller.includes('sectorPortByLocationId') && controller.includes('createPortViewModel'),
  'controller must resolve docked UI by stable location id'
);
assert(
  portPanel.includes('data-buy-id') && portPanel.includes('data-sell-id'),
  'market UI must expose real buy and sell transaction controls'
);
assert(
  portModel.includes('player.credits') && portModel.includes('cargoCapacity'),
  'port view must show persistent player credits and cargo capacity'
);

console.log('PASS docked port UI architecture and market presentation');
