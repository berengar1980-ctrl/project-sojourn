'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const wreck = source('src/ui/salvage/combat-wreck-mesh.ts');
const combat = source('src/ui/combat/combat-scrap-renderer.ts');
const destruction = source('src/ui/combat/combat-wreck-destruction-renderer.ts');
const mining = source('src/ui/local-space/local-combat-wreck-renderer.ts');

assert.match(wreck, /x: rotation\.x \+ timeSeconds \*/, 'x tumble uses elapsed visual time');
assert.match(wreck, /y: rotation\.y \+ timeSeconds \*/, 'y tumble uses elapsed visual time');
assert.match(wreck, /z: rotation\.z \+ timeSeconds \*/, 'z rotation must remain visible');
assert.match(wreck, /radius >= 24/, 'close zoom uses full mesh, not quantized sprite LOD');
assert.match(wreck, /driftingParts\.length/, 'detached sections have independent animation');
assert.match(wreck, /timeSeconds \* \(0\.17 \+ i \*/, 'chunks use independent angular speeds');
assert.match(combat, /radius, rotation, timeSeconds, seed/, 'combat passes visual clock and seed');
assert.match(destruction, /age,\s*arenaSeed\s*\)/, 'death animation passes elapsed time');
assert.match(mining, /performance\.now\(\) \/ 1000/, 'local field draws moving wrecks');
assert.match(wreck, /addCombatWreckDetail/, 'every model builds detailed geometry');
console.log('PASS destroyed ship rotation, fragment drift and full-detail LOD wiring');
