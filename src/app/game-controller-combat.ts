import { combatEquippedWeapons, combatWeaponMounts } from '../systems/combat/combat-loadout-mounts';
import type { ShipDefinition } from '../core/ship-types';
import { createCombatShieldGeometry, type StrategicCombatantSetup } from '../systems/combat';
import {
  getShipComponent,
  combatSensorStats,
  calculateShipModeEnergy,
  resolveShipArmorProtection,
  resolveShipRuntimeSetup,
  resolveShipCombatMovementStats,
  shipCombatTractorRange,
  shipHasIndustrialTractor,
  type ShipRuntimeOptions,
} from '../systems/ships';

export function createPlayerCombatant(
  ship: ShipDefinition,
  options: ShipRuntimeOptions
): StrategicCombatantSetup {
  const runtime = resolveShipRuntimeSetup(ship, options);
  const movement = resolveShipCombatMovementStats(
    ship,
    runtime.installed,
    runtime.stationSkills.piloting
  );
  const armor = resolveShipArmorProtection(runtime.installed);
  const equippedWeapons = combatEquippedWeapons(ship, runtime.installed.weapon ?? []);
  const weapons = equippedWeapons.map((entry) => entry.component);
  const mines = (runtime.installed.mine ?? []).flatMap((id) => {
    const component = getShipComponent('mine', id);
    return component?.mine ? [component.mine, component.mine, component.mine] : [];
  });

  return {
    id: 'player',
    name: ship.name,
    shipId: ship.id,
    nominalLengthMeters: ship.nominalLengthMeters,
    shieldHp: runtime.shieldMaxHp,
    shieldGeometry: createCombatShieldGeometry(ship.sprite.hardpoints, ship.nominalLengthMeters),
    hullHp: runtime.hullMaxHp,
    ...(armor ? { armor } : {}),
    weapons,
    weaponMounts: combatWeaponMounts(ship, equippedWeapons),
    hitChance: 0.68 + runtime.crewEffects.sensors.weaponHitChanceBonus,
    dodgeChance: runtime.crewEffects.piloting.dodgeChance,
    damageMultiplier: runtime.crewEffects.weapons.damageMultiplier,
    criticalChance: runtime.crewEffects.weapons.criticalChance,
    cycleTimeMultiplier: runtime.crewEffects.weapons.cycleTimeMultiplier,
    preferredTactic: 'fight',
    ...movement,
    mines,
    tractorRangeMeters: shipCombatTractorRange(runtime.installed),
    power: calculateShipModeEnergy(runtime.installed),
    tractorCanManipulateObjects: shipHasIndustrialTractor(ship),
    ...combatSensorStats(runtime.installed, runtime.sensorCrewSkill, runtime.scanAvailable),
  };
}

// Mining-to-combat conversion is shared by the campaign and standalone duels.
export { miningFieldCombatArena as localMiningCombatArena } from '../systems/combat/field-combat-arena';
