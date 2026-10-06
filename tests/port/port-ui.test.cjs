'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
const portController = fs.readFileSync(path.join(root, 'src/app/game-controller-port.ts'), 'utf8');
const starPanel = fs.readFileSync(path.join(root, 'src/ui/map/star-map-panel.ts'), 'utf8');
const portPanel = fs.readFileSync(path.join(root, 'src/ui/port/port-panel.ts'), 'utf8');
const portModel = fs.readFileSync(path.join(root, 'src/features/port/port-view-model.ts'), 'utf8');
const portLocationRenderer = fs.readFileSync(
  path.join(root, 'src/ui/port/port-location-renderer.ts'),
  'utf8'
);
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
assert(!portTypes.includes('PortCrewCandidate'), 'ports must not carry fake crew candidate records');
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
  portPanel.includes('SCHIFFSSTATIONEN') &&
    portPanel.includes('CREW ZUWEISEN') &&
    portPanel.includes('data-station-id'),
  'crew UI must expose real ship station assignment controls'
);
assert(
  portPanel.includes('data-hire-crew-id') &&
    portController.includes('crew.hire') &&
    portController.includes('crew.assign'),
  'crew UI must hire and assign through the persistent crew roster'
);
assert(
  portController.includes('availableDefinitions().map(createCrewMember)') &&
    portModel.includes('crewState.available.map(crewMemberView)'),
  'port recruit cards must be derived from the migrated crew catalog'
);
assert(
  portPanel.includes('SYSTEMMARKT') &&
    portPanel.includes('FRACHT VERKAUFEN') &&
    portPanel.includes('data-sell-all-id') &&
    portPanel.includes('data-market-route'),
  'trade UI must expose cargo-first selling and system market route comparison'
);
assert(
  portPanel.includes('HANDELSROUTEN') &&
    portPanel.includes('GÜNSTIG KAUFEN') &&
    portPanel.includes('TEUER VERKAUFEN') &&
    portPanel.includes('KURS ZUM KAUF') &&
    portPanel.includes('KURS ZUM VERKAUF') &&
    portModel.includes('tradeOpportunities'),
  'trade UI must show cheapest-buy to best-sell opportunities with direct course actions'
);

assert(
  portPanel.includes('Preiswissen verfällt') &&
    portPanel.includes('data-system-resource-select') &&
    portModel.includes("intelStatus: 'live' | 'recent' | 'aging' | 'stale'"),
  'system market UI must surface aging market intelligence'
);
assert(
  portPanel.includes('STARTAUSSTATTUNG MK I') &&
    portPanel.includes('data-component-type="weapon"') &&
    portPanel.includes('LIGHT LASER MK I MONTIEREN'),
  'ship UI must show the real ship and allow Mk I weapon slot mounting'
);
assert(
  portPanel.includes('keine erfundenen T2/T3-Upgrades'),
  'shipyard must not display fake higher-tier component upgrades'
);
assert(starPanel.includes('ANDOCKEN'), 'current dockable locations must expose docking');
assert(
  portPanel.includes('port-location-canvas') &&
    !portPanel.includes("model.locationName.slice(0, 1)") &&
    portLocationRenderer.includes('ProceduralSpaceBodyRenderer') &&
    portLocationRenderer.includes('PlanetRingRenderer') &&
    portLocationRenderer.includes('ProceduralStationRenderer') &&
    portLocationRenderer.includes("detailLevel: 'dock'") &&
    portLocationRenderer.includes('drawPlanet'),
  'docked location hero must reuse the star-map planet and station renderers instead of a placeholder'
);
assert(
  portModel.includes('locationVisual') &&
    portModel.includes('planetBiome: location.planetBiome') &&
    portModel.includes('ringStyle: location.ringStyle') &&
    portModel.includes('starPosition.x - location.position.x') &&
    portController.includes('narrowsSector.star.position'),
  'docked visuals must preserve the star-map identity, biome, rings and star-relative lighting'
);
assert(
  controller.includes("type SceneMode = 'star-map' | 'local-space' | 'salvage-space' | 'port'"),
  'port must be a dedicated application scene'
);
assert(
  portController.includes('sectorPortByLocationId') &&
    portController.includes('createPortViewModel'),
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
