'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const roleProfiles = loadStandaloneTypeScriptModule(root, 'src/data/ships/ship-role-profiles.ts');
const station = loadStandaloneTypeScriptModule(root, 'src/systems/ships/station-performance.ts');
const components = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-service.ts'
);

function stationSkill(profile, stationId) {
  return profile.stations.find((entry) => entry.id === stationId)?.skill;
}

{
  const freighter = roleProfiles.getShipRoleProfile('freighter');
  const mining = roleProfiles.getShipRoleProfile('mining');
  const salvage = roleProfiles.getShipRoleProfile('salvage');
  const patrol = roleProfiles.getShipRoleProfile('patrol');

  assert.equal(freighter.hullPoints, 115);
  assert.equal(mining.hullPoints, 72);
  assert.equal(salvage.hullPoints, 82);
  assert.equal(patrol.hullPoints, 96);

  assert.equal(freighter.shieldModifier, 1);
  assert.equal(mining.shieldModifier, 0.875);
  assert.equal(salvage.shieldModifier, 0.8125);
  assert.equal(patrol.shieldModifier, 1.1875);

  assert.equal(freighter.weaponSlots, 4);
  assert.equal(mining.weaponSlots, 3);
  assert.equal(salvage.weaponSlots, 3);
  assert.equal(patrol.weaponSlots, 6);

  assert.deepEqual(freighter.specialCargo, null);
  assert.deepEqual(mining.specialCargo, { kind: 'mining' });
  assert.deepEqual(salvage.specialCargo, { kind: 'salvage' });
  assert.deepEqual(patrol.specialCargo, null);

  assert.equal(stationSkill(freighter, 'cargo_control'), 'logistics');
  assert.equal(stationSkill(mining, 'mining_station'), 'mining');
  assert.equal(stationSkill(salvage, 'salvage_control'), 'salvage');
  assert.equal(stationSkill(patrol, 'damage_control'), 'engineering');
}

{
  const stations = [
    { id: 'helm', skill: 'piloting' },
    { id: 'engine_room', skill: 'engineering' },
  ];
  const crew = [
    { id: 'pilot', skills: { piloting: 80, engineering: 20 } },
    { id: 'engineer', skills: { piloting: 40, engineering: 70 } },
    { id: 'captain', skills: { piloting: 60, engineering: 50 } },
  ];

  assert.equal(
    station.calculateStationSkill(stations, { helm: 'pilot' }, crew, 'piloting'),
    68,
    'station output must retain Voidbound 60/40 specialist/synergy split'
  );

  const woundedCrew = crew.map((member) =>
    member.id === 'pilot' ? { ...member, injuryState: 'severe_wound' } : member
  );
  assert.equal(
    station.calculateStationSkill(stations, { helm: 'pilot' }, woundedCrew, 'piloting'),
    54,
    'severe wounds must reduce station contribution to 70 percent'
  );

  assert.equal(station.crewInjuryFactor('light_wound'), 0.9);
  assert.equal(station.crewInjuryFactor('severe_wound'), 0.7);
  assert.equal(station.crewInjuryFactor('incapacitated'), 0);
  assert.equal(station.stationFactor(50, 0.4), 1.2);
  assert.equal(station.stationReduction(50, 0.2), 0.9);
}

{
  const doubleEngineering = [
    { id: 'engine_room', skill: 'engineering' },
    { id: 'damage_control', skill: 'engineering' },
  ];
  const crew = [
    { id: 'a', skills: { engineering: 80 } },
    { id: 'b', skills: { engineering: 70 } },
    { id: 'c', skills: { engineering: 50 } },
  ];
  const one = station.calculateStationSkill(
    doubleEngineering.slice(0, 1),
    { engine_room: 'a' },
    crew,
    'engineering'
  );
  const two = station.calculateStationSkill(
    doubleEngineering,
    { engine_room: 'a', damage_control: 'b' },
    crew,
    'engineering'
  );

  assert(two > one, 'a second station must add reduced extra performance');
}

{
  assert.equal(components.getShipComponent('reactor', 'reactor4').output, 128);
  assert.equal(components.getShipComponent('engine', 'engine4').speed, 0.4);
  assert.equal(components.getShipComponent('shield', 'shield4').bonus, 56);
  assert.equal(components.getShipComponent('sensor', 'sensor4').range, 0.45);
  assert.equal(components.getShipComponent('mining', 'mining4').yield, 0.48);
  assert.equal(components.getShipComponent('salvage', 'salvage6').chance, 30);

  const compatibleEngines = components.getCompatibleShipComponents('engine', 3);
  assert(
    compatibleEngines.every((entry) => entry.tier <= 3),
    'component compatibility must respect hull tier limits'
  );
  assert.equal(
    compatibleEngines.some((entry) => entry.tier === 4),
    false
  );

  const installed = {
    reactor: ['reactor4'],
    engine: ['engine4'],
    shield: ['shield4'],
    sensor: ['sensor4'],
    mining: ['mining4'],
    weapon: ['weapon4'],
  };
  const energy = components.calculateShipEnergy(installed);

  assert.equal(energy.output, 128);
  assert.equal(energy.baseUsed, 54);
  assert.equal(energy.shieldUsed, 21);
  assert.equal(energy.weaponsUsed, 22);
  assert.equal(energy.combatUsed, 97);
  assert.equal(energy.baseFree, 74);
  assert.equal(energy.combatFree, 31);

  assert.equal(components.engineSpeedMultiplier(installed), 1.4);
  assert.equal(components.sensorRangeMultiplier(installed), 1.45);
  assert.equal(components.miningYieldMultiplier(installed), 1.48);
  assert.equal(components.salvageYieldMultiplier({ salvage: ['salvage4'] }), 1.48);
  assert.equal(components.salvageChanceBonus({ salvage: ['salvage4'] }), 15);
}

{
  const registry = fs.readFileSync(path.join(root, 'src/systems/ships/ship-registry.ts'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'src/systems/ships/index.ts'), 'utf8');

  assert(
    registry.includes('getShipGameplayStats'),
    'ship registry must expose resolved gameplay stats'
  );
  assert(api.includes('calculateStationSkill'), 'ship public API must expose station calculations');
  assert(api.includes('calculateShipEnergy'), 'ship public API must expose component energy');
}

console.log('PASS ship gameplay profiles, crew stations and component rules');
