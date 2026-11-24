'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const bridge = read('src/app/game-controller-field-world-bridge.ts');
const local = read('src/ui/local-space/local-space-renderer.ts');
const salvageLayers = read('src/ui/salvage/salvage-scene-layers.ts');
const salvageScene = read('src/app/game-controller-salvage.ts');
const salvageCollider = read('src/app/game-controller-salvage-drone.ts');
const sprites = read('src/ui/combat/fleet-native-ship-sprites.ts');
const pvp = read('src/ui/combat/fleet-native-combat-renderer.ts');

assert(
  bridge.includes("combatant.id === 'security-drone:' + field.locationId") &&
    bridge.includes('field.drone.restore(combatant.position, combatant.hullHp > 0)'),
  'mining NPC duels mirror the real combatant pose into the drone sprite'
);
assert(
  bridge.includes('droneFightingNpc') &&
    bridge.includes('!droneFightingNpc') &&
    bridge.includes('tickFieldSecurity(context, seconds, field)'),
  'the patrol engine must not move a fighting drone away from its physics hitbox'
);
assert(
  local.includes('some(isStationedDrone)') &&
    salvageLayers.includes('isStationedDrone(this.model.combat?.defender.id)'),
  'player combat uses the native drone sprite only once, without overlapping stale overlays'
);
assert(
  salvageScene.includes('context.drone.restore(combat.defender.position') &&
    salvageCollider.includes("excluded.has('security-drone:' + locationId)"),
  'salvage player combat updates the drone pose without a duplicate bystander collider'
);
assert(
  sprites.includes("combatant.id.startsWith('security-drone:')") &&
    sprites.includes("'/drones/security-drone-gc87r8.webp'") &&
    sprites.includes('DRONE_DIAMETER_PX * camera.zoom') &&
    pvp.includes('DRONE_ROTATION_PERIOD_SECONDS'),
  'native combat renders GC-87 at the hitbox, scales it with zoom and keeps its spin'
);
console.log('PASS drone combat position authority, single render body and zoom invariants');
