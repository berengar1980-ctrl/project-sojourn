'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const effects = loadStandaloneTypeScriptModule(root, 'src/systems/crew/crew-skill-effects.ts');

function close(actual, expected, message) {
  assert(Math.abs(actual - expected) < 1e-9, message ?? `${actual} !== ${expected}`);
}

close(effects.pilotingDodgeChance(100), 0.2);
close(effects.pilotingTravelTimeMultiplier(100), 0.85);
close(effects.pilotingTravelSpeedMultiplier(100), 1 / 0.85);
close(effects.pilotingFuelUseMultiplier(100), 0.9);

close(effects.sensorWeaponHitChanceBonus(100), 0.15);
close(effects.sensorContactBaseRange(100), 5.9);
close(effects.sensorMarketIntelBaseRange(100), 30);

close(effects.weaponDamageMultiplier(100), 1.2);
close(effects.weaponCriticalChance(100), 0.1);
close(effects.weaponCycleTimeMultiplier(100), 0.88);

close(effects.engineeringShieldRegenMultiplier(100), 1.25);
close(effects.engineeringRepairCostMultiplier(100), 0.85);
close(effects.engineeringOverloadFailureMultiplier(100), 0.75);

close(effects.salvageYieldMultiplier(100), 1.35);
close(effects.salvageWorkTimeMultiplier(100), 0.75);
close(effects.salvageExtraWreckLootChance(100), 100 / 120);

close(effects.miningYieldMultiplier(100), 1.4);
close(effects.miningWorkTimeMultiplier(100), 0.75);
close(effects.miningProspectTimeMultiplier(100), 0.8);
close(effects.miningFuelUseMultiplier(100), 0.9);
close(effects.deepMiningYieldMultiplier(100), 1.35);
close(effects.deepMiningWorkTimeMultiplier(100), 0.8);
close(effects.deepMiningFuelUseMultiplier(100), 0.92);
close(effects.miningProspectUncertainty(100), 0.16);
close(effects.miningSecondDepositChance(100), 0.7);
close(effects.miningThirdDepositChance(100), 0.33);

close(effects.logisticsSaleFeeRate(0), 0.25);
close(effects.logisticsSaleFeeRate(100), 0);
close(effects.navigationEvadeChance(100, 100), 0.45);
close(effects.navigationEvadeChance(0, 0), 0);

const profile = effects.crewSkillEffects({
  piloting: 80,
  sensors: 70,
  weapons: 60,
  engineering: 50,
  salvage: 40,
  mining: 30,
  logistics: 20,
});
close(profile.piloting.travelTimeMultiplier, 0.88);
close(profile.sensors.weaponHitChanceBonus, 0.105);
close(profile.sensors.contactBaseRange, 4.55);
close(profile.weapons.damageMultiplier, 1.12);
close(profile.engineering.repairCostMultiplier, 0.925);
close(profile.salvage.yieldMultiplier, 1.14);
close(profile.mining.yieldMultiplier, 1.12);
close(profile.mining.deepYieldMultiplier, 1.105);
close(profile.logistics.saleFeeRate, 0.2);

assert.equal(effects.normalizedCrewSkill(-5), 0);
assert.equal(effects.normalizedCrewSkill(140), 100);
assert.equal(effects.normalizedCrewSkill(Number.NaN), 0);

console.log('PASS Voidbound crew skill effects are preserved in Sojourn');
