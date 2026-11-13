import type {
  BoardingHex,
  BoardingMapDefinition,
  BoardingTeam,
  BoardingUnit,
  BoardingUnitTemplate,
} from '../../core/boarding-types';
import { boardingMaps } from '../../data/boarding/boarding-maps';
import { boardingMeleeWeapons, boardingRangedWeapons } from '../../data/boarding/boarding-weapons';
import {
  boardingHexBlocked,
  boardingHexDistance,
  boardingHexKey,
  boardingHexNeighbours,
  boardingTargetHasCover,
  boardingUnitAt,
} from './boarding-geometry';

export const MAX_AP = 3;
const COVER_PENALTY = 25;
const SUPPRESSION_PENALTY = 20;

export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function defaultMap(seed: number): BoardingMapDefinition {
  return boardingMaps[Math.abs(seed) % boardingMaps.length] ?? boardingMaps[0]!;
}

export function createUnit(template: BoardingUnitTemplate): BoardingUnit {
  const maxHp = Math.max(1, Math.round(template.maxHp ?? template.hp ?? 10));
  const hp = clamp(Math.round(template.hp ?? maxHp), 1, maxHp);
  return {
    id: template.id,
    name: template.name,
    team: template.team,
    q: -1,
    r: -1,
    hp,
    maxHp,
    armor: clamp(Math.round(template.armor ?? 0), 0, 5),
    rangedSkill: clamp(Math.round(template.rangedSkill ?? 50), 0, 100),
    meleeSkill: clamp(Math.round(template.meleeSkill ?? 45), 0, 100),
    weapon: template.weapon ?? boardingRangedWeapons.sidearm,
    meleeWeapon: template.meleeWeapon ?? boardingMeleeWeapons.knife,
    ap: MAX_AP,
    combatUsed: false,
    suppressed: false,
    overwatch: false,
    overwatchTarget: null,
    holdingCover: false,
    reactionUsed: false,
    rangedActions: 0,
    meleeActions: 0,
  };
}

function spawnCandidates(map: BoardingMapDefinition, team: BoardingTeam): readonly BoardingHex[] {
  const left: BoardingHex[] = [];
  for (let q = 0; q < Math.min(3, map.columns); q += 1) {
    for (let r = 0; r < map.rows; r += 1) left.push({ q, r });
  }
  if (team === 'player') return left;
  return left.map((hex) => ({ q: map.columns - 1 - hex.q, r: hex.r }));
}

export function placeTeam(
  map: BoardingMapDefinition,
  doorStates: Readonly<Record<string, boolean>>,
  units: BoardingUnit[],
  team: BoardingTeam
): void {
  const candidates = spawnCandidates(map, team).filter(
    (hex) => !boardingHexBlocked(map, doorStates, hex.q, hex.r)
  );
  const teamUnits = units.filter((unit) => unit.team === team);
  for (let index = 0; index < teamUnits.length; index += 1) {
    const unit = teamUnits[index];
    const spot = candidates.find((hex) => boardingUnitAt(units, hex.q, hex.r, unit?.id) === null);
    if (!unit || !spot) continue;
    unit.q = spot.q;
    unit.r = spot.r;
  }
}

export function reachableHexes(
  map: BoardingMapDefinition,
  doorStates: Readonly<Record<string, boolean>>,
  units: readonly BoardingUnit[],
  unit: BoardingUnit,
  maximumAp: number
): Readonly<Record<string, number>> {
  const costs: Record<string, number> = { [boardingHexKey(unit.q, unit.r)]: 0 };
  const queue: BoardingHex[] = [{ q: unit.q, r: unit.r }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentCost = costs[boardingHexKey(current.q, current.r)] ?? 0;
    if (currentCost >= maximumAp) continue;
    for (const next of boardingHexNeighbours(map, current)) {
      const key = boardingHexKey(next.q, next.r);
      if (boardingHexBlocked(map, doorStates, next.q, next.r)) continue;
      if (boardingUnitAt(units, next.q, next.r, unit.id)) continue;
      const cost = currentCost + 1;
      if (cost >= (costs[key] ?? Infinity)) continue;
      costs[key] = cost;
      queue.push(next);
    }
  }
  return costs;
}

export function attackChance(
  map: BoardingMapDefinition,
  doorStates: Readonly<Record<string, boolean>>,
  attacker: BoardingUnit,
  target: BoardingUnit
): number {
  const range = boardingHexDistance(attacker, target);
  const coverPenalty =
    (boardingTargetHasCover(map, attacker, target) ? COVER_PENALTY : 0) +
    (target.holdingCover ? 15 : 0);
  const suppressionPenalty = attacker.suppressed ? SUPPRESSION_PENALTY : 0;
  return clamp(
    45 +
      Math.round((attacker.rangedSkill - 50) * 0.55) +
      attacker.weapon.hitBonus -
      (attacker.weapon.spreadMode === 'cone'
        ? 0
        : attacker.weapon.spread * Math.max(0, range - 1)) -
      coverPenalty -
      suppressionPenalty,
    5,
    95
  );
}

export function meleeChance(attacker: BoardingUnit): number {
  return clamp(
    58 +
      Math.round((attacker.meleeSkill - 50) * 0.5) +
      attacker.meleeWeapon.hitBonus +
      (attacker.weapon.meleeBonus ?? 0) -
      (attacker.suppressed ? 10 : 0),
    10,
    95
  );
}

export function damageAfterArmor(
  damage: number,
  armorPenetration: number,
  targetArmor: number
): number {
  return Math.max(1, damage - Math.max(0, targetArmor - armorPenetration));
}
