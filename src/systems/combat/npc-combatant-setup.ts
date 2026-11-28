import { DRONE_SHIELD_RADIUS_METERS, isSecurityDrone } from '../../core/security-drone';
import { combatEquippedWeapons, combatWeaponMounts } from './combat-loadout-mounts';
import type { SectorNpcState } from '../../core/npc-types';

import { getShipComponent, getShipDefinition, resolveShipCombatProfile } from '../ships';

import { npcDefenseReaction } from '../npcs/npc-combat-ai';
import { civilianCombatOpening, civilianCombatRole } from './combat-civilian-policy';

import { ensureNpcInstalledComponents } from '../npcs/npc-upgrade-service';

import {
  createCombatShieldGeometry,
  type StrategicCombatantSetup,
} from './strategic-combat-service';

function npcCombatSkill(npc: SectorNpcState): number {
  return Math.min(90, 35 + npc.aggression * 0.5);
}

export function npcCombatDoctrine(
  npc: SectorNpcState,
  armedMines: boolean,
  armedWeapons = false
): 'fight' | 'kite' | 'flee' | 'minefield' {
  if (npc.id?.startsWith('security-drone:')) return 'fight';
  if (civilianCombatRole(npc.job)) {
    const hullRatio = npc.hullMaxHp > 0 ? npc.hullHp / npc.hullMaxHp : 0;
    return civilianCombatOpening(hullRatio, npc.aggression, armedWeapons, armedMines);
  }
  if (npcDefenseReaction(npc) === 'flee') return 'flee';
  if (npc.job === 'pirate' || npc.pirate)
    return armedMines && npc.aggression >= 70 ? 'minefield' : 'fight';
  if (npc.job === 'patrol') return npc.aggression >= 70 ? 'kite' : 'fight';
  return 'fight';
}

function radialDroneArmor(armor: NonNullable<StrategicCombatantSetup['armor']>) {
  const protection = (armor.front + armor.rear + armor.port + armor.starboard) / 4;
  return { front: protection, rear: protection, port: protection, starboard: protection };
}

export function npcCombatant(npc: SectorNpcState): StrategicCombatantSetup | null {
  const ship = getShipDefinition(npc.shipId);
  if (!ship) return null;
  const installed = ensureNpcInstalledComponents(npc);
  const skill = npcCombatSkill(npc);
  const profile = resolveShipCombatProfile(ship, installed, {
    piloting: skill,
    sensors: skill,
    weapons: skill,
  });
  const drone = isSecurityDrone(npc.id);
  const armor = drone && profile.armor ? radialDroneArmor(profile.armor) : profile.armor;
  const equippedWeapons = combatEquippedWeapons(ship, installed.weapon ?? []);
  const mines = (installed.mine ?? []).flatMap((id) => {
    const component = getShipComponent('mine', id);
    return component?.mine ? [component.mine, component.mine, component.mine] : [];
  });

  return {
    id: npc.id,
    name: npc.name,
    shipId: ship.id,
    nominalLengthMeters: ship.nominalLengthMeters,
    shieldHp: profile.shieldMaxHp,
    shieldGeometry: drone
      ? {
          centerOffset: { x: 0, y: 0 },
          radiusX: DRONE_SHIELD_RADIUS_METERS,
          radiusY: DRONE_SHIELD_RADIUS_METERS,
          modifier: 1,
        }
      : createCombatShieldGeometry(ship.sprite.hardpoints, ship.nominalLengthMeters),
    hullHp: Math.max(1, Math.min(profile.hullMaxHp, npc.hullHp)),
    ...(armor ? { armor } : {}),
    weapons: equippedWeapons.map((entry) => entry.component),
    weaponMounts: combatWeaponMounts(ship, equippedWeapons),
    hitChance: profile.hitChance,
    dodgeChance: profile.dodgeChance,
    damageMultiplier: profile.damageMultiplier,
    criticalChance: profile.criticalChance,
    cycleTimeMultiplier: profile.cycleTimeMultiplier,
    // Role doctrine changes the chosen maneuver, never weapon or damage statistics.
    preferredTactic: npcCombatDoctrine(npc, mines.length > 0, equippedWeapons.length > 0),
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
    aiControlled: true,
    aiAggression: npc.aggression,
    ...(npc.factionId ? { factionId: npc.factionId } : {}),
    ...(npc.pirate && npc.pirateMark ? { pirateMark: npc.pirateMark } : {}),
  };
}

export function transferPirateLoot(pirate: SectorNpcState, victim: SectorNpcState): number {
  const cargoUsed = Object.values(pirate.cargo).reduce(
    (sum, quantity) => sum + (Number.isFinite(quantity) ? Math.max(0, quantity) : 0),
    0
  );
  let remaining = Math.min(10, Math.max(0, Math.floor(pirate.cargoCapacity - cargoUsed)));
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

/** Settle cargo after a completed NPC battle; victims may already be disabled and engaged. */
export function settleNpcCombatPirateLoot(
  attacker: SectorNpcState,
  defender: SectorNpcState,
  winner: 'attacker' | 'defender'
): number {
  const victor = winner === 'attacker' ? attacker : defender;
  const victim = winner === 'attacker' ? defender : attacker;
  if (
    !victor.pirate ||
    victim.pirate ||
    (victim.job !== 'freighter' && victim.job !== 'miner' && victim.job !== 'salvager')
  ) {
    return 0;
  }
  return transferPirateLoot(victor, victim);
}
