'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const fog = loadStandaloneTypeScriptModule(root, 'src/ui/map/star-map-danger-fog-field.ts');
const center = { x: 520, y: 440 };
const green = {
  id: 'civilian-cloud',
  name: 'Civilian Cloud',
  center,
  radius: 350,
  dangerLevel: 1,
  lobes: [{ center, radiusX: 330, radiusY: 280 }],
};
const yellow = {
  id: 'trade-lane',
  name: 'Trade Lane',
  center: { x: 850, y: 440 },
  radius: 260,
  dangerLevel: 2,
  corridors: [{ from: { x: 520, y: 440 }, to: { x: 1200, y: 440 }, width: 180 }],
};
const red = {
  id: 'pirate-gap',
  name: 'Pirate Gap',
  center,
  radius: 120,
  dangerLevel: 3,
  lobes: [{ center, radiusX: 185, radiusY: 180 }],
};

const empty = fog.sampleDangerFog([], center);
assert.deepEqual(empty, { green: 0, yellow: 0, red: 0 });

const greenCenter = fog.sampleDangerFog([green], center).green;
const greenOutside = fog.sampleDangerFog([green], { x: 1450, y: 440 }).green;
assert(greenCenter > 0.55, 'civilian zone cores should retain visible green fog');
assert(greenOutside < 0.005, 'mist must fade away outside its real sector geography');

const yellowCenter = fog.sampleDangerFog([yellow], { x: 890, y: 440 }).yellow;
assert(yellowCenter > 0.55, 'trade corridors should form continuous yellow nebulae');
const gap = fog.sampleDangerFog([green, yellow, red], center);
const withoutGap = fog.sampleDangerFog([green, yellow], center);
assert(gap.red > 0.3, 'pirate gap must remain represented in the fog model');
assert(
  gap.green < withoutGap.green && gap.yellow < withoutGap.yellow,
  'red hotspots must carve green and yellow, not overpaint a darker red disc'
);

let previous = 0;
let largestStep = 0;
let colored = 0;
for (let x = 25; x <= 1450; x += 12) {
  const sample = fog.sampleDangerFog([green], { x, y: 440 }).green;
  if (sample > 0.05 && sample < 0.95) colored += 1;
  if (x > 25) largestStep = Math.max(largestStep, Math.abs(sample - previous));
  previous = sample;
}
assert(colored > 12, 'danger cloud must have a broad feathered edge rather than a sharp circle');
assert(largestStep < 0.3, 'danger cloud must not change abruptly between adjacent map pixels');

const renderer = readModuleSource(root, 'src/ui/map/star-map-danger-regions.ts');
assert(
  renderer.includes('ctx.fillRect(0, 0, width, height)'),
  'red ambient field must cover the full current viewport without square world edges'
);
const ambientStops = [
  ...renderer.matchAll(/ambient\.addColorStop\([^\n]*rgba\(\d+,\s*\d+,\s*\d+,\s*(0\.\d+)\)/g),
].map((match) => Number(match[1]));
assert.equal(
  ambientStops.length,
  3,
  'full-viewport red ambience needs three smooth gradient stops'
);
assert(
  ambientStops.every((alpha) => alpha >= 0.19 && alpha <= 0.27),
  'red danger must remain clearly perceptible without an opaque full-screen mask'
);
assert(
  renderer.includes('originX = -paddingX') && renderer.includes('originY = -paddingY'),
  'colored cloud atlas must extend past world boundaries'
);
assert(
  renderer.includes("buffer.band === 'red' && defaultDanger === 3 ? 0"),
  'Narrows must never paint extra dark red circles on its existing red background'
);
assert(!renderer.includes('highlightedPocket'), 'old darkened red hotspots must be removed');
assert(
  renderer.includes('sampleDangerFog('),
  'map must use organically feathered cloud influence instead of hard category pixels'
);

console.log(
  'PASS full-viewport red haze, organic feathered green/yellow corridors and un-darkened red pirate pockets'
);
