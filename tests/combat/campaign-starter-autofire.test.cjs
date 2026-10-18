'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (p) => loadStandaloneTypeScriptModule(root, p);
const registry = load('src/systems/ships/ship-registry.ts');
const loadouts = load('src/systems/ships/ship-loadout-service.ts');
const combatants = load('src/app/game-controller-combat.ts');
const combat = load('src/systems/combat/strategic-combat-service.ts');
const npcUpgrades = load('src/systems/npcs/npc-upgrade-service.ts');
const componentService = load('src/systems/ships/ship-component-service.ts');

const ship = registry.getAllShipDefinitions().find((s) => s.role === 'salvage');
assert(ship, 'expected a campaign salvager');
const equipment = loadouts.createShipLoadoutService().get(ship);
assert.equal(
  equipment.weapon[0],
  'weapon-front-repeater-1',
  'salvager receives only a front repeater'
);
assert(equipment.weapon.slice(1).every((id) => !id), 'civilian mounts cannot be armed by default');
assert(
  componentService.calculateShipEnergy(equipment).combatFree >= 0,
  'starter equipment must not overload Mk I reactor'
);
const player = combatants.createPlayerCombatant(ship, { installed: equipment });
assert.equal(player.weapons.length, 1);
assert.equal(player.weapons[0].weapon.family, 'front_repeater');
assert.equal(player.weaponMounts[0].facing, 'forward');
assert.equal(player.weaponMounts[0].arcDegrees, 60);
const enemy = { ...player, id: 'enemy', name: 'Hostile', aiControlled: true };
const duel = combat.createStrategicCombatService(player, enemy, 1037, {
  width: 1800,
  height: 1200,
  attackerPosition: { x: 650, y: 600 },
  defenderPosition: { x: 950, y: 600 },
});
let sawFire = false;
for (let i = 0; i < 125 && !sawFire; i += 1) {
  const frame = duel.tick(0.08);
  sawFire = frame.beams.some((beam) => beam.owner === 'attacker');
}
assert(sawFire, 'the armed player must actually fire at a nearby pirate automatically');

const badLegacy = {
  job: 'pirate',
  pirate: true,
  shipId: ship.id,
  installedComponents: { weapon: ['weapon1', '', '', ''] },
};
const healed = npcUpgrades.ensureNpcInstalledComponents(badLegacy);
assert.equal(
  healed.weapon[0],
  'weapon-front-repeater-1',
  'a saved pirate with only an incompatible mount must regain its permitted front gun'
);
const validLegacy = {
  job: 'pirate',
  pirate: true,
  shipId: ship.id,
  installedComponents: { weapon: ['weapon-front-repeater-1', '', '', ''] },
};
npcUpgrades.ensureNpcInstalledComponents(validLegacy);
assert.deepEqual(
  validLegacy.installedComponents.weapon,
  ['weapon-front-repeater-1', '', '', ''],
  'already valid NPC front loadouts remain unchanged'
);
console.log('PASS front-only salvager auto-fire, reactor power and pirate starter recovery');
