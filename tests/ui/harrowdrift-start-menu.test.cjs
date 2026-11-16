'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const bootstrap = read('src/app/bootstrap.ts');
const main = read('src/main.ts');
const menu = read('src/ui/start/start-menu.ts');
const css = read('src/ui/start/start-menu.css');
const duel = read('src/ui/start/duel-lobby.ts');
const html = read('index.html');

assert(
  bootstrap.includes('showMainMenu(root, createCampaignSelection(campaignPackages));'),
  'game boots with a campaign selection'
);
assert(bootstrap.includes("action === 'campaign'"), 'campaign opens the existing game');
assert(bootstrap.includes('createDuelLobby'), 'PvP enters the duel lobby');
assert(main.includes("import './ui/start/start-menu.css'"), 'menu CSS loaded');
assert(html.includes('<title>HARROWDRIFT</title>'));
assert(menu.includes("title.textContent = 'HARROWDRIFT'"));
for (const title of [
  'Neues Spiel',
  'PvP-Modus',
  'Kampagnen',
  'Karriere fortsetzen',
  'Spiel laden',
  'Optionen',
  'Beenden',
])
  assert(menu.includes(title), 'missing menu entry: ' + title);
assert(menu.includes("action: 'campaigns'"), 'campaign manager must be available');
assert(menu.includes("hasCareerSave ? { action: 'continue' as const } : {}"));
assert(menu.includes("hasCareerSave ? { action: 'load' as const } : {}"));
assert(bootstrap.includes("action === 'continue' || action === 'load'"));
assert(bootstrap.includes('onLoadCareer: () => {'));
assert(bootstrap.includes('const staged = prepareControllerCareer(result.snapshot)'));
assert(
  bootstrap.indexOf('const staged = prepareControllerCareer(result.snapshot)') <
    bootstrap.indexOf('game?.destroy();')
);
assert(settingsMarker());
function settingsMarker() {
  const source = read('src/ui/settings/settings-menu.ts');
  return (
    source.includes('SPIELSTAND LADEN') &&
    source.includes("load.addEventListener('click', onLoad)") &&
    source.includes('onLoadCareer();')
  );
}
assert(
  bootstrap.includes('prepareControllerCareer'),
  'saved game must stage before controller launch'
);
assert(
  bootstrap.includes('onCareerContextReady'),
  'saved campaign actions must bind after staging'
);
assert(menu.includes('button.disabled = !entry.action'), 'unimplemented features remain disabled');
const settings = read('src/ui/settings/settings-menu.ts');
assert(
  settings.includes('.settings-menu__main-menu:not([data-career-save]):not([data-career-load])')
);
assert(settings.includes("save.addEventListener('click', onSave)"));
assert(settings.includes("mainMenu.addEventListener('click', onMainMenu)"));
assert(css.includes("url('/startscreen-background.webp')"), 'use the original background as CSS');
assert(duel.includes('getAllShipDefinitions'), 'both players can select real ships');
const weaponCards = read('src/ui/start/duel-weapon-cards.ts');
assert(weaponCards.includes('fitsWeaponHardpoint'), 'weapon choices respect ship JSON');
assert(duel.includes('createStrategicCombatService'), 'duel starts existing combat engine');
assert(duel.includes('createStrategicCombatPanel'), 'duel uses existing combat visuals');
const labels = loadStandaloneTypeScriptModule(root, 'src/core/weapon-hardpoint-labels.ts');
const hardpointFile = 'src/data/ships/patrol-60m-variant-01.hardpoints.json';
const mounts = JSON.parse(read(hardpointFile)).weaponMounts;
const ordered = [...mounts].sort((a, b) => labels.weaponUiOrder(a) - labels.weaponUiOrder(b));
assert.equal(ordered.map((mount) => mount.slotIndex).join(','), '0,5,1,2,3,4');
const groupOrder = ordered.map(labels.weaponUiGroup).join(',');
assert.equal(groupOrder, 'front,front,port,starboard,turret,turret');
const stats = read('src/ui/start/duel-weapon-cards.ts');
assert(stats.includes('nativeWeaponDamage'), 'show actual combat damage');
assert(stats.includes('draft.weapons[mount.slotIndex]'), 'retain physical loadout indices');
assert(stats.includes('updateStats(stats, select.value, mount)'), 'live weapon selection');
const telemetry = read('src/ui/combat/combat-weapon-telemetry-panel.ts');
assert(telemetry.includes('shieldDamageDealt') && telemetry.includes('hullDamageDealt'));
assert(telemetry.includes('cooldownRemaining') && telemetry.includes('shotsFired'));

console.log('PASS Harrowdrift menu navigation and two-player duel setup contracts');
