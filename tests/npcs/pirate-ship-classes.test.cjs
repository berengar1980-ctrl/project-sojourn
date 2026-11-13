'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const economy = loadStandaloneTypeScriptModule(root, 'src/data/economy/sector-npc-economy.ts');
const combat = loadStandaloneTypeScriptModule(root, 'src/systems/combat/npc-combatant-setup.ts');
const upgrade = loadStandaloneTypeScriptModule(root, 'src/systems/npcs/npc-upgrade-service.ts');
const ships = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');

const npcs = economy.createSectorNpcEconomyStates().filter((npc) => npc.pirate);
assert.equal(npcs.length, 9);
assert.deepEqual(
  Object.fromEntries(
    ['raider', 'reaver', 'marauder'].map((cls) => [
      cls,
      npcs.filter((npc) => npc.pirateClass === cls).length,
    ])
  ),
  { raider: 3, reaver: 3, marauder: 3 }
);
const stats = ['raider', 'reaver', 'marauder'].map((cls) => {
  const npc = npcs.find((entry) => entry.pirateClass === cls);
  const ship = ships.getShipDefinition(npc.shipId);
  assert(ship, 'all pirate hulls must be registered');
  const equipment = upgrade.ensureNpcInstalledComponents(npc);
  const setup = combat.npcCombatant(npc);
  assert(setup && setup.weapons.length > 0, 'pirates must actually enter combat armed');
  return {
    length: ship.nominalLengthMeters,
    hull: npc.hullMaxHp,
    weapons: setup.weapons.length,
    equipment,
  };
});
assert.deepEqual(
  stats.map((entry) => entry.length),
  [60, 80, 120]
);
assert(stats[0].hull < stats[1].hull && stats[1].hull < stats[2].hull);
assert(stats[0].weapons < stats[1].weapons && stats[1].weapons < stats[2].weapons);
console.log('PASS 60/80/120m pirate hulls and actual tiered combat equipment');
