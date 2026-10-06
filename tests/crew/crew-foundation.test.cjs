'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const definitions = loadStandaloneTypeScriptModule(root, 'src/data/crew/crew-definitions.ts');
const performance = loadStandaloneTypeScriptModule(root, 'src/systems/crew/crew-performance.ts');

assert.equal(definitions.crewDefinitions.length, 26, 'all Voidbound hireable crew must be migrated');

const torven = definitions.crewDefinitionById('torven_kray');
assert(torven);
assert.equal(torven.name, 'Torven Kray');
assert.equal(torven.share, 4);
assert.equal(torven.skills.piloting, 68);
assert.equal(torven.skills.sensors, 41);
assert.equal(torven.socialTraits.loyalty, 2);
assert.equal(torven.socialTraits.trust, -2);

const tiber = definitions.crewDefinitionById('tiber_krane');
assert(tiber?.elite);
assert.equal(tiber.combatSkills.ranged, 98);
assert.equal(tiber.combatSkills.melee, 96);
assert.equal(tiber.skills.weapons, 98);
assert.equal(tiber.personalEquipment.ranged, 'melta_gun');

const dagan = definitions.crewDefinitionById('dagan_rhel');
assert.equal(dagan?.combatSkills.ranged, 96);
assert.equal(dagan?.combatSkills.melee, 97);

const torvenMember = performance.createCrewMember(torven);
assert.equal(torvenMember.morale.motivation, 60);
assert.equal(torvenMember.morale.loyalty, 50);
assert(torvenMember.combatSkills.ranged >= 35 && torvenMember.combatSkills.ranged <= 65);
assert(torvenMember.combatSkills.melee >= 35 && torvenMember.combatSkills.melee <= 65);
assert.equal(torvenMember.personalEquipment.ranged, 'off_autopistol');

assert.equal(performance.crewStationTraitModifier(torven.socialTraits, 'piloting'), 1.5);
assert.equal(performance.crewStationTraitModifier(torven.socialTraits, 'sensors'), 3);
assert.equal(performance.crewMotivationModifier(torvenMember), 1.01);

assert.equal(performance.stationTrainingDaysNeeded(29), 3);
assert.equal(performance.stationTrainingDaysNeeded(84), 25);
assert.equal(performance.combatRoundsNeeded(84), 14);

console.log('PASS migrated crew definitions, social traits, skills, morale and progression rules');
