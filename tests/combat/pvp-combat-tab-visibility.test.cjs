'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const tabs = read('src/ui/start/combat-test-tabs.ts');
const duel = read('src/ui/start/duel-lobby.ts');
const css = read('src/ui/start/start-menu.css');

assert(
  tabs.includes("container.className = 'harrow-combat-tests'") &&
    tabs.includes('tabs.hidden = active') &&
    tabs.includes("container.classList.toggle('is-combat-active', active)"),
  'the mode-selector bar must be hidden while a duel is active'
);
assert(
  tabs.includes('createDuelLobby(content, onBack, setCombatActive)') &&
    tabs.includes('setCombatActive(false)'),
  'duel mode must report its lifecycle and restore the menu on return'
);
assert(
  duel.includes('onCombatActiveChange(true)') &&
    duel.includes('onCombatActiveChange(false)') &&
    duel.includes('root.replaceChildren(shell)'),
  'starting a duel must hide tabs; returning must restore the original lobby'
);
assert(
  css.includes('.harrow-combat-tabs[hidden]') &&
    css.includes('.harrow-combat-tests.is-combat-active > .harrow-combat-tabs') &&
    css.includes('display: none;'),
  'hidden navigation must override its flex display'
);
assert(
  css.includes('.harrow-combat-tests {') &&
    css.includes('.harrow-combat-tabs__content {') &&
    css.includes('.harrow-combat-tabs__content > .strategic-combat-shell {') &&
    css.includes('height: 100%;') &&
    css.includes('body.app-has-system-bar .harrow-combat-tests'),
  'combat must use all available viewport height, including the console header layout'
);
assert(
  !css.includes('height: calc(100vh - 63px)'),
  'the lobby must size to the actual remaining space instead of a guessed tab height'
);
console.log('PASS PvP tabs disappear during duels and layout restores on return');
