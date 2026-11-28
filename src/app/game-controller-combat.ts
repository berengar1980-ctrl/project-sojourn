import { combatEquippedWeapons, combatWeaponMounts } from '../systems/combat/combat-loadout-mounts';
import type { ShipDefinition } from '../core/ship-types';
import { createCombatShieldGeometry, type StrategicCombatantSetup } from '../systems/combat';
import {
  getShipComponent,
  resolveShipCombatProfile,
  resolveShipRuntimeSetup,
  type ShipRuntimeOptions,
} from '../systems/ships';

export function createPlayerCombatant(
  ship: ShipDefinition,
  options: ShipRuntimeOptions
): StrategicCombatantSetup {
  const runtime = resolveShipRuntimeSetup(ship, options);
  const profile = resolveShipCombatProfile(
    ship,
    runtime.installed,
    runtime.stationSkills,
    runtime.scanAvailable
  );
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
    shieldHp: profile.shieldMaxHp,
    shieldGeometry: createCombatShieldGeometry(ship.sprite.hardpoints, ship.nominalLengthMeters),
    hullHp: profile.hullMaxHp,
    ...(profile.armor ? { armor: profile.armor } : {}),
    weapons,
    weaponMounts: combatWeaponMounts(ship, equippedWeapons),
    hitChance: profile.hitChance,
    dodgeChance: profile.dodgeChance,
    damageMultiplier: profile.damageMultiplier,
    criticalChance: profile.criticalChance,
    cycleTimeMultiplier: profile.cycleTimeMultiplier,
    preferredTactic: 'fight',
    combatSpeed: profile.combatSpeed,
    turnRateRadiansPerSecond: profile.turnRateRadiansPerSecond,
    accelerationMetersPerSecond2: profile.accelerationMetersPerSecond2,
    mines,
    tractorRangeMeters: profile.tractorRangeMeters,
    power: profile.power,
    tractorCanManipulateObjects: profile.tractorCanManipulateObjects,
    sensorTier: profile.sensorTier,
    sensorCrewSkill: profile.sensorCrewSkill,
    sensorRangeMeters: profile.sensorRangeMeters,
    sensorRangeMultiplier: profile.sensorRangeMultiplier,
  };
}

// Mining-to-combat conversion is shared by the campaign and standalone duels.
export { miningFieldCombatArena as localMiningCombatArena } from '../systems/combat/field-combat-arena';
