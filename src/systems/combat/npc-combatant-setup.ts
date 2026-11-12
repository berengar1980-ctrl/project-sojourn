import { combatEquippedWeapons, combatWeaponMounts } from './combat-loadout-mounts';
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
  calculateShipModeEnergy,
  getShipComponent,
  getShipDefinition,
  resolveShipCombatMovementStats,
  resolveShipArmorProtection,
  shipCombatTractorRange,
  shipHasIndustrialTractor,
  shipHullMaxHp,
  shipShieldMaxHp,
} from '../ships';

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

export function npcCombatant(npc: SectorNpcState): StrategicCombatantSetup | null {
  const ship = getShipDefinition(npc.shipId);
  if (!ship) return null;
  const installed = ensureNpcInstalledComponents(npc);
  const movement = resolveShipCombatMovementStats(ship, installed);
  const armor = resolveShipArmorProtection(installed);
  const equippedWeapons = combatEquippedWeapons(ship, installed.weapon ?? []);
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
    ...(armor ? { armor } : {}),
    weapons: equippedWeapons.map((entry) => entry.component),
    weaponMounts: combatWeaponMounts(ship, equippedWeapons),
    hitChance: 0.68 + sensorWeaponHitChanceBonus(skill),
    dodgeChance: pilotingDodgeChance(skill),
    damageMultiplier: weaponDamageMultiplier(skill),
    criticalChance: weaponCriticalChance(skill),
    cycleTimeMultiplier: weaponCycleTimeMultiplier(skill),
    // Role doctrine changes the chosen maneuver, never weapon or damage statistics.
    preferredTactic: npcCombatDoctrine(npc, mines.length > 0, equippedWeapons.length > 0),
    ...movement,
    mines,
    tractorRangeMeters: shipCombatTractorRange(installed),
    power: calculateShipModeEnergy(installed),
    tractorCanManipulateObjects: shipHasIndustrialTractor(ship),
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
