import type { ShipStationSkill } from '../../core/ship-types';

export interface CrewSkillEffects {
  readonly piloting: {
    readonly dodgeChance: number;
    readonly travelTimeMultiplier: number;
    readonly travelSpeedMultiplier: number;
    readonly fuelUseMultiplier: number;
  };
  readonly sensors: {
    readonly weaponHitChanceBonus: number;
    readonly contactBaseRange: number;
    readonly marketIntelBaseRange: number;
  };
  readonly weapons: {
    readonly damageMultiplier: number;
    readonly criticalChance: number;
    readonly cycleTimeMultiplier: number;
  };
  readonly engineering: {
    readonly shieldRegenMultiplier: number;
    readonly repairCostMultiplier: number;
    readonly overloadFailureMultiplier: number;
  };
  readonly salvage: {
    readonly yieldMultiplier: number;
    readonly workTimeMultiplier: number;
    readonly extraWreckLootChance: number;
  };
  readonly mining: {
    readonly yieldMultiplier: number;
    readonly workTimeMultiplier: number;
    readonly prospectTimeMultiplier: number;
    readonly fuelUseMultiplier: number;
    readonly deepYieldMultiplier: number;
    readonly deepWorkTimeMultiplier: number;
    readonly deepFuelUseMultiplier: number;
    readonly prospectUncertainty: number;
    readonly secondDepositChance: number;
    readonly thirdDepositChance: number;
  };
  readonly logistics: {
    readonly saleFeeRate: number;
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizedCrewSkill(skill: number): number {
  return clamp(Number.isFinite(skill) ? skill : 0, 0, 100);
}

export function pilotingDodgeChance(skill: number): number {
  return (normalizedCrewSkill(skill) / 100) * 0.2;
}

export function pilotingTravelTimeMultiplier(skill: number): number {
  return 1 - (normalizedCrewSkill(skill) / 100) * 0.15;
}

export function pilotingTravelSpeedMultiplier(skill: number): number {
  return 1 / pilotingTravelTimeMultiplier(skill);
}

export function pilotingFuelUseMultiplier(skill: number): number {
  return 1 - (normalizedCrewSkill(skill) / 100) * 0.1;
}

export function sensorWeaponHitChanceBonus(skill: number): number {
  return (normalizedCrewSkill(skill) / 100) * 0.15;
}

export function sensorContactBaseRange(skill: number): number {
  return 1.4 + normalizedCrewSkill(skill) * 0.045;
}

export function sensorMarketIntelBaseRange(skill: number): number {
  return 8 + normalizedCrewSkill(skill) * 0.22;
}

export function weaponDamageMultiplier(skill: number): number {
  return 1 + (normalizedCrewSkill(skill) / 100) * 0.2;
}

export function weaponCriticalChance(skill: number): number {
  return (normalizedCrewSkill(skill) / 100) * 0.1;
}

export function weaponCycleTimeMultiplier(skill: number): number {
  return 1 - clamp(normalizedCrewSkill(skill) * 0.0012, 0, 0.12);
}

export function engineeringShieldRegenMultiplier(skill: number): number {
  return 1 + (normalizedCrewSkill(skill) / 100) * 0.25;
}

export function engineeringRepairCostMultiplier(skill: number): number {
  return 1 - (normalizedCrewSkill(skill) / 100) * 0.15;
}

export function engineeringOverloadFailureMultiplier(skill: number): number {
  return 1 - (normalizedCrewSkill(skill) / 100) * 0.25;
}

export function salvageYieldMultiplier(skill: number): number {
  return 1 + (normalizedCrewSkill(skill) / 100) * 0.35;
}

export function salvageWorkTimeMultiplier(skill: number): number {
  return 1 - (normalizedCrewSkill(skill) / 100) * 0.25;
}

export function salvageExtraWreckLootChance(skill: number): number {
  return clamp(normalizedCrewSkill(skill) / 120, 0, 1);
}

export function miningYieldMultiplier(skill: number): number {
  return 1 + (normalizedCrewSkill(skill) / 100) * 0.4;
}

export function miningWorkTimeMultiplier(skill: number): number {
  return 1 - (normalizedCrewSkill(skill) / 100) * 0.25;
}

export function miningProspectTimeMultiplier(skill: number): number {
  return 1 - (normalizedCrewSkill(skill) / 100) * 0.2;
}

export function miningFuelUseMultiplier(skill: number): number {
  return 1 - (normalizedCrewSkill(skill) / 100) * 0.1;
}

export function deepMiningYieldMultiplier(skill: number): number {
  return 1 + (normalizedCrewSkill(skill) / 100) * 0.35;
}

export function deepMiningWorkTimeMultiplier(skill: number): number {
  return 1 - (normalizedCrewSkill(skill) / 100) * 0.2;
}

export function deepMiningFuelUseMultiplier(skill: number): number {
  return 1 - (normalizedCrewSkill(skill) / 100) * 0.08;
}

export function miningProspectUncertainty(skill: number): number {
  return clamp(0.34 - (normalizedCrewSkill(skill) / 100) * 0.18, 0.14, 0.34);
}

export function miningSecondDepositChance(skill: number): number {
  return clamp(0.45 + normalizedCrewSkill(skill) * 0.0025, 0, 1);
}

export function miningThirdDepositChance(skill: number): number {
  return clamp(0.18 + normalizedCrewSkill(skill) * 0.0015, 0, 1);
}

export function logisticsSaleFeeRate(skill: number): number {
  return clamp(0.25 * (1 - normalizedCrewSkill(skill) / 100), 0, 0.25);
}

export function navigationEvadeChance(sensorSkill: number, pilotingSkill: number): number {
  const navigation = Math.round(
    (normalizedCrewSkill(sensorSkill) + normalizedCrewSkill(pilotingSkill)) / 2
  );
  return clamp((navigation - 25) * 0.006, 0, 0.45);
}

export function crewSkillEffects(
  skills: Readonly<Record<ShipStationSkill, number>>
): CrewSkillEffects {
  const piloting = normalizedCrewSkill(skills.piloting);
  const sensors = normalizedCrewSkill(skills.sensors);
  const weapons = normalizedCrewSkill(skills.weapons);
  const engineering = normalizedCrewSkill(skills.engineering);
  const salvage = normalizedCrewSkill(skills.salvage);
  const mining = normalizedCrewSkill(skills.mining);
  const logistics = normalizedCrewSkill(skills.logistics);

  return {
    piloting: {
      dodgeChance: pilotingDodgeChance(piloting),
      travelTimeMultiplier: pilotingTravelTimeMultiplier(piloting),
      travelSpeedMultiplier: pilotingTravelSpeedMultiplier(piloting),
      fuelUseMultiplier: pilotingFuelUseMultiplier(piloting),
    },
    sensors: {
      weaponHitChanceBonus: sensorWeaponHitChanceBonus(sensors),
      contactBaseRange: sensorContactBaseRange(sensors),
      marketIntelBaseRange: sensorMarketIntelBaseRange(sensors),
    },
    weapons: {
      damageMultiplier: weaponDamageMultiplier(weapons),
      criticalChance: weaponCriticalChance(weapons),
      cycleTimeMultiplier: weaponCycleTimeMultiplier(weapons),
    },
    engineering: {
      shieldRegenMultiplier: engineeringShieldRegenMultiplier(engineering),
      repairCostMultiplier: engineeringRepairCostMultiplier(engineering),
      overloadFailureMultiplier: engineeringOverloadFailureMultiplier(engineering),
    },
    salvage: {
      yieldMultiplier: salvageYieldMultiplier(salvage),
      workTimeMultiplier: salvageWorkTimeMultiplier(salvage),
      extraWreckLootChance: salvageExtraWreckLootChance(salvage),
    },
    mining: {
      yieldMultiplier: miningYieldMultiplier(mining),
      workTimeMultiplier: miningWorkTimeMultiplier(mining),
      prospectTimeMultiplier: miningProspectTimeMultiplier(mining),
      fuelUseMultiplier: miningFuelUseMultiplier(mining),
      deepYieldMultiplier: deepMiningYieldMultiplier(mining),
      deepWorkTimeMultiplier: deepMiningWorkTimeMultiplier(mining),
      deepFuelUseMultiplier: deepMiningFuelUseMultiplier(mining),
      prospectUncertainty: miningProspectUncertainty(mining),
      secondDepositChance: miningSecondDepositChance(mining),
      thirdDepositChance: miningThirdDepositChance(mining),
    },
    logistics: {
      saleFeeRate: logisticsSaleFeeRate(logistics),
    },
  };
}
