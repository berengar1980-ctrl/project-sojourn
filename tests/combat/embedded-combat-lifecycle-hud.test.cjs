'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const controller = read('src/app/game-controller.ts');
const combatGuard = read('src/app/game-controller-combat-result-guard.ts');
const state = read('src/app/game-controller-initial-state.ts');
const resolution = read('src/app/game-controller-combat-resolution.ts');
const boarding = read('src/app/game-controller-combat-boarding.ts');
const security = read('src/app/game-controller-security.ts');
const engagement = read('src/systems/combat/star-map-engagement-service.ts');
const miningPanel = read('src/ui/local-space/local-space-panel.ts');
const salvagePanel = read('src/ui/salvage/salvage-space-panel.ts');
const sharedHud = read('src/ui/combat/embedded-combat-hud.ts');
const duelHud = read('src/ui/combat/fleet-native-combat-panel.ts');
const styles = read('src/ui/styles.css');

assert(state.includes('combatResultPending: false'));
assert(state.includes('combatReengageSeconds: 0'));
assert(
  controller.includes('skipControllerTickForCombatResult(context, deltaSeconds)') &&
    combatGuard.includes('if (state.combatResultPending) return true;'),
  'a combat result dialog must pause campaign ticks and encounter scheduling'
);
assert(
  controller.includes('mayInterceptPlayer:') &&
    engagement.includes('runtime.options.mayInterceptPlayer?.(npc) !== false'),
  'only player interceptions are delayed; NPC-on-NPC fights stay live'
);
assert(
  security.includes('context.state.combatReengageSeconds <= 0') &&
    security.includes('context.engagements.activePlayerCombat()'),
  'local pirates must not rush the player while their duel is running or recovering'
);
assert(
  resolution.includes('state.combatResultPending = true;') &&
    resolution.includes('state.combatResultPending = false;') &&
    resolution.includes('state.combatReengageSeconds = 8;'),
  'embedded battle result must be an atomic modal return'
);
assert(
  boarding.includes('combatResultPending = true;') &&
    boarding.includes('combatResultPending = false;'),
  'boarded and standalone battles must use the same modal result protection'
);
assert(
  duelHud.includes('export function combatantHud(') &&
    sharedHud.includes('combatantHud(snapshot.attacker, snapshot.elapsedSeconds)') &&
    sharedHud.includes('combatantHud(snapshot.defender, snapshot.elapsedSeconds)'),
  'embedded combat must reuse native duel shield, subsystem and weapon telemetry'
);
assert(
  miningPanel.includes('createEmbeddedCombatHud(shell)') &&
    salvagePanel.includes('createEmbeddedCombatHud(shell)'),
  'mining and salvage scenes must share the same combat HUD'
);
assert(
  styles.includes('.local-space-shell.is-embedded-combat .embedded-combat-hud') &&
    styles.includes('.local-space-shell.is-embedded-combat .local-operations-dock'),
  'noncombat panels must fade out and the duel HUD fade in'
);
console.log('PASS embedded combat result lifecycle, reengagement and shared duel HUD');
