import type { SectorNpcState } from '../../core/npc-types';

import {
  pilotingDodgeChance,
  sensorWeaponHitChanceBonus,
  weaponCriticalChance,
  weaponCycleTimeMultiplier,
  weaponDamageMultiplier,
} from '../crew/crew-skill-effects';

import {
  componentHullBonus,
  componentShieldBonus,
  getShipComponent,
  getShipDefinition,
  shipHullMaxHp,
  shipShieldMaxHp,
  type InstalledShipComponents,
} from '../ships';

import { npcDefenseReaction } from '../npcs/npc-combat-ai';

import { ensureNpcInstalledComponents } from '../npcs/npc-upgrade-service';

import {
  createCombatShieldGeometry,
  type StrategicCombatantSetup,
} from './strategic-combat-service';

function npcWeaponComponents(installed: InstalledShipComponents) {
  return (installed.weapon ?? []).flatMap((id) => {
    const component = getShipComponent('weapon', id);
    return component?.weapon ? [component] : [];
  });
}

function npcCombatSkill(npc: SectorNpcState): number {
  return Math.min(90, 35 + npc.aggression * 0.5);
}

export function npcCombatant(npc: SectorNpcState): StrategicCombatantSetup | null {
  const ship = getShipDefinition(npc.shipId);
  if (!ship) return null;
  const installed = ensureNpcInstalledComponents(npc);
  const hullMax = shipHullMaxHp(ship, componentHullBonus(installed));
  const shieldMax = shipShieldMaxHp(ship) + componentShieldBonus(installed);
  const skill = npcCombatSkill(npc);
  const sensor = (installed.sensor ?? [])
    .map((id) => getShipComponent('sensor', id))
    .find((component) => component !== null);
  const mines = (installed.mine ?? []).flatMap((id) => {
    const component = getShipComponent('mine', id);
    return component?.mine ? [component.mine, component.mine, component.mine] : [];
  });

  return {
    id: npc.id,
    name: npc.name,
    shipId: ship.id,
    shieldHp: Math.max(1, shieldMax),
    shieldGeometry: createCombatShieldGeometry(ship.sprite.hardpoints, ship.nominalLengthMeters),
    hullHp: Math.max(1, Math.min(hullMax, npc.hullHp)),
    weapons: npcWeaponComponents(installed),
    hitChance: 0.68 + sensorWeaponHitChanceBonus(skill),
    dodgeChance: pilotingDodgeChance(skill),
    damageMultiplier: weaponDamageMultiplier(skill),
    criticalChance: weaponCriticalChance(skill),
    cycleTimeMultiplier: weaponCycleTimeMultiplier(skill),
    preferredTactic:
      npcDefenseReaction(npc) === 'flee'
        ? 'flee'
        : (npc.job === 'patrol' || npc.pirate) && npc.aggression >= 82
          ? 'kite'
          : 'fight',
    combatSpeed:
      npc.job === 'patrol' || npc.pirate
      ? Math.max(185, Math.min(320, ship.navigation.cruiseSpeed * 0.48))
      : Math.max(78, Math.min(145, ship.navigation.cruiseSpeed * 0.27)),
    turnRateRadiansPerSecond: Math.max(
      0.4,
      Math.min(0.82, 0.98 - ship.nominalLengthMeters * 0.006)
    ),
    accelerationMetersPerSecond2: Math.max(18, Math.min(36, 44 - ship.nominalLengthMeters * 0.18)),
    mines,
    tractorRangeMeters: Math.max(
      0,
      ...(installed.tractor ?? []).map((id) => getShipComponent('tractor', id)?.range ?? 0)
    ),
    sensorCrewSkill: skill,
    sensorTier: sensor?.tier ?? 0,
    sensorRangeMeters: sensor ? 1000 : 0,
    sensorRangeMultiplier: sensor ? 1 + Number(sensor.range ?? 0) : 1,
    aiControlled: true,
    aiAggression: npc.aggression,
    ...(npc.factionId ? { factionId: npc.factionId } : {}),
    ...(npc.pirateMark ? { pirateMark: npc.pirateMark } : {}),
  };
}

export function transferPirateLoot(pirate: SectorNpcState, victim: SectorNpcState): number {
  let remaining = 10;
  let stolen = 0;
  const cargo = Object.entries(victim.cargo)
    .filter(([, quantity]) => quantity > 0)
    .sort((first, second) => second[1] - first[1]);
  for (const [resourceId, available] of cargo) {
    if (remaining <= 0) break;
    const quantity = Math.min(remaining, Math.max(0, Math.floor(available)));
    if (quantity <= 0) continue;
    victim.cargo[resourceId] = Math.max(0, victim.cargo[resourceId]! - quantity);
    if (victim.cargo[resourceId] <= 0) delete victim.cargo[resourceId];
    pirate.cargo[resourceId] = (pirate.cargo[resourceId] ?? 0) + quantity;
    remaining -= quantity;
    stolen += quantity;
  }
  if (stolen > 0) {
    pirate.activityId = 'raiding';
    pirate.activity = 'Beutezug gegen ' + victim.name;
  }
  return stolen;
}
