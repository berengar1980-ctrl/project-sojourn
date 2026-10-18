import {
  combatEquippedWeapons,
  combatWeaponMounts,
} from '../../systems/combat/combat-loadout-mounts';
import {
  resolveShipCombatMovementStats,
  shipCombatTractorRange,
  shipHasIndustrialTractor,
  shipHullMaxHp,
  shipShieldMaxHp,
  type ShipDefinition,
} from '../../systems/ships';
import { createCombatShieldGeometry, type StrategicCombatantSetup } from '../../systems/combat';
import { crewDefinitionById } from '../../data/crew/crew-definitions';
import {
  pilotingDodgeChance,
  sensorWeaponHitChanceBonus,
  weaponDamageMultiplier,
  weaponCriticalChance,
  weaponCycleTimeMultiplier,
} from '../../systems/crew/crew-skill-effects';
import { SHIP_MINE_CATALOG } from '../../data/combat/ship-mines';

export interface DuelDraft {
  shipId: string;
  weapons: string[];
  mines: string[];
  crewId: string;
}

export function duelCombatant(
  index: number,
  draft: DuelDraft,
  ship: ShipDefinition
): StrategicCombatantSetup {
  const points = ship.sprite.hardpoints;
  const equipped = combatEquippedWeapons(ship, draft.weapons);
  const mounts = combatWeaponMounts(ship, equipped);
  const crew = crewDefinitionById(draft.crewId);
  const pilotSkill = crew?.skills.piloting ?? 50;
  const weaponSkill = crew?.skills.weapons ?? 50;
  const sensorSkill = crew?.skills.sensors ?? 50;
  return {
    id: 'duelist-' + index,
    name: 'Spieler ' + (index + 1) + ' · ' + ship.name,
    shipId: ship.id,
    shieldHp: shipShieldMaxHp(ship),
    shieldGeometry: createCombatShieldGeometry(points, ship.nominalLengthMeters),
    hullHp: shipHullMaxHp(ship),
    weapons: equipped.map((entry) => entry.component),
    mines: draft.mines.flatMap((id) => {
      const mine = SHIP_MINE_CATALOG.find((entry) => entry.id === id);
      return mine ? [mine] : [];
    }),
    weaponMounts: mounts,
    hitChance: 0.68 + sensorWeaponHitChanceBonus(sensorSkill),
    dodgeChance: pilotingDodgeChance(pilotSkill),
    damageMultiplier: weaponDamageMultiplier(weaponSkill),
    criticalChance: weaponCriticalChance(weaponSkill),
    cycleTimeMultiplier: weaponCycleTimeMultiplier(weaponSkill),
    preferredTactic: 'fight',
    ...resolveShipCombatMovementStats(ship),
    tractorRangeMeters: shipCombatTractorRange(),
    tractorCanManipulateObjects: shipHasIndustrialTractor(ship),
    aiControlled: true,
    aiAggression: 90,
  };
}
