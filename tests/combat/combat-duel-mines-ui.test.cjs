'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const lobby = read('src/ui/start/duel-lobby.ts');
const setup = read('src/ui/start/duel-combatant-setup.ts');
const panel = read('src/ui/combat/fleet-native-combat-panel.ts');
const mines = read('src/systems/combat/strategic-combat-mines.ts');
assert(lobby.includes('mineSelectors(draft, rerender)'), 'mine selector exists for players');
assert(setup.includes('mines: draft.mines.flatMap'), 'mine loadout reaches combat setup');
assert(!lobby.includes('DUEL_ENCOUNTERS'), 'curated encounter setup removed from lobby');
assert(panel.includes('combatant.mineCount'), 'HUD shows real mine supply');
assert(panel.includes('Keine Minen ausgerüstet'), 'empty mine loadout is explained');
assert(mines.includes('tacticalMine'), 'equipped combat AI can deploy opportunistically');
console.log('PASS selectable mines, free duel and actual ammo visibility');
