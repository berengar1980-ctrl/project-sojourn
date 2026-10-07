import type { ShipDefinition } from '../core/ship-types';
import type { StrategicCombatantSetup } from '../systems/combat';
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
    combatSpeed: Math.max(90, Math.min(190, ship.navigation.cruiseSpeed * 0.35)),
    mineCharges: 3,
  };
}
