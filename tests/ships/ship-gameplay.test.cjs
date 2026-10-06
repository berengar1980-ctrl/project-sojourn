'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const gameplay = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-gameplay.ts');
const stations = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-stations.ts');

function ship(role, cargoCapacityTons) {
  return {
    id: role + '-test',
    name: role + ' test ship',
    role,
    nominalLengthMeters: 80,
    cargoCapacityTons,
    sprite: {
      assetUrl: '',
      widthPx: 100,
      heightPx: 60,
      facing: 'right',
      hardpoints: {
        sourceWidth: 100,
        sourceHeight: 60,
        pivot: { x: 50, y: 30 },
        engines: [],
        miningLasers: [],
        maneuverThrusters: [],
        shield: {
          centerX: 50,
          centerY: 30,
          radiusX: 60,
          radiusY: 40,
          maxHp: 100,
          modifier: 1,
        },
      },
    },
    navigation: { cruiseSpeed: 220 },
  };
}

const miningShip = ship('mining', 360);
const freighter = ship('freighter', 900);
const patrolShip = ship('patrol', 120);

{
  const mining = gameplay.getShipRoleProfile('mining');
  const freighterProfile = gameplay.getShipRoleProfile('freighter');
  const salvage = gameplay.getShipRoleProfile('salvage');
  const patrol = gameplay.getShipRoleProfile('patrol');

  assert.equal(mining.hullPoints, 72);
  assert.equal(mining.fuelCapacity, 145);
  assert.equal(mining.weaponSlots, 1);
  assert.equal(mining.cargoMode, 'mining');
  assert.equal(mining.componentSlots.mining, 1);
  assert.equal(mining.stations.at(-1).skill, 'mining');

  assert.equal(freighterProfile.hullPoints, 78);
  assert.equal(freighterProfile.fuelUse, 0.82);
  assert.equal(freighterProfile.componentSlots.cargo, 1);
  assert.equal(freighterProfile.stations.at(-1).skill, 'logistics');

  assert.equal(salvage.hullPoints, 82);
  assert.equal(salvage.cargoMode, 'salvage');
  assert.equal(salvage.componentSlots.salvage, 1);

  assert.equal(patrol.hullPoints, 96);
  assert.equal(patrol.weaponSlots, 3);
  assert.equal(patrol.componentSlots.weapon, 3);
  assert.equal(patrol.stations.at(-1).id, 'damage-control');
}

{
  const starter = gameplay.createStarterShipLoadout(miningShip);
  assert.deepEqual(starter.reactor, ['reactor-mk1']);
  assert.deepEqual(starter.engine, ['engine-mk1']);
  assert.deepEqual(starter.mining, ['mining-mk1']);
  assert.equal(starter.salvage, undefined);
  assert.equal(starter.weapon, undefined);

  assert.equal(gameplay.canInstallShipComponent(miningShip, 'mining-mk3'), true);
  assert.equal(gameplay.canInstallShipComponent(miningShip, 'mining-mk4'), false);
  assert.equal(gameplay.canInstallShipComponent(miningShip, 'salvage-mk1'), false);
  assert.equal(gameplay.canInstallShipComponent(freighter, 'cargo-mk3'), true);
  assert.equal(gameplay.canInstallShipComponent(patrolShip, 'cargo-mk1'), false);
}

{
  const stats = gameplay.calculateShipDerivedStats(miningShip);
  assert.equal(stats.hullMax, 72);
  assert.equal(stats.shieldMaxHp, 100, 'Sojourn starter shield must remain 100 HP');
  assert.equal(stats.shieldModifier, 1, 'Sojourn starter shield modifier must remain 1');
  assert.equal(stats.cruiseSpeed, 220);
  assert.equal(stats.fuelCapacity, 145);
  assert.equal(stats.fuelUse, 0.86);
  assert.equal(stats.cargoCapacityTons, 360);
  assert.equal(stats.sensorRangeMultiplier, 1);
  assert.equal(stats.miningYieldMultiplier, 1);
  assert.equal(stats.salvageYieldMultiplier, 1);
  assert.equal(stats.weaponSlots, 1);
  assert.equal(stats.crewCapacity, 5);
  assert.equal(stats.cargoMode, 'mining');
  assert.deepEqual(stats.energy, {
    output: 40,
    baseUsed: 22,
    baseFree: 18,
    shieldUsed: 8,
    weaponsUsed: 0,
    combatUsed: 30,
    combatFree: 10,
  });
}

