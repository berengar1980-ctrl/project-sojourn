'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { createStationLayout } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/space/station-layout-generator.ts'
);

const requiredByType = {
  trade: ['dock', 'cargo', 'habitat'],
  shipyard: ['dock', 'dock', 'cargo', 'radiator'],
  military: ['armor', 'armor', 'sensor', 'dock'],
  refinery: ['tank', 'tank', 'radiator', 'dock'],
  research: ['sensor', 'radiator', 'habitat', 'dock'],
  pirate: ['cargo', 'tank', 'dock', 'armor'],
  utility: ['utility', 'habitat', 'dock'],
};

function counts(values) {
  return values.reduce((out, value) => {
    out[value] = (out[value] || 0) + 1;
    return out;
  }, {});
}

for (const [type, required] of Object.entries(requiredByType)) {
  const first = createStationLayout('test-' + type, type);
  const second = createStationLayout('test-' + type, type);
  assert.equal(
    JSON.stringify(first),
    JSON.stringify(second),
    type + ' station layout must be deterministic for the same id'
  );
  assert(first.arms.length >= 3, type + ' station must have a structural arm network');
  assert(first.modules.length >= 5, type + ' station must carry visible external modules');

  const actual = counts(first.modules.map((module) => module.kind));
  const expected = counts(required);
  for (const [kind, minimum] of Object.entries(expected)) {
    assert(
      (actual[kind] || 0) >= minimum,
      type + ' station must preserve its role-specific ' + kind + ' modules'
    );
  }
}

assert.notEqual(
  JSON.stringify(createStationLayout('trade-alpha', 'trade')),
  JSON.stringify(createStationLayout('trade-beta', 'trade')),
  'different station ids must produce different persistent silhouettes'
);

const renderer = fs.readFileSync(
  path.join(root, 'src/ui/space/procedural-station-renderer.ts'),
  'utf8'
);
const mapRenderer = fs.readFileSync(
  path.join(root, 'src/ui/map/topdown-map-renderer.ts'),
  'utf8'
);
const dockRenderer = fs.readFileSync(
  path.join(root, 'src/ui/port/port-location-renderer.ts'),
  'utf8'
);

assert(
  renderer.includes("detailLevel === 'dock'") &&
    renderer.includes('drawServiceDetails') &&
    renderer.includes('drawWear') &&
    renderer.includes('spriteCanvas') &&
    renderer.includes('spriteContext') &&
    renderer.includes("globalCompositeOperation = 'destination-out'") &&
    renderer.includes("globalCompositeOperation = 'source-atop'") &&
    renderer.includes('this.context.drawImage'),
  'station cutouts and lighting must be composited on a transparent sprite before reaching the map'
);
assert(
  mapRenderer.includes('ProceduralStationRenderer') &&
    mapRenderer.includes("detailLevel: 'map'") &&
    dockRenderer.includes('ProceduralStationRenderer') &&
    dockRenderer.includes("detailLevel: 'dock'"),
  'star map and dock view must render the same procedural station layout at different detail levels'
);
assert(
  !mapRenderer.includes('StationSymbolRenderer') &&
    !dockRenderer.includes('StationSymbolRenderer'),
  'physical station views must no longer fall back to the old abstract station symbols'
);

console.log('PASS deterministic modular procedural station visuals');
