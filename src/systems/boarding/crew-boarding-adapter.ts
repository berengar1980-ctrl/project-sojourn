import type {
  BoardingEncounterSnapshot,
  BoardingMeleeProfile,
  BoardingUnitTemplate,
  BoardingWeaponProfile,
} from '../../core/boarding-types';
import type { CrewInjuryState, CrewMember } from '../../core/crew-types';
import type { CrewRosterService } from '../crew';
import {
  createBoardingTacticalService,
  type BoardingTacticalService,
} from './boarding-tactical-service';

const RANGED: Readonly<Record<string, BoardingWeaponProfile>> = {
  off_autopistol: { id: 'off_autopistol', name: 'Kompakte Autopistole', range: 3, hitBonus: 4, damage: 3, armorPenetration: 0, spread: 5, canSuppress: false },
  boltgun: { id: 'boltgun', name: 'Bolter', range: 5, hitBonus: 6, damage: 6, armorPenetration: 2, spread: 3, canSuppress: true },
  hotshot_lasgun: { id: 'hotshot_lasgun', name: 'Hot-shot Lasgun', range: 6, hitBonus: 8, damage: 5, armorPenetration: 2, spread: 2, canSuppress: true },
  plasma_pistol: { id: 'plasma_pistol', name: 'Plasmapistole', range: 4, hitBonus: 4, damage: 6, armorPenetration: 3, spread: 4, canSuppress: false },
  plasma_gun: { id: 'plasma_gun', name: 'Plasmagewehr', range: 5, hitBonus: 5, damage: 7, armorPenetration: 4, spread: 3, canSuppress: true },
  melta_gun: { id: 'melta_gun', name: 'Meltergewehr', range: 3, hitBonus: 8, damage: 8, armorPenetration: 5, spread: 5, canSuppress: false },
  needle_rifle: { id: 'needle_rifle', name: 'Nadelgewehr', range: 6, hitBonus: 10, damage: 5, armorPenetration: 2, spread: 1, canSuppress: false },
};

const MELEE: Readonly<Record<string, BoardingMeleeProfile>> = {
  combat_knife: { id: 'combat_knife', name: 'Kampfmesser', hitBonus: 10, damage: 3, armorPenetration: 0 },
  dueling_blade: { id: 'dueling_blade', name: 'Duellklinge', hitBonus: 12, damage: 4, armorPenetration: 1 },
  power_axe: { id: 'power_axe', name: 'Energieaxt', hitBonus: 4, damage: 7, armorPenetration: 4 },
  power_sword: { id: 'power_sword', name: 'Energieschwert', hitBonus: 8, damage: 8, armorPenetration: 5 },
};

const ARMOR: Readonly<Record<string, number>> = {
  flak_vest: 1,
  void_suit_armoured: 3,
  carapace_officer: 4,
  refractor_harness: 4,
  conversion_field: 5,
};

