'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { economyResources } = loadStandaloneTypeScriptModule(
  root,
  'src/data/economy/economy-resources.ts'
);
const { narrowsSector } = loadStandaloneTypeScriptModule(root, 'src/data/maps/narrows-sector.ts');
const { sectorPorts } = loadStandaloneTypeScriptModule(root, 'src/data/ports/sector-ports.ts');

const resourceIds = new Set(economyResources.map((resource) => resource.id));
const rawIds = new Set(
  economyResources
    .filter((resource) => resource.categoryId === 'raw')
    .map((resource) => resource.id)
);
const produced = new Set(sectorPorts.flatMap((port) => port.producedCommodityIds));
const needed = new Set(sectorPorts.flatMap((port) => port.neededCommodityIds));
const mined = new Set(
  narrowsSector.locations.flatMap((location) => location.minedResourceIds ?? [])
);

assert.equal(economyResources.length, 56, 'sector economy must retain the full resource catalog');
assert(sectorPorts.length >= 18, 'expanded sector needs enough distinct trade economies');
assert(narrowsSector.locations.length >= 30, 'expanded sector needs meaningful travel scale');

for (const resource of economyResources) {
  assert(needed.has(resource.id), resource.id + ' must be required by at least one economy');
  if (resource.categoryId === 'raw') {
    assert(!produced.has(resource.id), resource.id + ' is ore and must not be industrially produced');
    assert(mined.has(resource.id), resource.id + ' must exist at a mining location');
  } else {
    assert(produced.has(resource.id), resource.id + ' must be produced by at least one economy');
  }
}

for (const resourceId of mined) {
  assert(resourceIds.has(resourceId), resourceId + ' mining deposit must reference a real resource');
  assert(rawIds.has(resourceId), resourceId + ' mining deposit must be a raw resource');
}

for (const port of sectorPorts) {
  const commodityIds = new Set(port.commodities.map((commodity) => commodity.id));
  for (const resourceId of [...port.producedCommodityIds, ...port.neededCommodityIds]) {
    assert(
      commodityIds.has(resourceId),
      port.locationId + ' must expose every produced or needed resource on its market'
    );
  }
  const location = narrowsSector.locations.find((entry) => entry.id === port.locationId);
  assert(location, port.locationId + ' port needs a world location');
  assert(
    location.activities.dock && location.activities.trade,
    port.locationId + ' must be dockable'
  );
}

const planets = narrowsSector.locations.filter((location) => location.kind === 'planet');
const moons = narrowsSector.locations.filter((location) => location.kind === 'moon');
const stations = narrowsSector.locations.filter((location) => location.kind === 'station');
const miningSites = narrowsSector.locations.filter((location) => location.activities.mine);
const salvageSites = narrowsSector.locations.filter((location) => location.activities.salvage);

assert(planets.length >= 8, 'sector needs several primary planets');
assert(moons.length >= 6, 'moons must be a meaningful part of the sector');
assert(stations.length >= 8, 'sector needs stations for trade, shipyards and outlaw activity');
assert(miningSites.length >= 6, 'sector needs multiple distinct mining destinations');
assert(salvageSites.length >= 3, 'sector needs multiple salvage destinations');
assert(sectorPorts.filter((port) => port.shipyard).length >= 2, 'sector needs multiple shipyards');

const innerPlanets = planets.filter((planet) => (planet.orbitRadius ?? Infinity) <= 520);
assert(
  innerPlanets.every((planet) => ['scorched', 'desert'].includes(planet.planetBiome)),
  'inner planets must be rocky or desert worlds'
);
const middlePlanets = planets.filter((planet) => {
  const orbit = planet.orbitRadius ?? 0;
  return orbit >= 650 && orbit <= 1000;
});
assert(
  middlePlanets.every((planet) => planet.planetBiome === 'temperate'),
  'middle system planets must use temperate Earth-like biomes'
);
const outerPlanets = planets.filter((planet) => (planet.orbitRadius ?? 0) >= 1050);
assert(
  outerPlanets.every((planet) => planet.planetBiome === 'ice'),
  'outer planets must be ice worlds'
);

const varras = sectorPorts.find((port) => port.locationId === 'varras-prime');
assert(
  varras?.neededCommodityIds.includes('water'),
  'desert world must strongly need imported water'
);
const waterSources = sectorPorts.filter((port) => port.producedCommodityIds.includes('water'));
assert(
  waterSources.some((port) => ['niveus', 'skadi'].includes(port.locationId)),
  'outer ice economies should supply water to dry inner worlds'
);

console.log('PASS sector scale, climate zones and complete resource economy coverage');
