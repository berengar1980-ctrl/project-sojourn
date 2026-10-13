'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { DUEL_ENCOUNTERS } = loadStandaloneTypeScriptModule(root, 'src/ui/start/duel-presets.ts');
assert.equal(DUEL_ENCOUNTERS.length, 9);
assert.deepEqual(
  DUEL_ENCOUNTERS.map((item) => item.seed),
  [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009]
);
const source = fs.readFileSync(path.join(root, 'src/ui/start/duel-preset-analysis.ts'), 'utf8');
assert(source.includes('resolveDuelPreset(preset, ships)'), 'analysis uses real preset weapons');
assert(/duelCombatant\s*\(\s*index\s*,/.test(source), 'analysis uses real lobby setups');
assert(source.includes('createDuelArena(map, seed)'), 'seed controls deterministic arena');
assert(source.includes("preset.id === 'alpha'"), 'Alpha analysis matches its lobby balance');
const lobby = fs.readFileSync(path.join(root, 'src/ui/start/duel-lobby.ts'), 'utf8');
assert(lobby.includes("'Alle 9 analysieren'"), 'batch analysis is accessible');
assert(lobby.includes("'Analyse exportieren'"), 'single analysis can be downloaded');
console.log('PASS nine deterministic duel presets use lobby setup and expose text exports');
