export type BoardingTeam = 'player' | 'enemy';
export type BoardingOutcome = 'active' | 'player_win' | 'enemy_win' | 'retreat';

export interface BoardingHex {
  readonly q: number;
  readonly r: number;
}

export interface BoardingDoor extends BoardingHex {
  readonly id: string;
}

export interface BoardingCoverEdge extends BoardingHex {
  readonly side: number;
}

export interface BoardingMapDefinition {
  readonly id: string;
  readonly name: string;
  readonly columns: number;
  readonly rows: number;
  readonly walls: readonly string[];
  readonly doors: readonly BoardingDoor[];
  readonly cover: readonly BoardingCoverEdge[];
}

export interface BoardingWeaponProfile {
  readonly id: string;
  readonly name: string;
  readonly range: number;
  readonly hitBonus: number;
  readonly damage: number;
  readonly armorPenetration: number;
  readonly spread: number;
  readonly canSuppress: boolean;
  readonly meleeBonus?: number;
  readonly spreadMode?: 'cone';
  readonly piercing?: {
    readonly maxArmor: number;
    readonly bonusDamage: number;
  };
}

export interface BoardingMeleeProfile {
  readonly id: string;
  readonly name: string;
  readonly hitBonus: number;
  readonly damage: number;
  readonly armorPenetration: number;
}

export interface BoardingUnit {
  readonly id: string;
  readonly name: string;
  readonly team: BoardingTeam;
  q: number;
  r: number;
  hp: number;
  readonly maxHp: number;
  readonly armor: number;
  readonly rangedSkill: number;
  readonly meleeSkill: number;
  readonly weapon: BoardingWeaponProfile;
  readonly meleeWeapon: BoardingMeleeProfile;
  ap: number;
  combatUsed: boolean;
  suppressed: boolean;
  overwatch: boolean;
  overwatchTarget: BoardingHex | null;
  holdingCover: boolean;
  reactionUsed: boolean;
  rangedActions: number;
  meleeActions: number;
}

export interface BoardingUnitTemplate {
  readonly id: string;
  readonly name: string;
  readonly team: BoardingTeam;
  readonly hp?: number;
  readonly maxHp?: number;
  readonly armor?: number;
  readonly rangedSkill?: number;
  readonly meleeSkill?: number;
  readonly weapon?: BoardingWeaponProfile;
  readonly meleeWeapon?: BoardingMeleeProfile;
}

export interface BoardingSuppressionZone {
  readonly ownerId: string;
  readonly team: BoardingTeam;
  readonly center: BoardingHex;
}

export interface BoardingCombatLogEntry {
  readonly round: number;
  readonly text: string;
}

export interface BoardingEncounterSnapshot {
  readonly seed: number;
  readonly map: BoardingMapDefinition;
  readonly round: number;
  readonly activeTeam: BoardingTeam;
  readonly selectedUnitId: string | null;
  readonly outcome: BoardingOutcome;
  readonly units: readonly BoardingUnit[];
  readonly doorStates: Readonly<Record<string, boolean>>;
  readonly log: readonly BoardingCombatLogEntry[];
  readonly suppressionZones: readonly BoardingSuppressionZone[];
  readonly allowRetreat: boolean;
  readonly randomCalls: number;
}

export interface BoardingAttackResult {
  readonly attackerId: string;
  readonly targetId: string;
  readonly hit: boolean;
  readonly chancePercent: number;
  readonly damage: number;
  readonly targetHp: number;
  readonly targetDefeated: boolean;
}
