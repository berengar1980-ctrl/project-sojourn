import type { ShipDefinition } from '../core/ship-types';
import { getShipMine, type StrategicCombatantSetup } from '../systems/combat';
import {
  getShipComponent,
  resolveShipRuntimeSetup,
  type ShipRuntimeOptions,
} from '../systems/ships';

export function createPlayerCombatant(
  ship: ShipDefinition,
  options: ShipRuntimeOptions
): StrategicCombatantSetup {
  const runtime = resolveShipRuntimeSetup(ship, options);
  const weapons = (runtime.installed.weapon ?? []).flatMap((id) => {
    const component = getShipComponent('weapon', id);
    return component?.weapon ? [component] : [];
  });
  const sensor = (runtime.installed.sensor ?? [])
    .map((id) => getShipComponent('sensor', id))
    .find((component) => component !== null);
  const mineTier = Math.max(1, Math.min(6, runtime.stats.maxComponentTier));
  const mines = [
    getShipMine('mine-ion-' + mineTier),
    getShipMine('mine-shaped-charge-' + mineTier),
    getShipMine('mine-hunter-' + mineTier),
  ].filter((mine): mine is NonNullable<typeof mine> => mine !== null);

  return {
    id: 'player',
    name: ship.name,
    shipId: ship.id,
    shieldHp: runtime.shieldMaxHp,
    hullHp: runtime.hullMaxHp,
    weapons,
    hitChance: 0.72 + runtime.crewEffects.sensors.weaponHitChanceBonus,
    dodgeChance: runtime.crewEffects.piloting.dodgeChance,
    damageMultiplier: runtime.crewEffects.weapons.damageMultiplier,
    criticalChance: runtime.crewEffects.weapons.criticalChance,
    cycleTimeMultiplier: runtime.crewEffects.weapons.cycleTimeMultiplier,
    preferredTactic: 'fight',
    combatSpeed: Math.max(82, Math.min(150, ship.navigation.cruiseSpeed * 0.28)),
    turnRateRadiansPerSecond: Math.max(0.42, Math.min(0.86, 1.02 - ship.nominalLengthMeters * 0.006)),
    accelerationMetersPerSecond2: Math.max(20, Math.min(38, 46 - ship.nominalLengthMeters * 0.18)),
    mines,
    sensorCrewSkill: runtime.sensorCrewSkill,
    sensorTier: sensor?.tier ?? 0,
    sensorRangeMeters: runtime.scanAvailable ? 1000 : 0,
    sensorRangeMultiplier: runtime.sensorModifier || 1,
  };
}
