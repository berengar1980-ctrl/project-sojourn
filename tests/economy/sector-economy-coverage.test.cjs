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
assert(sectorPorts.length >= 16, 'sector needs enough distinct trade economies');
assert(narrowsSector.locations.length >= 27, 'sector needs meaningful travel scale');

for (const resource of economyResources) {
  assert(needed.has(resource.id), resource.id + ' must be required by at least one economy');
  if (resource.categoryId === 'raw') {
    assert(
      !produced.has(resource.id),
      resource.id + ' is ore and must not be industrially produced'
    );
    assert(mined.has(resource.id), resource.id + ' must exist at a mining location');
  } else {
    assert(produced.has(resource.id), resource.id + ' must be produced by at least one economy');
  }
}

for (const resourceId of mined) {
  assert(
    resourceIds.has(resourceId),
    resourceId + ' mining deposit must reference a real resource'
  );
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

assert(planets.length >= 11, 'planets must dominate the sector hierarchy');
assert.equal(moons.length, 1, 'sector map must avoid moon clutter');
assert.equal(stations.length, 7, 'stations must stay readable at sector scale');
assert(miningSites.length >= 6, 'sector needs multiple distinct mining destinations');
assert(salvageSites.length >= 3, 'sector needs multiple salvage destinations');
assert(sectorPorts.filter((port) => port.shipyard).length >= 2, 'sector needs multiple shipyards');
assert.equal(narrowsSector.regions.length, 0, 'decorative danger regions must not clutter the map');
for (const stationId of ['helix-shipyards', 'coldwater-station']) {
  const station = stations.find((entry) => entry.id === stationId);
  assert(station, stationId + ' must remain in the sector');
  assert.equal(station.parentLocationId, undefined, stationId + ' must be a free-space station');
  assert.equal(station.orbitRadius, undefined, stationId + ' must not render as a planetary orbit');
}

const innerPlanets = planets.filter((planet) => (planet.orbitRadius ?? Infinity) <= 900);
assert(
  innerPlanets.every((planet) => ['scorched', 'desert'].includes(planet.planetBiome)),
  'inner planets must be rocky or desert worlds'
);
const middlePlanets = planets.filter((planet) => {
  const orbit = planet.orbitRadius ?? 0;
  return orbit >= 1100 && orbit <= 2050;
});
assert(
  middlePlanets.every((planet) => planet.planetBiome === 'temperate'),
  'middle system planets must use temperate Earth-like biomes'
);
const outerPlanets = planets.filter((planet) => (planet.orbitRadius ?? 0) >= 2200);
assert(
  outerPlanets.every((planet) => ['ice', 'gas-giant'].includes(planet.planetBiome)),
  'outer planets must be ice worlds or gas giants'
);

const planetRadii = planets.map((planet) => planet.radius);
const cinderPlanet = planets.find((planet) => planet.id === 'cinder');
const havenPlanet = planets.find((planet) => planet.id === 'haven');
assert(cinderPlanet && havenPlanet, 'Cinder and Haven must remain in the sector');
assert.equal(
  Math.min(...planetRadii),
  cinderPlanet.radius,
  'Cinder must remain the smallest planet'
);
assert.equal(Math.max(...planetRadii), havenPlanet.radius, 'Haven must remain the largest planet');
let minimumPlanetSpacing = Infinity;
for (let index = 0; index < planets.length; index += 1) {
  for (let otherIndex = index + 1; otherIndex < planets.length; otherIndex += 1) {
    const planet = planets[index];
    const other = planets[otherIndex];
    const spacing = Math.hypot(
      planet.position.x - other.position.x,
      planet.position.y - other.position.y
    );
    minimumPlanetSpacing = Math.min(minimumPlanetSpacing, spacing);
  }
}
assert(minimumPlanetSpacing >= 900, 'planets must stay clearly separated on the sector map');
assert((cinderPlanet.orbitRadius ?? 0) >= 600, 'Cinder must not sit directly beside Solis');
assert.equal(
  moons[0]?.parentLocationId,
  'pale-reach',
  'the single moon should remain attached to Pale Reach'
);
assert(
  planets.some((planet) => planet.ringStyle === 'broad') &&
    planets.some((planet) => planet.ringStyle === 'asteroid'),
  'sector needs both a ringed giant and a rocky planetary ring'
);
assert(
  new Set(stations.map((station) => station.stationType)).size >= 5,
  'stations need multiple visual roles'
);

const varras = sectorPorts.find((port) => port.locationId === 'varras-prime');
assert(
  varras?.neededCommodityIds.includes('water'),
  'desert world must strongly need imported water'
);
const waterSources = sectorPorts.filter((port) => port.producedCommodityIds.includes('water'));
assert(
  waterSources.some((port) => port.locationId === 'niveus'),
  'Niveus should supply water to dry inner worlds'
);

console.log('PASS sector scale, climate zones and complete resource economy coverage');
