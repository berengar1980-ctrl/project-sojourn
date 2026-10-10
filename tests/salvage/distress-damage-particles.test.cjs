'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { DistressDamageParticles } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/salvage/distress-damage-particles.ts'
);
const particles = new DistressDamageParticles();
const context = {
  save() {},
  restore() {},
  beginPath() {},
  arc() {},
  fill() {},
  set globalAlpha(_) {},
  set fillStyle(_) {},
};
const camera = { worldToScreen: (p) => p, scale: (n) => n };
for (let i = 1; i <= 80; i++) {
  particles.update(i / 20, { x: i * 4, y: 0 }, i * 0.02, 80, camera, context, 800, 600);
}
assert.equal(particles.intensity, 1, 'damage must remain active before repair');
particles.beginExtinguish();
for (let i = 81; i <= 210; i++) {
  particles.update(i / 20, { x: 320 + i, y: 0 }, 0, 80, camera, context, 800, 600);
}
assert(particles.intensity <= 0.01, 'fire and smoke emission must fade to zero');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
assert(read('src/ui/salvage/distress-damage-particles.ts').includes('vx * 0.55'));
assert(read('src/ui/salvage/distress-damage-particles.ts').includes('SOURCES = ['));
assert(read('src/app/game-controller-events.ts').includes('beginDistressRepair()'));
assert(read('src/ui/salvage/salvage-space-renderer.ts').includes('distressParticles.drawScene('));
console.log('PASS 3 distress emitters, inertia, and gradual repair extinguishing');
