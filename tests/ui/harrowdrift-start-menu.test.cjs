'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const bootstrap = read('src/app/bootstrap.ts');
const main = read('src/main.ts');
const menu = read('src/ui/start/start-menu.ts');
const css = read('src/ui/start/start-menu.css');
const duel = read('src/ui/start/duel-lobby.ts');
const html = read('index.html');

assert(bootstrap.includes('showMainMenu(root);'), 'game boots to the menu');
assert(bootstrap.includes("action === 'campaign'"), 'campaign opens the existing game');
assert(bootstrap.includes('createDuelLobby'), 'PvP enters the duel lobby');
assert(main.includes("import './ui/start/start-menu.css'"), 'menu CSS loaded');
assert(html.includes('<title>HARROWDRIFT</title>'));
assert(menu.includes("title.textContent = 'HARROWDRIFT'"));
for (const title of [
  'Kampagnenspiel',
  'PvP-Modus',
  'Kampagnen',
  'Speichern / Laden',
  'Optionen',
  'Beenden',
])
  assert(menu.includes(title), 'missing menu entry: ' + title);
assert(menu.includes('button.disabled = !entry.action'), 'future features must be disabled');
assert(css.includes("url('/startscreen-background.webp')"), 'use the original background as CSS');
assert(duel.includes('getAllShipDefinitions'), 'both players can select real ships');
const weaponCards = read('src/ui/start/duel-weapon-cards.ts');
assert(weaponCards.includes('fitsWeaponHardpoint'), 'weapon choices respect ship JSON');
assert(duel.includes('createStrategicCombatService'), 'duel starts existing combat engine');
assert(duel.includes('createStrategicCombatPanel'), 'duel uses existing combat visuals');
console.log('PASS Harrowdrift menu navigation and two-player duel setup contracts');
