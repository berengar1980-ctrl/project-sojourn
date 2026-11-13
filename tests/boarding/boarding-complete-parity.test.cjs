'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const profiles = load('src/systems/boarding/boarding-personal-profiles.ts');
const checkpoint = load('src/systems/boarding/boarding-checkpoint-service.ts');
const tactical = load('src/systems/boarding/crew-boarding-adapter.ts');
const rosterModule = load('src/systems/crew/crew-roster-service.ts');
const ships = load('src/systems/ships/ship-registry.ts');

const rangedIds = [
  'laspistol', 'lasgun', 'hotshot_laspistol', 'hotshot_lasgun', 'autopistol',
  'autogun', 'stub_revolver', 'naval_pistol', 'shotgun', 'bolt_pistol', 'boltgun',
  'plasma_pistol', 'plasma_gun', 'melta_pistol', 'melta_gun', 'hand_flamer',
  'flamer', 'needle_pistol', 'needle_rifle', 'laslock', 'off_laspistol',
  'off_autopistol',
];
const meleeIds = [
  'combat_knife', 'mono_knife', 'chainsword_short', 'power_axe', 'power_sword',
  'shock_maul', 'shock_baton', 'void_hatchet', 'dueling_blade',
];
assert.equal(Object.keys(profiles.personalRangedProfiles).length, rangedIds.length);
assert.equal(Object.keys(profiles.personalMeleeProfiles).length, meleeIds.length);
for (const id of rangedIds) {
  const weapon = profiles.personalRangedProfile(id);
  assert.equal(weapon.id, id);
  assert(Number.isFinite(weapon.range) && weapon.range >= 2);
  assert(Number.isFinite(weapon.spread));
  assert(Number.isFinite(weapon.armorPenetration));
}
for (const id of meleeIds) {
  const weapon = profiles.personalMeleeProfile(id);
  assert.equal(weapon.id, id);
  assert(Number.isFinite(weapon.damage) && Number.isFinite(weapon.hitBonus));
}
const hotshot = profiles.personalRangedProfile('hotshot_lasgun');
assert.deepEqual(hotshot.piercing, { maxArmor: 1, bonusDamage: 1 });
assert.equal(profiles.personalRangedProfile('flamer').spreadMode, 'cone');
assert.equal(profiles.personalRangedProfile('salvage_lasgun_power').damage, 5);
assert.equal(profiles.personalRangedProfile('salvage_lasgun_power').hitBonus, 7);

const roster = rosterModule.createCrewRosterService();
const miner = ships.getShipsByRole('mining')[0];
assert(miner);
assert(roster.hire('tiber_krane', miner));
const begin = () => tactical.createCrewBoardingEncounter({
  roster,
  seed: 120,
  mapId: 'long-corridor',
  enemyUnits: [{ id: 'raider', name: 'Raider', team: 'enemy', hp: 10 }],
});
const encounter = begin();
const saved = encounter.tactical.getSnapshot();
let value = null;
const storage = {
  getItem: () => value,
  setItem: (_, text) => { value = text; },
  removeItem: () => { value = null; },
};
const store = checkpoint.createBoardingCheckpointStore(storage);
store.save(saved);
assert.deepEqual(store.load(), saved);
const id = saved.units.find((unit) => unit.team === 'player').id;
assert.equal(encounter.tactical.move(id, { q: 2, r: 1 }), true);
assert.notDeepEqual(encounter.tactical.getSnapshot(), saved);
assert.equal(encounter.tactical.restoreCheckpoint(store.load()), true);
assert.deepEqual(encounter.tactical.getSnapshot(), saved);
assert.equal(encounter.tactical.restoreCheckpoint({ ...saved, seed: 121 }), false);
const alteredMap = { ...saved, map: { ...saved.map, id: 'other-map' } };
assert.equal(encounter.tactical.restoreCheckpoint(alteredMap), false);
assert.equal(encounter.tactical.restoreCheckpoint({ ...saved, randomCalls: Infinity }), false);
store.clear();
assert.equal(store.load(), null);
value = '{"version":1,"snapshot":{"__proto__":{}}}';
assert.throws(() => store.load(), /Ungültiger Schlüssel/);

const wreckRules = load('src/systems/salvage/salvage-boarding-rules.ts');
const generator = load('src/systems/salvage/salvage-field-generator.ts');
const fieldService = load('src/systems/salvage/salvage-field-service.ts');
const eventGenerator = load('src/systems/salvage/salvage-event-field-generator.ts');
const field = generator.generateSalvageField('drift-wreck', 9001, 3);
const sections = field.wrecks.filter((w) => w.sectionVariant);
assert(sections.length >= 8);
assert(sections.every((w) => w.boardingHostiles >= 2));
assert(sections.every((w) => !wreckRules.wreckCanBoard(w)));
const wreck = sections.find((w) => w.resources.some((r) => r.remainingAmount > 0));
assert(wreck);
const salvage = fieldService.createSalvageFieldService({
  field,
  setup: { available: true, cargoCapacityTons: 1000, chanceBonus: 0, yieldMultiplier: 1 },
  crewSkill: 60,
  collect: (_, amount) => amount,
});
assert(salvage.inspectWreck(wreck.id));
assert(wreckRules.wreckCanBoard(wreck));
assert.equal(salvage.recoverResource(wreck.id), null, 'guarded wreck cannot be looted before victory');
wreck.boardingCleared = true;
assert(!wreckRules.wreckCanBoard(wreck));
assert(salvage.recoverResource(wreck.id), 'loot is unlocked after boarding victory');
const variant = { ...wreck, sectionVariant: 'reactor-hall' };
assert.equal(wreckRules.boardingMapForWreck(variant), 'central-breach');
const eventField = eventGenerator.generateSectorSalvageEventField({
  id: 'test-boarding-signal',
  type: 'special-wreck',
  fieldSeed: 711,
  wreckKind: 'salvager',
  specialComponent: true,
  salvageRights: false,
});
assert(eventField.wrecks[0].boardingHostiles >= 2, 'special container is now boardable');
const app = fs.readFileSync(path.join(root, 'src/app/game-controller-events.ts'), 'utf8');
assert(app.includes('wreckCanBoard(wreck)'));
assert(app.includes('boardingMapForWreck(wreck)'));
const ship = fs.readFileSync(path.join(root, 'src/app/game-controller-combat-boarding.ts'), 'utf8');
assert(ship.includes('resumeAfterBoarding'));
assert(ship.includes('emitCampaignCombatEnded'));
console.log('PASS full personal weapon catalogue, secure wrecks, persistent tactical checkpoints and ship results');
