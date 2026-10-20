import type { ShipStationSkill } from '../../core/ship-types';
import type { CrewSkillEffects } from '../../systems/crew/crew-skill-effects';

function percent(value: number): string {
  return (value * 100).toFixed(1).replace('.', ',') + ' %';
}

export function stationEffectSummary(skill: ShipStationSkill, effects: CrewSkillEffects): string {
  switch (skill) {
    case 'piloting':
      return (
        'GESCHW. +' +
        percent(effects.piloting.travelSpeedMultiplier - 1) +
        ' · RCS +' +
        percent(effects.piloting.turnRateMultiplier - 1) +
        ' · TREIBSTOFF −' +
        percent(1 - effects.piloting.fuelUseMultiplier)
      );
    case 'sensors':
      return (
        'TREFFERCHANCE +' +
        percent(effects.sensors.weaponHitChanceBonus) +
        '-PKT. · ORTUNG ' +
        effects.sensors.contactBaseRange.toFixed(1).replace('.', ',')
      );
    case 'weapons':
      return (
        'SCHADEN +' +
        percent(effects.weapons.damageMultiplier - 1) +
        ' · KRIT +' +
        percent(effects.weapons.criticalChance) +
        '-PKT. · ZYKLUS −' +
        percent(1 - effects.weapons.cycleTimeMultiplier)
      );
    case 'engineering':
      return (
        'SCHILD +' +
        percent(effects.engineering.shieldStrengthMultiplier - 1) +
        ' · REPARATUR −' +
        percent(1 - effects.engineering.repairCostMultiplier) +
        ' · TREIBSTOFF −' +
        percent(1 - effects.engineering.fuelUseMultiplier)
      );
    case 'mining':
      return (
        'AUSBEUTE +' +
        percent(effects.mining.yieldMultiplier - 1) +
        ' · ARBEITSZEIT −' +
        percent(1 - effects.mining.workTimeMultiplier)
      );
    case 'salvage':
      return (
        'AUSBEUTE +' +
        percent(effects.salvage.yieldMultiplier - 1) +
        ' · ARBEITSZEIT −' +
        percent(1 - effects.salvage.workTimeMultiplier)
      );
    case 'logistics':
      return (
        'FRACHT +' +
        percent(effects.logistics.cargoCapacityMultiplier - 1) +
        ' · VERKAUFSGEBÜHR ' +
        percent(effects.logistics.saleFeeRate)
      );
  }
}
