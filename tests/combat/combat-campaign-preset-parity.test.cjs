'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const presets = load('src/ui/start/campaign-combat-preset.ts');
const { duelCombatant } = load('src/ui/start/duel-combatant-setup.ts');
const { scenarioArrivals } = load('src/ui/start/fleet-scenario-npcs.ts');
const { npcCombatant } = load('src/systems/combat/npc-combatant-setup.ts');
const { getShipDefinition } = load('src/systems/ships/ship-registry.ts');
const { createFleetScenarioRoster } = load('src/ui/start/fleet-scenario-roster.ts');

function combatValues(setup) {
  const { id, name, ...values } = setup;
  assert(id && name);
  return values;
}

for (const template of presets.campaignCombatPresets()) {
  const npc = presets.campaignCombatPreset(template.id);
  const expected = npcCombatant(npc);
  assert(expected, template.id);
  const draft = presets.campaignPresetDraft(template.id);
  const duel = duelCombatant(0, draft, getShipDefinition(npc.shipId));
  assert.deepEqual(combatValues(duel), combatValues(expected), template.id + ' PvP');
  const group =
    template.id === presets.SECURITY_DRONE_PRESET_ID
      ? 'drone'
      : template.pirate
        ? template.factionId === 'pirates'
          ? 'pirates-yellow'
          : 'pirates-red'
        : 'npc';
  const [arrival] = scenarioArrivals(
    [{ id: 'test-' + template.id, name: template.name, group, draft, arrivalSeconds: 0 }],
    'greyrock-belt'
  );
  const fleet = npcCombatant(arrival.npc);
  assert.deepEqual(combatValues(fleet), combatValues(expected), template.id + ' FleetCombat');
}
const roster = createFleetScenarioRoster([
  { group: 'drone', initial: 2, joining: 1, afterSeconds: 20 },
  { group: 'pirates-yellow', initial: 4, joining: 0, afterSeconds: 0 },
  { group: 'pirates-red', initial: 4, joining: 0, afterSeconds: 0 },
  { group: 'npc', initial: 3, joining: 0, afterSeconds: 0 },
]);
assert(roster.filter((ship) => ship.group !== 'player').every((ship) => ship.draft.campaignNpcId));
for (const ship of roster.filter((ship) => ship.group === 'drone')) {
  assert.equal(ship.draft.shipId, '24m-security-drone');
  assert.equal(ship.draft.armorId, 'armor-all-3');
  assert.equal(ship.draft.engineId, 'engine3');
  assert.equal(ship.draft.sensorId, 'sensor3');
}
for (const ship of roster.filter((ship) => ship.group === 'pirates-yellow')) {
  assert.notEqual(presets.campaignCombatPreset(ship.draft.campaignNpcId).pirateClass, 'marauder');
}
console.log('PASS campaign combat presets are identical in PvP and FleetCombat');