const RANGED_GEAR_BONUS: Readonly<Record<string, number>> = {
  hand_auspex: 0,
  photo_visor: 4,
  preysense: 6,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function crewBoardingWeapon(member: CrewMember): BoardingWeaponProfile {
  const id = member.personalEquipment.ranged ?? 'off_autopistol';
  return RANGED[id] ?? RANGED.off_autopistol!;
}

export function crewBoardingMeleeWeapon(member: CrewMember): BoardingMeleeProfile {
  const id = member.personalEquipment.melee ?? 'combat_knife';
  return MELEE[id] ?? MELEE.combat_knife!;
}

export function crewBoardingArmor(member: CrewMember): number {
  const base = ARMOR[member.personalEquipment.armor ?? 'flak_vest'] ?? 1;
  const gearDefense =
    (member.personalEquipment.gear1 === 'boarding_shield' ? 1 : 0) +
    (member.personalEquipment.gear2 === 'boarding_shield' ? 1 : 0);
  return clamp(base + gearDefense, 0, 5);
}

function gearRangedBonus(member: CrewMember): number {
  return (
    (RANGED_GEAR_BONUS[member.personalEquipment.gear1 ?? ''] ?? 0) +
    (RANGED_GEAR_BONUS[member.personalEquipment.gear2 ?? ''] ?? 0)
  );
}

function boardingHp(member: CrewMember): number {
  if (member.injuryState === 'light_wound') return 9;
  if (member.injuryState === 'severe_wound') return 7;
  return 10;
}

export function crewMemberToBoardingUnit(member: CrewMember): BoardingUnitTemplate | null {
  if (member.injuryState === 'incapacitated' || member.injuryState === 'dead') return null;
  return {
    id: member.id,
    name: member.name,
    team: 'player',
    hp: boardingHp(member),
    armor: crewBoardingArmor(member),
    rangedSkill: clamp(member.combatSkills.ranged + gearRangedBonus(member), 0, 100),
    meleeSkill: clamp(member.combatSkills.melee, 0, 100),
    weapon: crewBoardingWeapon(member),
    meleeWeapon: crewBoardingMeleeWeapon(member),
  };
}

export function crewBoardingUnits(roster: CrewRosterService): readonly BoardingUnitTemplate[] {
  return roster
    .list()
    .map(crewMemberToBoardingUnit)
    .filter((unit): unit is BoardingUnitTemplate => unit !== null);
}

function injuryFromBoarding(hp: number, maxHp: number): CrewInjuryState {
  if (hp <= 0) return 'incapacitated';
  const fraction = hp / Math.max(1, maxHp);
  if (fraction <= 0.35) return 'severe_wound';
  if (fraction <= 0.7) return 'light_wound';
  return 'healthy';
}

export interface CrewBoardingEncounter {
  readonly tactical: BoardingTacticalService;
  settle(): BoardingEncounterSnapshot;
}

export function createCrewBoardingEncounter(options: {
  readonly roster: CrewRosterService;
  readonly seed: number;
  readonly mapId?: string;
  readonly enemyUnits: readonly BoardingUnitTemplate[];
}): CrewBoardingEncounter {
  const rangedRounds = new Map<string, number>();
  const meleeRounds = new Map<string, number>();
  let settled = false;
  const base = createBoardingTacticalService({
    seed: options.seed,
    ...(options.mapId ? { mapId: options.mapId } : {}),
    playerUnits: crewBoardingUnits(options.roster),
    enemyUnits: options.enemyUnits,
  });

  const tactical: BoardingTacticalService = {
    getSnapshot: () => base.getSnapshot(),
    selectUnit: (unitId) => base.selectUnit(unitId),
    reachable: (unitId, maximumAp) => base.reachable(unitId, maximumAp),
    move: (unitId, target) => base.move(unitId, target),
    openDoor: (unitId, doorId) => base.openDoor(unitId, doorId),
    shoot: (attackerId, targetId) => {
      const result = base.shoot(attackerId, targetId);
      if (result && options.roster.member(attackerId)) {
        rangedRounds.set(attackerId, (rangedRounds.get(attackerId) ?? 0) + 1);
      }
      return result;
    },
    melee: (attackerId, targetId) => {
      const result = base.melee(attackerId, targetId);
      if (result && options.roster.member(attackerId)) {
        meleeRounds.set(attackerId, (meleeRounds.get(attackerId) ?? 0) + 1);
      }
      return result;
    },
    suppress: (attackerId, targetId) => {
      const result = base.suppress(attackerId, targetId);
      if (result && options.roster.member(attackerId)) {
        rangedRounds.set(attackerId, (rangedRounds.get(attackerId) ?? 0) + 1);
      }
      return result;
    },
    endTurn: () => base.endTurn(),
    retreat: () => base.retreat(),
  };

  return {
    tactical,
    settle() {
      const snapshot = base.getSnapshot();
      if (settled || snapshot.outcome === 'active') return snapshot;
      settled = true;
      for (const unit of snapshot.units.filter((entry) => entry.team === 'player')) {
        if (!options.roster.member(unit.id)) continue;
        options.roster.setInjuryState(unit.id, injuryFromBoarding(unit.hp, unit.maxHp));
        options.roster.accrueCombatTraining(unit.id, 'ranged', rangedRounds.get(unit.id) ?? 0);
        options.roster.accrueCombatTraining(unit.id, 'melee', meleeRounds.get(unit.id) ?? 0);
      }
      return snapshot;
    },
  };
}
