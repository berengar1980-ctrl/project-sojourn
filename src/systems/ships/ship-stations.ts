import type { ShipCrewInjuryState, ShipStationContributor } from '../../core/ship-gameplay-types';

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function stationInjuryMultiplier(injury: ShipCrewInjuryState = 'healthy'): number {
  if (injury === 'light-wound') return 0.9;
  if (injury === 'severe-wound') return 0.7;
  if (injury === 'incapacitated' || injury === 'dead') return 0;
  return 1;
}

export function stationContributorPerformance(contributor: ShipStationContributor): number {
  const adjustedSkill = clamp(contributor.skill + (contributor.traitModifier ?? 0));
  return adjustedSkill * stationInjuryMultiplier(contributor.injury);
}

export function calculateStationPerformance(
  operator: ShipStationContributor,
  supportingCrew: readonly ShipStationContributor[]
): number {
  const specialist = stationContributorPerformance(operator);
  if (supportingCrew.length === 0) return clamp(specialist * 0.6);

  const synergy =
    supportingCrew.reduce((sum, crew) => sum + stationContributorPerformance(crew), 0) /
    supportingCrew.length;

  return clamp(specialist * 0.6 + synergy * 0.4);
}

export function calculateCombinedStationSkill(
  stationPerformances: readonly number[],
  manningFactor = 1,
  commandModifier = 0
): number {
  if (stationPerformances.length === 0) return 20;

  const values = stationPerformances.map((value) => clamp(value)).sort((a, b) => b - a);
  let total = values[0] ?? 20;

  for (let index = 1; index < values.length; index += 1) {
    total += Math.max(0, (values[index] ?? 0) - 20) * 0.35;
  }

  return clamp(Math.round(total * Math.max(0, manningFactor) + commandModifier));
}

export function stationFactor(skill: number, maxBonus: number): number {
  return 1 + (clamp(skill) / 100) * Math.max(0, maxBonus);
}

export function stationReduction(skill: number, maxReduction: number): number {
  return 1 - (clamp(skill) / 100) * clamp(maxReduction, 0, 1);
}