{
  const upgraded = {
    reactor: ['reactor-mk3'],
    engine: ['engine-mk3'],
    shield: ['shield-mk3'],
    hull: ['hull-mk3'],
    sensor: ['sensor-mk3'],
    mining: ['mining-mk3'],
  };
  const stats = gameplay.calculateShipDerivedStats(miningShip, upgraded);

  assert.equal(stats.hullMax, 104);
  assert.equal(stats.shieldMaxHp, 136);
  assert.equal(stats.cruiseSpeed, 275);
  assert.equal(stats.sensorRangeMultiplier, 1.3);
  assert.equal(stats.miningYieldMultiplier, 1.3);
  assert.deepEqual(stats.energy, {
    output: 72,
    baseUsed: 42,
    baseFree: 30,
    shieldUsed: 16,
    weaponsUsed: 0,
    combatUsed: 58,
    combatFree: 14,
  });
}

{
  const stats = gameplay.calculateShipDerivedStats(freighter);
  assert.equal(stats.cargoCapacityTons, 930, 'factory cargo module must add capacity');
  assert.equal(stats.cargoMode, 'general');
}

{
  const modifiedPatrol = {
    ...patrolShip,
    gameplay: {
      hullMultiplier: 1.1,
      cargoCapacityMultiplier: 0.9,
      cruiseSpeedMultiplier: 1.05,
      weaponSlotDelta: 1,
    },
  };
  const stats = gameplay.calculateShipDerivedStats(modifiedPatrol);
  assert.equal(stats.hullMax, 106);
  assert.equal(stats.cargoCapacityTons, 108);
  assert.equal(stats.cruiseSpeed, 231);
  assert.equal(stats.weaponSlots, 4);
}

{
  assert.equal(gameplay.getShipComponentDefinition('reactor-mk6').reactorOutput, 198);
  assert.equal(gameplay.getShipComponentDefinition('salvage-mk6').chanceBonus, 30);
  assert.equal(gameplay.getShipComponentDefinition('missing'), null);
  assert.throws(
    () =>
      gameplay.calculateShipDerivedStats(miningShip, {
        mining: ['salvage-mk1'],
      }),
    /mismatched ship component/
  );
}

{
  assert.equal(stations.stationInjuryMultiplier('healthy'), 1);
  assert.equal(stations.stationInjuryMultiplier('light-wound'), 0.9);
  assert.equal(stations.stationInjuryMultiplier('severe-wound'), 0.7);
  assert.equal(stations.stationInjuryMultiplier('incapacitated'), 0);
  assert.equal(stations.stationInjuryMultiplier('dead'), 0);

  const performance = stations.calculateStationPerformance({ skill: 80 }, [
    { skill: 60 },
    { skill: 40 },
  ]);
  assert.equal(performance, 68, 'station performance must preserve the Voidbound 60/40 model');

  const injured = stations.stationContributorPerformance({
    skill: 80,
    injury: 'light-wound',
  });
  assert.equal(injured, 72);

  assert.equal(stations.calculateCombinedStationSkill([70, 60]), 84);
  assert.equal(stations.calculateCombinedStationSkill([70, 60], 0.8), 67);
  assert.equal(stations.calculateCombinedStationSkill([]), 20);
  assert.equal(stations.stationFactor(50, 0.4), 1.2);
  assert.equal(stations.stationReduction(50, 0.2), 0.9);
}

console.log('PASS ship roles, components, derived stats and crew station formulas');
