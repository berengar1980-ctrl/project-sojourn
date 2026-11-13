import type { BoardingEncounterSnapshot, BoardingUnitTemplate } from '../../core/boarding-types';
import { personalMeleeProfile, personalRangedProfile } from './boarding-personal-profiles';
import type { CrewInjuryState, CrewMember } from '../../core/crew-types';
import type { CrewRosterService } from '../crew';
import {
  createBoardingTacticalService,
  type BoardingTacticalService,
} from './boarding-tactical-service';

const ARMOR: Readonly<Record<string, number>> = {
  flak_vest: 1,
  flak_armour: 2,
  naval_flak: 2,
  mesh_armour: 3,
  carapace: 4,
  enforcer_carapace: 4,
  void_suit_armoured: 3,
  carapace_officer: 4,
  refractor_harness: 4,
  conversion_field: 5,
};

const RANGED_GEAR_BONUS: Readonly<Record<string, number>> = {
  hand_auspex: 0,
  auspex_pistol: 4,
  photo_visor: 4,
  preysense: 6,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function crewBoardingWeapon(member: CrewMember) {
  return personalRangedProfile(member.personalEquipment.ranged);
}

export function crewBoardingMeleeWeapon(member: CrewMember) {
  return personalMeleeProfile(member.personalEquipment.melee);
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
    maxHp: 10,
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
  if (fraction <= 0.7) return 'severe_wound';
  if (fraction <= 0.9) return 'light_wound';
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
  readonly allowRetreat?: boolean;
  readonly restoreSnapshot?: BoardingEncounterSnapshot;
}): CrewBoardingEncounter {
  let settled = false;
  const base = createBoardingTacticalService({
    seed: options.seed,
    ...(options.mapId ? { mapId: options.mapId } : {}),
    playerUnits: crewBoardingUnits(options.roster),
    enemyUnits: options.enemyUnits,
    ...(options.allowRetreat === undefined ? {} : { allowRetreat: options.allowRetreat }),
    ...(options.restoreSnapshot ? { restore: options.restoreSnapshot } : {}),
  });

  const tactical: BoardingTacticalService = {
    getSnapshot: () => base.getSnapshot(),
    selectUnit: (unitId) => base.selectUnit(unitId),
    reachable: (unitId, maximumAp) => base.reachable(unitId, maximumAp),
    move: (unitId, target) => base.move(unitId, target),
    openDoor: (unitId, doorId) => base.openDoor(unitId, doorId),
    shoot: (attackerId, targetId) => base.shoot(attackerId, targetId),
    melee: (attackerId, targetId) => base.melee(attackerId, targetId),
    suppress: (attackerId, targetId) => base.suppress(attackerId, targetId),
    suppressArea: (unitId, center) => base.suppressArea(unitId, center),
    overwatch: (unitId, target) => base.overwatch(unitId, target),
    holdCover: (unitId) => base.holdCover(unitId),
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
        options.roster.accrueCombatTraining(unit.id, 'ranged', unit.rangedActions);
        options.roster.accrueCombatTraining(unit.id, 'melee', unit.meleeActions);
      }
      return snapshot;
    },
  };
}
