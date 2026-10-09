'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { createDistressTowState, advanceDistressTow, towShipAtExit } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/distress-tow-physics.ts'
);
let tow = createDistressTowState({ x: 1250, y: 950 });
assert.equal(tow.attached, false, 'the hook must fly before connecting');
for (let i = 0; i < 15; i += 1) {
  tow = advanceDistressTow(tow, { x: 1500, y: 950 }, 0, 0.05);
}
assert.equal(tow.attached, true, 'the grapple must attach after launch animation');
const before = tow.position.x;
let maximumTension = 0;
for (let i = 0; i < 45; i += 1) {
  tow = advanceDistressTow(tow, { x: 1900, y: 950 }, 0, 0.05);
  maximumTension = Math.max(maximumTension, tow.cableTension);
}
assert(tow.position.x > before, 'towing craft must accelerate toward a moving player');
assert(maximumTension > 0, 'extended rope must become tense during acceleration');
const initialVelocity = tow.velocity.x;
tow = advanceDistressTow(tow, { x: 1600, y: 950 }, Math.PI, 0.05);
assert(tow.velocity.x > 0, 'heavy towed ship must drift forward when the player brakes or turns');
assert(initialVelocity > 0);
assert.equal(towShipAtExit({ x: 3000, y: 950 }, tow, { x: 3000, y: 950 }), false);
assert.equal(
  towShipAtExit(
    { x: 3000, y: 950 },
    { ...tow, position: { x: 2850, y: 950 } },
    { x: 3000, y: 950 }
  ),
  true
);
assert.equal(
  towShipAtExit({ x: 3000, y: 950 }, { ...tow, attached: false }, { x: 3000, y: 950 }),
  false
);

const renderer = fs.readFileSync(path.join(root, 'src/ui/salvage/distress-tow-renderer.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller-salvage.ts'), 'utf8');
assert(renderer.includes('grapplingHooks'));
assert(renderer.includes('quadraticCurveTo'));
const registry = fs.readFileSync(path.join(root, 'src/systems/ships/ship-registry.ts'), 'utf8');
assert(registry.includes('points.pivot.x - points.sourceWidth * 0.24'));
assert(controller.includes('advanceDistressTow('));
assert(controller.includes('towShipAtExit('));
console.log('PASS grapple launch, inertial tow drift, cable tension and two-ship exit gate');
