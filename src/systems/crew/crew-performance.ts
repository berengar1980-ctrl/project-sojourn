import type {
  CrewDefinition,
  CrewManningStatus,
  CrewMember,
  CrewSocialTraits,
} from '../../core/crew-types';
import type { ShipDefinition, ShipStationSkill } from '../../core/ship-types';
import { resolveShipGameplayStats } from '../ships/ship-stats';

const SKILLS: readonly ShipStationSkill[] = [
  'piloting',
  'sensors',
  'weapons',
  'engineering',
  'salvage',
  'mining',
  'logistics',
];

const TRAIT_AXES: Readonly<Record<ShipStationSkill, readonly (keyof CrewSocialTraits)[]>> = {
  piloting: ['order', 'risk'],
  sensors: ['cunning', 'duty'],
  weapons: ['order', 'risk'],
  engineering: ['duty', 'order'],
  logistics: ['duty', 'cunning'],
  salvage: ['duty', 'risk'],
  mining: ['duty', 'order'],
};

export const defaultCrewEquipment = {
  ranged: 'off_autopistol',
  melee: 'combat_knife',
  armor: 'flak_vest',
  gear1: null,
  gear2: null,
} as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededCombatSkill(id: string, salt: number): number {
  const hash = hashText(id + ':' + salt);
  return 35 + (hash % 31);
}

export function initialCrewLoyalty(traits: CrewSocialTraits): number {
  return clamp(Math.round(40 + clamp(traits.loyalty, -2, 2) * 5), 0, 100);
}

export function crewMotivationModifier(member: CrewMember): number {
  const motivation = member.morale.motivation;
  if (motivation >= 80) return 1.03;
  if (motivation >= 60) return 1.01;
  if (motivation >= 40) return 1;
  if (motivation >= 20) return 0.97;
  if (motivation > 0) return 0.93;
  return 0.9;
}

export function crewStationTraitModifier(
  traits: CrewSocialTraits,
  skill: ShipStationSkill
): number {
  const axes = TRAIT_AXES[skill];
  const value = axes.reduce((sum, axis) => sum + Number(traits[axis] ?? 0), 0);
  return clamp(value * 0.75, -3, 3);
}

export function createCrewMember(definition: CrewDefinition): CrewMember {
  const ranged = definition.combatSkills?.ranged ?? seededCombatSkill(definition.id, 17);
  const melee = definition.combatSkills?.melee ?? seededCombatSkill(definition.id, 31);
  const equipment = definition.personalEquipment ?? defaultCrewEquipment;
  return {
    id: definition.id,
    name: definition.name,
    title: definition.title,
    share: definition.share,
    elite: definition.elite ?? false,
    portraitAssetUrl: null,
    socialTraits: { ...definition.socialTraits },
    skills: Object.fromEntries(
      SKILLS.map((skill) => [skill, definition.skills[skill] ?? 0])
    ) as Record<ShipStationSkill, number>,
    combatSkills: { ranged, melee },
    personalEquipment: { ...equipment },
    injuryState: 'healthy',
    morale: {
      motivation: 60,
      loyalty: initialCrewLoyalty(definition.socialTraits),
      momentum: 0,
      loyaltyMomentum: 0,
    },
    skillTrainingHours: Object.fromEntries(
      SKILLS.map((skill) => [skill, 0])
    ) as Record<ShipStationSkill, number>,
    combatTraining: { ranged: 0, melee: 0 },
  };
}

export function effectiveCrewSkills(
  member: CrewMember
): Readonly<Record<ShipStationSkill, number>> {
  const motivation = crewMotivationModifier(member);
  return Object.fromEntries(
    SKILLS.map((skill) => [skill, clamp(Math.round(member.skills[skill] * motivation), 0, 100)])
  ) as Readonly<Record<ShipStationSkill, number>>;
}

export function crewStationModifiers(
  member: CrewMember
): Readonly<Record<ShipStationSkill, number>> {
  return Object.fromEntries(
    SKILLS.map((skill) => [skill, crewStationTraitModifier(member.socialTraits, skill)])
  ) as Readonly<Record<ShipStationSkill, number>>;
}

export function crewCapacity(ship: ShipDefinition): number {
  return Math.max(1, resolveShipGameplayStats(ship).stations.length);
}

export function crewManningStatus(ship: ShipDefinition, hiredCrewCount: number): CrewManningStatus {
  const used = 1 + Math.max(0, hiredCrewCount);
  const minimum = crewCapacity(ship);
  const shortfall = Math.max(0, minimum - used);
  const factor = shortfall > 0 ? Math.max(0.68, 1 - shortfall * 0.08) : 1;
  return { used, minimum, shortfall, factor, ok: shortfall === 0 };
}

export function stationTrainingDaysNeeded(skill: number): number {
  if (skill < 30) return 3;
  if (skill < 50) return 5;
  if (skill < 65) return 8;
  if (skill < 75) return 14;
  if (skill < 85) return 25;
  if (skill < 95) return 50;
  return 100;
}

export function combatRoundsNeeded(skill: number): number {
  if (skill < 30) return 2;
  if (skill < 50) return 3;
  if (skill < 65) return 5;
  if (skill < 75) return 8;
  if (skill < 85) return 14;
  if (skill < 95) return 25;
  return 50;
}
