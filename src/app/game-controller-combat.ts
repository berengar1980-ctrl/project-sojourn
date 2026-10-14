import { combatEquippedWeapons, combatWeaponMounts } from '../systems/combat/combat-loadout-mounts';
import type { ShipDefinition } from '../core/ship-types';
import { createCombatShieldGeometry, type StrategicCombatantSetup } from '../systems/combat';
import {
  getShipComponent,
  resolveShipRuntimeSetup,
  resolveShipCombatMovementStats,
  type ShipRuntimeOptions,
} from '../systems/ships';

export function createPlayerCombatant(
  ship: ShipDefinition,
  options: ShipRuntimeOptions
): StrategicCombatantSetup {
  const runtime = resolveShipRuntimeSetup(ship, options);
  const movement = resolveShipCombatMovementStats(ship);
  const equippedWeapons = combatEquippedWeapons(ship, runtime.installed.weapon ?? []);
  const weapons = equippedWeapons.map((entry) => entry.component);
  const sensor = (runtime.installed.sensor ?? [])
    .map((id) => getShipComponent('sensor', id))
    .find((component) => component !== null);
  const mines = (runtime.installed.mine ?? []).flatMap((id) => {
    const component = getShipComponent('mine', id);
    return component?.mine ? [component.mine, component.mine, component.mine] : [];
  });

  return {
    id: 'player',
    name: ship.name,
    shipId: ship.id,
    shieldHp: runtime.shieldMaxHp,
    shieldGeometry: createCombatShieldGeometry(ship.sprite.hardpoints, ship.nominalLengthMeters),
    hullHp: runtime.hullMaxHp,
    weapons,
    weaponMounts: combatWeaponMounts(ship, equippedWeapons),
    hitChance: 0.72 + runtime.crewEffects.sensors.weaponHitChanceBonus,
    dodgeChance: runtime.crewEffects.piloting.dodgeChance,
    damageMultiplier: runtime.crewEffects.weapons.damageMultiplier,
    criticalChance: runtime.crewEffects.weapons.criticalChance,
    cycleTimeMultiplier: runtime.crewEffects.weapons.cycleTimeMultiplier,
    preferredTactic: 'fight',
    ...movement,
    mines,
    tractorRangeMeters: Math.max(
      0,
      ...(runtime.installed.tractor ?? []).map((id) => getShipComponent('tractor', id)?.range ?? 0)
    ),
    sensorCrewSkill: runtime.sensorCrewSkill,
    sensorTier: sensor?.tier ?? 0,
    sensorRangeMeters: runtime.scanAvailable ? 1000 : 0,
    sensorRangeMultiplier: runtime.sensorModifier || 1,
  };
}
