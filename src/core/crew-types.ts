import type { ShipStationSkill } from './ship-types';

export type CrewSocialAxis =
  | 'loyalty'
  | 'order'
  | 'duty'
  | 'risk'
  | 'empathy'
  | 'faith'
  | 'cunning'
  | 'trust';

export type CrewSocialTraits = Readonly<Record<CrewSocialAxis, number>>;

export interface CrewCombatSkills {
  readonly ranged: number;
  readonly melee: number;
}

export interface CrewPersonalEquipment {
  readonly ranged: string | null;
  readonly melee: string | null;
  readonly armor: string | null;
  readonly gear1: string | null;
  readonly gear2: string | null;
}

export interface CrewDefinition {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly share: number;
  readonly elite?: boolean;
  readonly socialTraits: CrewSocialTraits;
  readonly skills: Readonly<Record<ShipStationSkill, number>>;
  readonly combatSkills?: CrewCombatSkills;
  readonly personalEquipment?: CrewPersonalEquipment;
}

export type CrewInjuryState =
  | 'healthy'
  | 'light_wound'
  | 'severe_wound'
  | 'incapacitated'
  | 'dead';

export interface CrewMoraleState {
  motivation: number;
  loyalty: number;
  momentum: number;
  loyaltyMomentum: number;
}

export interface CrewMember {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly share: number;
  readonly elite: boolean;
  readonly portraitAssetUrl: string | null;
  readonly socialTraits: CrewSocialTraits;
  readonly skills: Record<ShipStationSkill, number>;
  readonly combatSkills: { ranged: number; melee: number };
  readonly personalEquipment: {
    ranged: string | null;
    melee: string | null;
    armor: string | null;
    gear1: string | null;
    gear2: string | null;
  };
  injuryState: CrewInjuryState;
  readonly morale: CrewMoraleState;
  readonly skillTrainingHours: Record<ShipStationSkill, number>;
  readonly combatTraining: { ranged: number; melee: number };
}

export interface CrewManningStatus {
  readonly used: number;
  readonly minimum: number;
  readonly shortfall: number;
  readonly factor: number;
  readonly ok: boolean;
}
