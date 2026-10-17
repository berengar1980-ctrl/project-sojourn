'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const labels = loadStandaloneTypeScriptModule(root, 'src/core/weapon-hardpoint-labels.ts');
const source = path.join(root, 'src/data/ships/patrol-60m-variant-01.hardpoints.json');
const mounts = JSON.parse(fs.readFileSync(source, 'utf8')).weaponMounts;
const ordered = [...mounts].sort((a, b) => labels.weaponUiOrder(a) - labels.weaponUiOrder(b));

const slotOrder = ordered.map((mount) => mount.slotIndex).join(',');
const groupOrder = ordered.map(labels.weaponUiGroup).join(',');
assert.equal(slotOrder, '0,5,1,2,3,4', 'front pairs are displayed first');
assert.equal(groupOrder, 'front,front,port,starboard,turret,turret');

const cardsPath = path.join(root, 'src/ui/start/duel-weapon-cards.ts');
const lobbyPath = path.join(root, 'src/ui/start/duel-lobby.ts');
const hudPath = path.join(root, 'src/ui/combat/combat-weapon-telemetry-panel.ts');
const cards = fs.readFileSync(cardsPath, 'utf8');
const lobby = fs.readFileSync(lobbyPath, 'utf8');
const hud = fs.readFileSync(hudPath, 'utf8');

assert(cards.includes('nativeWeaponDamage'), 'show actual battle damage');
assert(cards.includes('fitsWeaponHardpoint'), 'preserve real mount restrictions');
assert(cards.includes('draft.weapons[mount.slotIndex]'), 'retain physical indices');
const statsRefresh = cards.includes('updateStats(stats, select.value, mount)');
assert(statsRefresh, 'stats refresh on selection');
assert(lobby.includes('buildDuelWeaponSections'), 'show grouped weapon slots');
assert(hud.includes('shieldDamageDealt') && hud.includes('hullDamageDealt'));
assert(hud.includes('cooldownRemaining') && hud.includes('shotsFired'));
console.log('PASS grouped duel hardpoints and combat weapon HUD');
