'use strict';

// node scripts/render-combat-trajectories.cjs report.json scenario seed output.svg
const fs = require('node:fs');
const [file, scenario, seedInput, output] = process.argv.slice(2);
if (!file || !scenario || !seedInput || !output) {
  console.error('Usage: node scripts/render-combat-trajectories.cjs report.json scenario seed output.svg');
  process.exit(2);
}
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const replay = report.results.find(
  (result) => result.case === scenario && result.seed === Number(seedInput)
);
if (!replay) throw new Error('Scenario/seed pair not found');
const width = 960;
const height = 600;
const scaleX = width / 2400;
const scaleY = height / 1500;
const coords = (points, side) => points.map((point) => {
  const [x, y] = point[side];
  return (x * scaleX).toFixed(2) + ',' + (y * scaleY).toFixed(2);
}).join(' ');
const safe = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const first = replay.trajectory[0];
const last = replay.trajectory[replay.trajectory.length - 1];
if (!first || !last) throw new Error('Empty trajectory');
const pin = (record, side, color, tag) => {
  const [x, y] = record[side];
  return '<circle cx="' + (x * scaleX).toFixed(2) + '" cy="' +
    (y * scaleY).toFixed(2) + '" r="6" fill="' + color +
    '" stroke="white" stroke-width="1.4"/>' +
    '<text x="' + (x * scaleX + 9).toFixed(2) + '" y="' +
    (y * scaleY - 9).toFixed(2) + '" font-size="13" fill="' + color +
    '">' + safe(tag) + '</text>';
};
const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">',
  '<rect width="960" height="640" fill="#101923"/>',
  '<text x="20" y="25" font-family="sans-serif" font-size="18" fill="white">' +
    safe(replay.case + ' · seed ' + replay.seed + ' · ' + replay.mode) + '</text>',
  '<g transform="translate(0 40)" font-family="sans-serif">',
  '<rect width="960" height="600" fill="#172634" stroke="#4c6374"/>',
  '<polyline fill="none" stroke="#65c8fd" stroke-width="2.4" points="' +
    coords(replay.trajectory, 'a') + '"/>',
  '<polyline fill="none" stroke="#ffab6b" stroke-width="2.4" points="' +
    coords(replay.trajectory, 'b') + '"/>',
  pin(first, 'a', '#65c8fd', 'A start'),
  pin(first, 'b', '#ffab6b', 'B start'),
  pin(last, 'a', '#65c8fd', 'A end'),
  pin(last, 'b', '#ffab6b', 'B end'),
  '</g></svg>',
].join('\n');
fs.writeFileSync(output, svg);
