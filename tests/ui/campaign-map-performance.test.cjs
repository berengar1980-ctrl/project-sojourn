'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
for (const [file, minInterval] of [
  ['src/ui/map/star-map-panel.ts', 150],
  ['src/ui/local-space/local-space-panel.ts', 100],
  ['src/ui/salvage/salvage-space-panel.ts', 100],
]) {
  const source = read(file);
  const draw = source.indexOf('renderer.update(model);');
  const timing = source.indexOf('performance.now();', draw);
  assert(draw >= 0 && timing > draw, file + ': canvas updates must precede HUD throttle');
  if (file.includes('star-map-panel.ts')) {
    const throttle = /now - lastAuxiliaryUpdate >= (\\d+)/.exec(source);
    assert(
      throttle && Number(throttle[1]) >= minInterval,
      file + ': bounded HUD update interval'
    );
  } else {
    assert(source.includes(minInterval.toString()), file + ': bounded HUD update interval');
  }
}
console.log('PASS campaign map canvases remain responsive while HUD updates are reduced');
