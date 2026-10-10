import type { ShipDefinition } from '../core/ship-types';
import { createCombatShieldGeometry, type StrategicCombatantSetup } from '../systems/combat';
import {
  getShipComponent,
  fitsWeaponHardpoint,
  resolveShipRuntimeSetup,
  resolveShipCombatMovementStats,
  type ShipRuntimeOptions,
} from '../systems/ships';

function combatWeaponMounts(ship: ShipDefinition, slots: readonly number[]) {
  const points = ship.sprite.hardpoints;
  const scale = ship.nominalLengthMeters / points.sourceWidth;
  return (points.weaponMounts ?? [])
    .filter((mount) => slots.includes(mount.slotIndex))
    .map((mount) => ({
      slotIndex: slots.indexOf(mount.slotIndex),
      x: (mount.x - points.pivot.x) * scale,
      y: (mount.y - points.pivot.y) * scale,
      facing: mount.facing,
      ...(mount.arcDegrees !== undefined ? { arcDegrees: mount.arcDegrees } : {}),

      ...(mount.allowedMounts ? { allowedMounts: mount.allowedMounts } : {}),

      ...(mount.allowedFamilies ? { allowedFamilies: mount.allowedFamilies } : {}),
    }));
}

export function createPlayerCombatant(
  ship: ShipDefinition,
  options: ShipRuntimeOptions
): StrategicCombatantSetup {
  const runtime = resolveShipRuntimeSetup(ship, options);
  const movement = resolveShipCombatMovementStats(ship);
  const equippedWeapons = (runtime.installed.weapon ?? []).flatMap((id, slotIndex) => {
    const component = getShipComponent('weapon', id);
    return component?.weapon && fitsWeaponHardpoint(ship, slotIndex, component.weapon)
      ? [{ component, slotIndex }]
      : [];
  });
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
    weaponMounts: combatWeaponMounts(
      ship,
      equippedWeapons.map((entry) => entry.slotIndex)
    ),
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
