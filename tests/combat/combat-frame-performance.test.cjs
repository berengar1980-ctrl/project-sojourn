'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (pathName) => fs.readFileSync(path.join(root, pathName), 'utf8');
const panel = read('src/ui/combat/fleet-native-combat-panel.ts');
const lobby = read('src/ui/start/duel-lobby.ts');
assert(
  panel.includes('if (model.elapsedSeconds - lastHudTime < 0.1 && model.winner === null) return;'),
  'HTML HUD updates are throttled while the canvas renders at frame rate'
);
assert(
  panel.indexOf('renderer.update(') < panel.indexOf('if (model.elapsedSeconds - lastHudTime'),
  'canvas must render even when HUD is throttled'
);
assert(
  lobby.includes('generation !== duelGeneration'),
  'stale duel frame callbacks cannot continue into another match'
);
assert(
  lobby.includes('activePanel?.destroy();'),
  'previous canvas resources are destroyed when restarting'
);
assert(
  lobby.includes('simulationMs:') && lobby.includes('renderMs:'),
  'long frames distinguish simulation stalls from rendering stalls'
);
console.log('PASS combat frame-loop lifecycle and HUD performance contracts');
