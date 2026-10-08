import type { CrewMember } from '../../core/crew-types';

import type { ShipStationSkill } from '../../core/ship-types';

export interface PortCrewView {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly role: string;
  readonly skills: readonly string[];
  readonly traits: readonly string[];
  readonly ranged: number;
  readonly melee: number;
  readonly share: number;
  readonly elite: boolean;
  readonly equipment: readonly string[];
}

const SOCIAL_LABELS: Readonly<Record<string, string>> = {
  loyalty: 'Loyal',
  order: 'Ordnung',
  duty: 'Pflicht',
  risk: 'Risiko',
  empathy: 'Empathie',
  faith: 'Glaube',
  cunning: 'List',
  trust: 'Vertrauen',
};

const SKILL_LABELS: Readonly<Record<ShipStationSkill, string>> = {
  piloting: 'STEUER',
  sensors: 'SENSOR',
  weapons: 'WAFFEN',
  engineering: 'TECH',
  salvage: 'BERGUNG',
  mining: 'MINING',
  logistics: 'LOGISTIK',
};

const SKILL_ORDER = [
  'piloting',
  'sensors',
  'weapons',
  'engineering',
  'salvage',
  'mining',
  'logistics',
] as const satisfies readonly ShipStationSkill[];

function crewInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('');
}

function equipmentLabels(equipment: CrewMember['personalEquipment']): readonly string[] {
  return [
    equipment.ranged,
    equipment.melee,
    equipment.armor,
    equipment.gear1,
    equipment.gear2,
  ].filter((value): value is string => Boolean(value));
}

export function crewMemberView(member: CrewMember): PortCrewView {
  return {
    id: member.id,
    name: member.name,
    initials: crewInitials(member.name),
    role: member.title,
    skills: SKILL_ORDER.map((skill) => `${SKILL_LABELS[skill]} ${member.skills[skill]}`),
    traits: Object.entries(member.socialTraits)
      .filter(([, value]) => value !== 0)
      .sort((first, second) => Math.abs(second[1]) - Math.abs(first[1]))
      .slice(0, 3)
      .map(([axis, value]) => `${SOCIAL_LABELS[axis] ?? axis} ${value > 0 ? '+' : ''}${value}`),
    ranged: member.combatSkills.ranged,
    melee: member.combatSkills.melee,
    share: member.share,
    elite: member.elite,
    equipment: equipmentLabels(member.personalEquipment),
  };
}
