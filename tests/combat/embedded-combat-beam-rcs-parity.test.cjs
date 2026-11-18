'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const native = read('src/ui/combat/strategic-combat-renderer.ts');
const beam = read('src/ui/combat/combat-beam-visual.ts');
const thrust = read('src/ui/combat/embedded-combat-thrusters.ts');
const mining = read('src/ui/local-space/local-space-scene-layers.ts');
const salvage = read('src/ui/salvage/salvage-scene-layers.ts');
const miningPlayer = read('src/ui/local-space/local-space-renderer.ts');
const salvagePlayer = read('src/ui/salvage/salvage-space-renderer.ts');
const service = read('src/systems/combat/strategic-combat-service.ts');
const bridge = read('src/app/game-controller-field-world-bridge.ts');

assert(native.includes('drawCombatBeamVisual(this.context, beam, start, end)'));
assert(beam.includes("beam.family === 'pulse_laser'"));
assert(beam.includes("beam.family === 'railgun'"));
for (const field of [mining, salvage]) {
  assert(field.includes('drawCombatBeamVisual('));
  assert(field.includes('this.camera.worldToScreen(beam.origin, width, height)'));
  assert(field.includes('this.camera.worldToScreen(beam.end, width, height)'));
  assert(!field.includes('beam.weaponIndex % weaponHardpoints.length'));
  assert(field.includes('drawEmbeddedCombatThrusters('));
  assert(field.includes('combatDefender'));
}
assert(
  mining.includes('npc.targetAsteroidId && !combatDefender'),
  'a mining beam must stop for an NPC that is now in a duel'
);
assert(thrust.includes('combatant.lateralThrust ?? 0'));
assert(thrust.includes('combatant.angularThrust'));
assert(thrust.includes('combatant.longitudinalThrust ?? 0'));
assert(thrust.includes('combatant.boostActive'));
assert(thrust.includes('engines.drawExhaust('));
assert(thrust.includes('maneuver.drawExhaust('));
for (const field of [miningPlayer, salvagePlayer]) {
  assert(field.includes('drawFieldPlayerThrusters('));
  assert(field.includes('this.model.combat?.attacker ?? null'));
}
assert(service.includes('moveCombatant('));
assert(bridge.includes('context.engagements.activePlayerCombat()?.getSnapshot()'));
console.log('PASS embedded beam origins, shared weapon effects, combat RCS and boost telemetry');
