import type { ShipDefinition, ShipStationSkill } from '../../core/ship-types';
import { crewSkillEffects } from '../crew/crew-skill-effects';
import type { InstalledShipComponents } from './ship-component-service';
import {
  calculateShipModeEnergy,
  componentHullBonus,
  componentShieldBonus,
  combatSensorStats,
  resolveShipArmorProtection,
} from './ship-component-service';
import { shipCombatTractorRange, shipHasIndustrialTractor } from './ship-combat-role-policy';
import { resolveShipCombatMovementStats, shipHullMaxHp, shipShieldMaxHp } from './ship-stats';

export type ShipCombatCrewSkills = Readonly<Partial<Record<ShipStationSkill, number>>>;

/** Resolve equipment and crew combat values through the same formulas in every combat mode. */
export function resolveShipCombatProfile(
  ship: ShipDefinition,
  installed: InstalledShipComponents,
  skills: ShipCombatCrewSkills,
  scanAvailable = true
) {
  const effects = crewSkillEffects({
    piloting: skills.piloting ?? 0,
    sensors: skills.sensors ?? 0,
    weapons: skills.weapons ?? 0,
    engineering: skills.engineering ?? 0,
    salvage: skills.salvage ?? 0,
    mining: skills.mining ?? 0,
    logistics: skills.logistics ?? 0,
  });

  return {
    shieldMaxHp: Math.max(
      1,
      Math.round(
        (shipShieldMaxHp(ship) + componentShieldBonus(installed)) *
          effects.engineering.shieldStrengthMultiplier
      )
    ),
    hullMaxHp: shipHullMaxHp(ship, componentHullBonus(installed)),
    armor: resolveShipArmorProtection(installed),
    ...resolveShipCombatMovementStats(ship, installed, skills.piloting ?? 0),
    hitChance: 0.68 + effects.sensors.weaponHitChanceBonus,
    dodgeChance: effects.piloting.dodgeChance,
    damageMultiplier: effects.weapons.damageMultiplier,
    criticalChance: effects.weapons.criticalChance,
    cycleTimeMultiplier: effects.weapons.cycleTimeMultiplier,
    power: calculateShipModeEnergy(installed),
    tractorRangeMeters: shipCombatTractorRange(installed),
    tractorCanManipulateObjects: shipHasIndustrialTractor(ship),
    ...combatSensorStats(installed, skills.sensors ?? 0, scanAvailable),
  };
}
