import type { LocalSpaceInstance } from '../core/local-space-types';
import type { WorldPoint } from '../core/world-types';
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

/** The live mining field is the combat arena: preserve rocks, inertia and geometry. */
export function localMiningCombatArena(instance: LocalSpaceInstance, velocity: WorldPoint) {
  return {
    width: instance.width,
    height: instance.height,
    attackerPosition: { ...instance.ship.position },
    attackerHeadingRadians: instance.ship.headingRadians,
    attackerVelocity: velocity,
    asteroids: instance.asteroids.map((asteroid) => ({
      id: asteroid.id,
      kind: asteroid.kind,
      position: { ...asteroid.position },
      velocity: { ...asteroid.physics.velocity },
      angularVelocity: asteroid.physics.angularVelocity,
      physics: { ...asteroid.physics, velocity: { ...asteroid.physics.velocity } },
      radius: asteroid.radius,
      rotation: asteroid.rotation,
    })),
    obstacles: instance.asteroids
      .filter((asteroid) => asteroid.kind === 'resource')
      .map((asteroid) => ({
        id: asteroid.id,
        position: { ...asteroid.position },
        radius: asteroid.radius,
      })),
  };
}
