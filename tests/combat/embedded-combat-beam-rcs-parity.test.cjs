'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const native = read('src/ui/combat/fleet-native-combat-renderer.ts');
const beam = read('src/ui/combat/combat-beam-visual.ts');
const thrust = read('src/ui/combat/embedded-combat-thrusters.ts');
const mining = read('src/ui/local-space/local-space-scene-layers.ts');
const salvage = read('src/ui/salvage/salvage-scene-layers.ts');
const miningPlayer = read('src/ui/local-space/local-space-renderer.ts');
const miningEffects = read('src/ui/local-space/mining-effects-renderer.ts');
const salvagePlayer = read('src/ui/salvage/salvage-space-renderer.ts');
const service = read('src/systems/combat/strategic-combat-service.ts');
const bridge = read('src/app/game-controller-field-world-bridge.ts');

assert(native.includes('drawCombatBeamVisual('), 'shared native FleetCombat painter owns beam visuals');
assert(beam.includes("beam.family === 'pulse_laser'"));
assert(beam.includes("beam.family === 'railgun'"));
for (const field of [mining, salvage]) {
  assert(!field.includes('drawCombatBeamVisual('));
  assert(!field.includes('this.camera.worldToScreen(beam.origin, width, height)'));
  assert(!field.includes('this.camera.worldToScreen(beam.end, width, height)'));
  assert(!field.includes('beam.weaponIndex % weaponHardpoints.length'));
  assert(field.includes('drawFieldNpcThrusters('));
  assert(field.includes('combatDefender'));
}
assert(
  mining.includes('!npc.targetAsteroidId || this.model.combat?.defender.id === npc.id'),
  'a mining beam must stop for an NPC that is now in a duel'
);
assert(miningEffects.includes('model.combat || !model.laserActive'));
assert(miningEffects.includes('if (model.combat) return;'));
assert(thrust.includes('combatant.lateralThrust ?? 0'));
assert(thrust.includes('combatant.angularThrust'));
assert(thrust.includes('combatant.longitudinalThrust ?? 0'));
assert(thrust.includes('combatant.boostActive'));
assert(thrust.includes('engines.drawExhaust('));
assert(thrust.includes('maneuver.drawExhaust('));
for (const field of [miningPlayer, salvagePlayer]) {
  assert(field.includes('new FleetNativeCombatRenderer(') && field.includes('model.combat,'));
  assert(field.includes('drawFieldPlayerThrusters('));
  assert(field.includes('this.model.combat?.attacker ?? null'));
}
assert(service.includes('moveCombatant('));
assert(bridge.includes('context.engagements.activePlayerCombat()?.getSnapshot()'));
console.log('PASS native PvP combat beam renderer, RCS and boost used in both career maps');
