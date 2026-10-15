'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const controllerRuntimeTypes = readModuleSource(root, 'src/app/game-controller-runtime-types.ts');
const portController = readModuleSource(root, 'src/app/game-controller-port.ts');
const starPanel = fs.readFileSync(path.join(root, 'src/ui/map/star-map-panel.ts'), 'utf8');
const portPanel = fs.readFileSync(path.join(root, 'src/ui/port/port-panel.ts'), 'utf8');
const portSecondaryPanes = fs.readFileSync(
  path.join(root, 'src/ui/port/port-secondary-panes.ts'),
  'utf8'
);
const portUi = portPanel + '\n' + portSecondaryPanes;
const styles = fs.readFileSync(path.join(root, 'src/ui/styles.css'), 'utf8');
const portModel = readModuleSource(root, 'src/features/port/port-view-model.ts');
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
assert(
  !portTypes.includes('PortCrewCandidate'),
  'ports must not carry fake crew candidate records'
);
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
  portUi.includes('SCHIFFSSTATIONEN') &&
    portUi.includes('CREW ZUWEISEN') &&
    portUi.includes('data-station-id'),
  'crew UI must expose real ship station assignment controls'
);
assert(
  portUi.includes('data-hire-crew-id') &&
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
    portPanel.includes('WO VERKAUFE ICH MEINE LADUNG?') &&
    portPanel.includes('data-sell-all-id') &&
    portPanel.includes('data-market-route'),
  'trade UI must expose cargo-first selling and system market route comparison'
);
assert(
  portPanel.includes('data-trade-view="cargo"') &&
    portPanel.includes('data-trade-view="market"') &&
    portPanel.includes('data-trade-view="system"') &&
    portPanel.includes('MEINE FRACHT') &&
    portPanel.includes('LOKALER MARKT') &&
    portPanel.includes('SYSTEMMARKT') &&
    !portPanel.includes('HANDELSROUTEN'),
  'trade UI must separate cargo, local market and system market instead of stacking route analysis'
);
assert(
  portPanel.includes('SEHR BILLIG') &&
    portPanel.includes('BILLIG') &&
    portPanel.includes('NORMAL') &&
    portPanel.includes('TEUER') &&
    portPanel.includes('SEHR TEUER') &&
    portPanel.includes('priceBand(row.pressurePercent)'),
  'local market must expose five immediately readable price bands'
);
assert(
  styles.includes('.port-system-row[hidden]') &&
    styles.includes('.port-system-summary[hidden]') &&
    styles.includes('display: none !important'),
  'system market CSS must not override resource filtering hidden state'
);

assert(
  portController.includes('sectorPorts.flatMap') &&
    portController.includes('expectation: produced.has(commodity.id)') &&
    portPanel.includes('KEINE MARKTDATEN') &&
    portPanel.includes('ERWARTUNG:') &&
    portPanel.includes('Sensorintel oder Besuch nötig') &&
    portModel.includes("intelStatus: 'unknown' | 'live' | 'recent' | 'aging' | 'stale'"),
  'system market must show structural expectations before exact intel exists'
);

assert(
  portPanel.includes('ZUM EINKAUF') &&
    portPanel.includes('ZUM VERKAUF') &&
    portPanel.includes('data-market-route'),
  'system market summary must expose quick route controls for best buy and sell'
);

assert(
  portPanel.includes('GÜNSTIGSTER BEKANNTER EINKAUF') &&
    portPanel.includes('BESTER BEKANNTER VERKAUF') &&
    portPanel.includes('GESCHÄTZTE MARGE') &&
    portPanel.includes('data-system-resource-summary') &&
    portPanel.includes('data-system-resource-select') &&
    portModel.includes("intelStatus: 'unknown' | 'live' | 'recent' | 'aging' | 'stale'"),
  'system market must combine route opportunity summary with aging market intelligence'
);
assert(
  portUi.includes('EINBAU / AUSTAUSCH') &&
    portUi.includes('data-component-slot-select') &&
    portController.includes('componentInventory.take(item.uid)'),
  'ship UI must equip inventory-owned modules rather than granting free weapons'
);
assert(
  portUi.includes('ANALYSIEREN') &&
    portUi.includes('FREIGESCHALTETE WERFTVARIANTEN') &&
    portUi.includes('data-sell-loose-component') &&
    portUi.includes('data-buy-yard-id') &&
    portController.includes('shipyardResearch.registerComponent') &&
    portController.includes('salvagedComponentAppraisal'),
  'shipyard must sell and research real salvage variants instead of showing fake upgrades'
);
assert(starPanel.includes('ANDOCKEN'), 'current dockable locations must expose docking');
assert(
  portPanel.includes('port-location-canvas') &&
    !portPanel.includes('model.locationName.slice(0, 1)') &&
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
  controllerRuntimeTypes.includes("'port'") && controllerRuntimeTypes.includes("'boarding'"),
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

assert(
  portUi.includes('aria-label="Schiffs- und Kampffähigkeiten"') &&
    portUi.includes('crew.skills.map((skill)') &&
    portUi.includes('FERNKAMPF ${crew.ranged}') &&
    portUi.includes('NAHKAMPF ${crew.melee}') &&
    !portUi.includes('crew.traits.map('),
  'recruit cards must show all seven station skills and both combat skills without social traits'
);
