'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { drawLocalNpcCombatEffects } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/local-space/local-space-npc-combat-effects.ts'
);
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const calls = [];
const ctx = {
  beginPath: () => calls.push('beginPath'),
  moveTo: () => calls.push('moveTo'),
  lineTo: () => calls.push('lineTo'),
  stroke: () => calls.push('stroke'),
};
const camera = { worldToScreen: (point) => point, scale: (radius) => radius };
const beam = {
  id: 5,
  family: 'pulse_laser',
  ttlSeconds: 0.18,
  maxTtlSeconds: 0.2,
  origin: { x: 10, y: 20 },
  end: { x: 100, y: 200 },
};
const finished = {
  winner: 'attacker',
  attacker: { id: 'pirate' },
  defender: { id: 'security-drone:field' },
  beams: [beam],
  projectiles: [],
  elapsedSeconds: 12,
  recentImpacts: [],
  lastImpact: null,
};
drawLocalNpcCombatEffects(ctx, camera, [finished], 800, 600);
assert.equal(calls.length, 0, 'A finished NPC duel must never display frozen beams');
drawLocalNpcCombatEffects(
  ctx,
  camera,
  [{ ...finished, winner: null, beams: [{ ...beam, ttlSeconds: 0 }] }],
  800,
  600
);
assert.equal(calls.length, 0, 'Expired laser/tractor beams must not display at all');
const native = source('src/ui/combat/fleet-native-combat-renderer.ts');
const grapple = source('src/ui/combat/combat-grapple-renderer.ts');
assert(
  native.includes('if (this.model.winner !== null) return;') &&
    native.includes('this.model.winner === null ? this.model.thrownAsteroids : []'),
  'Native renderer must also suppress frozen beams, projectiles and tractor throws'
);
assert(
  grapple.includes('if (!grapple || model.winner !== null) return;'),
  'Resolved combat may not leave a permanent grapple or tractor tether'
);
console.log('PASS completed combat clears local and native laser/tractor VFX');
