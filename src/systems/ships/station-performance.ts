import type { ShipStationDefinition, ShipStationSkill } from '../../core/ship-types';

export type CrewInjuryState =
  | 'healthy'
  | 'light_wound'
  | 'severe_wound'
  | 'incapacitated'
  | 'dead';

export interface ShipCrewMember {
  readonly id: string;
  readonly skills: Readonly<Partial<Record<ShipStationSkill, number>>>;
  readonly stationModifiers?: Readonly<Partial<Record<ShipStationSkill, number>>>;
  readonly injuryState?: CrewInjuryState;
}

export type ShipStationAssignments = Readonly<Record<string, string | undefined>>;

const AUTOMATION_SKILL = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function crewInjuryFactor(state: CrewInjuryState = 'healthy'): number {
  if (state === 'light_wound') return 0.9;
  if (state === 'severe_wound') return 0.7;
  if (state === 'incapacitated' || state === 'dead') return 0;
  return 1;
}

function memberSkill(member: ShipCrewMember | undefined, skill: ShipStationSkill): number {
  if (!member) return AUTOMATION_SKILL;
  const base = Number(member.skills[skill] ?? 0);
  const modifier = Number(member.stationModifiers?.[skill] ?? 0);
  return clamp((base + modifier) * crewInjuryFactor(member.injuryState), 0, 100);
}

function stationPerformanceForOperator(
  skill: ShipStationSkill,
  operatorId: string | undefined,
  crew: readonly ShipCrewMember[]
): number {
  const operator = operatorId ? crew.find((member) => member.id === operatorId) : undefined;
  const specialist = operator ? memberSkill(operator, skill) : AUTOMATION_SKILL;
  const others = crew.filter(
    (member) =>
      member.id !== operatorId &&
      member.injuryState !== 'incapacitated' &&
      member.injuryState !== 'dead'
  );
  const synergy = others.length
    ? others.reduce((sum, member) => sum + memberSkill(member, skill), 0) / others.length
    : 0;
  return clamp(specialist * 0.6 + synergy * 0.4, 0, 100);
}

export function calculateStationSkill(
  stations: readonly ShipStationDefinition[],
  assignments: ShipStationAssignments,
  crew: readonly ShipCrewMember[],
  skill: ShipStationSkill,
  manningFactor = 1,
  commandBonus = 0
): number {
  const values = stations
    .filter((station) => station.skill === skill)
    .map((station) =>
      stationPerformanceForOperator(skill, assignments[station.id], crew)
    )
    .sort((a, b) => b - a);

  if (!values.length) return AUTOMATION_SKILL;

  let total = values[0] ?? AUTOMATION_SKILL;
  for (let index = 1; index < values.length; index += 1) {
    total += Math.max(0, (values[index] ?? AUTOMATION_SKILL) - AUTOMATION_SKILL) * 0.35;
  }

  return clamp(Math.round(total * Math.max(0, manningFactor)) + commandBonus, 0, 100);
}

export function stationFactor(skill: number, maxBonus: number): number {
  return 1 + (clamp(skill, 0, 100) / 100) * Math.max(0, maxBonus);
}

export function stationReduction(skill: number, maxReduction: number): number {
  return 1 - (clamp(skill, 0, 100) / 100) * clamp(maxReduction, 0, 1);
}
