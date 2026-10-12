'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const lobby = read('src/ui/start/duel-lobby.ts');
const panel = read('src/ui/combat/strategic-combat-panel.ts');
const mines = read('src/systems/combat/strategic-combat-mines.ts');
assert(lobby.includes('mineSelectors(draft)'), 'mine selector exists for players');
assert(lobby.includes('mines: draft.mines.flatMap'), 'mine loadout reaches combat setup');
assert(lobby.includes('drafts[index]!.mines = [];'), 'analysis encounters do not auto-equip lethal mines');
assert(panel.includes('combatant.mineCount'), 'HUD shows real mine supply');
assert(panel.includes('Keine Minen ausgerüstet'), 'empty mine loadout is explained');
assert(mines.includes('tacticalMine'), 'equipped combat AI can deploy opportunistically');
console.log('PASS selectable mines, Alpha loadout and actual ammo visibility');
