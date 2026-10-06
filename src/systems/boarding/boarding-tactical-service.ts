import type {
  BoardingAttackResult,
  BoardingEncounterSnapshot,
  BoardingHex,
  BoardingMapDefinition,
  BoardingOutcome,
  BoardingTeam,
  BoardingUnit,
  BoardingUnitTemplate,
} from '../../core/boarding-types';
import { boardingMapById, boardingMaps } from '../../data/boarding/boarding-maps';
import {
  boardingMeleeWeapons,
  boardingRangedWeapons,
} from '../../data/boarding/boarding-weapons';
import {
  boardingDoorAt,
  boardingHasLineOfSight,
  boardingHexBlocked,
  boardingHexDistance,
  boardingHexKey,
  boardingHexNeighbours,
  boardingTargetHasCover,
  boardingUnitAt,
} from './boarding-geometry';

const MAX_AP = 3;
const COVER_PENALTY = 25;
const SUPPRESSION_PENALTY = 20;

export interface BoardingTacticalService {
  getSnapshot(): BoardingEncounterSnapshot;
  selectUnit(unitId: string | null): BoardingEncounterSnapshot;
  reachable(unitId: string, maximumAp?: number): Readonly<Record<string, number>>;
  move(unitId: string, target: BoardingHex): boolean;
  openDoor(unitId: string, doorId: string): boolean;
  shoot(attackerId: string, targetId: string): BoardingAttackResult | null;
  melee(attackerId: string, targetId: string): BoardingAttackResult | null;
  suppress(attackerId: string, targetId: string): BoardingAttackResult | null;
  endTurn(): BoardingEncounterSnapshot;
  retreat(): BoardingEncounterSnapshot;
}

interface CreateBoardingEncounterOptions {
  readonly seed: number;
  readonly mapId?: string;
  readonly playerUnits: readonly BoardingUnitTemplate[];
  readonly enemyUnits: readonly BoardingUnitTemplate[];
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function defaultMap(seed: number): BoardingMapDefinition {
  return boardingMaps[Math.abs(seed) % boardingMaps.length] ?? boardingMaps[0]!;
}

function createUnit(template: BoardingUnitTemplate): BoardingUnit {
  const hp = Math.max(1, Math.round(template.hp ?? 10));
  return {
    id: template.id,
    name: template.name,
    team: template.team,
    q: -1,
    r: -1,
    hp,
    maxHp: hp,
    armor: clamp(Math.round(template.armor ?? 0), 0, 5),
    rangedSkill: clamp(Math.round(template.rangedSkill ?? 50), 0, 100),
    meleeSkill: clamp(Math.round(template.meleeSkill ?? 45), 0, 100),
    weapon: template.weapon ?? boardingRangedWeapons.sidearm,
    meleeWeapon: template.meleeWeapon ?? boardingMeleeWeapons.knife,
    ap: MAX_AP,
    combatUsed: false,
    suppressed: false,
    overwatch: false,
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

function placeTeam(
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
    const spot = candidates.find(
      (hex) => boardingUnitAt(units, hex.q, hex.r, unit?.id) === null
    );
    if (!unit || !spot) continue;
    unit.q = spot.q;
    unit.r = spot.r;
  }
}

function reachableHexes(
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

function attackChance(
  map: BoardingMapDefinition,
  doorStates: Readonly<Record<string, boolean>>,
  attacker: BoardingUnit,
  target: BoardingUnit
): number {
  const range = boardingHexDistance(attacker, target);
  const coverPenalty = boardingTargetHasCover(map, attacker, target) ? COVER_PENALTY : 0;
  const suppressionPenalty = attacker.suppressed ? SUPPRESSION_PENALTY : 0;
  return clamp(
    45 +
      Math.round((attacker.rangedSkill - 50) * 0.55) +
      attacker.weapon.hitBonus -
      attacker.weapon.spread * Math.max(0, range - 1) -
      coverPenalty -
      suppressionPenalty,
    5,
    95
  );
}

function meleeChance(attacker: BoardingUnit): number {
  return clamp(
    58 +
      Math.round((attacker.meleeSkill - 50) * 0.5) +
      attacker.meleeWeapon.hitBonus -
      (attacker.suppressed ? 10 : 0),
    10,
    95
  );
}

function damageAfterArmor(
  damage: number,
  armorPenetration: number,
  targetArmor: number
): number {
  return Math.max(1, damage - Math.max(0, targetArmor - armorPenetration));
}

class BoardingTacticalRuntime implements BoardingTacticalService {
  private readonly random: () => number;
  private readonly map: BoardingMapDefinition;
  private readonly units: BoardingUnit[];
  private readonly doorStates: Record<string, boolean>;
  private round = 1;
  private activeTeam: BoardingTeam = 'player';
  private selectedUnitId: string | null = null;
  private outcome: BoardingOutcome = 'active';
  private log: { readonly round: number; readonly text: string }[] = [];

  constructor(private readonly options: CreateBoardingEncounterOptions) {
    this.random = createRandom(options.seed);
    this.map = options.mapId ? boardingMapById(options.mapId) ?? defaultMap(options.seed) : defaultMap(options.seed);
    this.units = [...options.playerUnits, ...options.enemyUnits].map(createUnit);
    this.doorStates = Object.fromEntries(this.map.doors.map((door) => [door.id, false]));
    placeTeam(this.map, this.doorStates, this.units, 'player');
    placeTeam(this.map, this.doorStates, this.units, 'enemy');
    this.selectedUnitId = this.aliveUnits('player')[0]?.id ?? null;
    this.writeLog('Entertrupps haben Position bezogen.');
    this.updateOutcome();
  }

  getSnapshot(): BoardingEncounterSnapshot {
    return {
      seed: this.options.seed,
      map: this.map,
      round: this.round,
      activeTeam: this.activeTeam,
      selectedUnitId: this.selectedUnitId,
      outcome: this.outcome,
      units: this.units.map((unit) => ({ ...unit })),
      doorStates: { ...this.doorStates },
      log: [...this.log],
    };
  }

  selectUnit(unitId: string | null): BoardingEncounterSnapshot {
    if (unitId === null) this.selectedUnitId = null;
    else if (this.units.some((unit) => unit.id === unitId && unit.hp > 0)) this.selectedUnitId = unitId;
    return this.getSnapshot();
  }

  reachable(unitId: string, maximumAp?: number): Readonly<Record<string, number>> {
    const unit = this.unitForAction(unitId);
    if (!unit) return {};
    return reachableHexes(
      this.map,
      this.doorStates,
      this.units,
      unit,
      Math.min(unit.ap, Math.max(0, maximumAp ?? unit.ap))
    );
  }

  move(unitId: string, target: BoardingHex): boolean {
    const unit = this.unitForAction(unitId);
    if (!unit) return false;
    const costs = this.reachable(unitId);
    const cost = costs[boardingHexKey(target.q, target.r)];
    if (cost === undefined || cost <= 0 || cost > unit.ap) return false;
    unit.q = target.q;
    unit.r = target.r;
    unit.ap -= cost;
    this.writeLog(unit.name + ' bewegt sich ' + cost + ' Feld(er).');
    return true;
  }

  openDoor(unitId: string, doorId: string): boolean {
    const unit = this.unitForAction(unitId);
    const door = this.map.doors.find((entry) => entry.id === doorId);
    if (!unit || !door || unit.ap < 1 || this.doorStates[doorId]) return false;
    if (boardingHexDistance(unit, door) !== 1) return false;
    this.doorStates[doorId] = true;
    unit.ap -= 1;
    this.writeLog(unit.name + ' öffnet ein Schott.');
    return true;
  }

  shoot(attackerId: string, targetId: string): BoardingAttackResult | null {
    const pair = this.attackPair(attackerId, targetId);
    if (!pair || pair.attacker.weapon.range <= 0) return null;
    const range = boardingHexDistance(pair.attacker, pair.target);
    if (range > pair.attacker.weapon.range) return null;
    if (!boardingHasLineOfSight(this.map, this.doorStates, pair.attacker, pair.target)) return null;
    const chance = attackChance(this.map, this.doorStates, pair.attacker, pair.target);
    return this.resolveAttack(pair.attacker, pair.target, chance, false);
  }

  melee(attackerId: string, targetId: string): BoardingAttackResult | null {
    const pair = this.attackPair(attackerId, targetId);
    if (!pair || boardingHexDistance(pair.attacker, pair.target) !== 1) return null;
    return this.resolveAttack(pair.attacker, pair.target, meleeChance(pair.attacker), true);
  }

  suppress(attackerId: string, targetId: string): BoardingAttackResult | null {
    const pair = this.attackPair(attackerId, targetId);
    if (!pair || !pair.attacker.weapon.canSuppress) return null;
    const range = boardingHexDistance(pair.attacker, pair.target);
    if (range > pair.attacker.weapon.range) return null;
    if (!boardingHasLineOfSight(this.map, this.doorStates, pair.attacker, pair.target)) return null;
    const chance = clamp(
      attackChance(this.map, this.doorStates, pair.attacker, pair.target) + 12,
      10,
      95
    );
    const result = this.resolveAttack(pair.attacker, pair.target, chance, false, true);
    if (result.hit && pair.target.hp > 0) pair.target.suppressed = true;
    return result;
  }

  endTurn(): BoardingEncounterSnapshot {
    if (this.outcome !== 'active') return this.getSnapshot();
    this.activeTeam = this.activeTeam === 'player' ? 'enemy' : 'player';
    if (this.activeTeam === 'player') this.round += 1;
    for (const unit of this.aliveUnits(this.activeTeam)) {
      unit.ap = MAX_AP;
      unit.combatUsed = false;
      unit.overwatch = false;
      unit.suppressed = false;
    }
    this.selectedUnitId = this.aliveUnits(this.activeTeam)[0]?.id ?? null;
    this.writeLog((this.activeTeam === 'player' ? 'Eigener' : 'Feindlicher') + ' Zug beginnt.');
    return this.getSnapshot();
  }

  retreat(): BoardingEncounterSnapshot {
    if (this.outcome === 'active' && this.activeTeam === 'player') {
      this.outcome = 'retreat';
      this.writeLog('Entertrupp zieht sich zurück.');
    }
    return this.getSnapshot();
  }

  private unitForAction(unitId: string): BoardingUnit | null {
    const unit = this.units.find((entry) => entry.id === unitId && entry.hp > 0) ?? null;
    return unit?.team === this.activeTeam && this.outcome === 'active' ? unit : null;
  }

  private attackPair(
    attackerId: string,
    targetId: string
  ): { readonly attacker: BoardingUnit; readonly target: BoardingUnit } | null {
    const attacker = this.unitForAction(attackerId);
    const target = this.units.find((unit) => unit.id === targetId && unit.hp > 0) ?? null;
    if (!attacker || !target || target.team === attacker.team || attacker.ap < 1 || attacker.combatUsed) {
      return null;
    }
    return { attacker, target };
  }

  private resolveAttack(
    attacker: BoardingUnit,
    target: BoardingUnit,
    chancePercent: number,
    melee: boolean,
    suppress = false
  ): BoardingAttackResult {
    attacker.ap -= 1;
    attacker.combatUsed = true;
    const hit = this.random() * 100 < chancePercent;
    const profile = melee ? attacker.meleeWeapon : attacker.weapon;
    const damage = hit
      ? damageAfterArmor(profile.damage, profile.armorPenetration, target.armor)
      : 0;
    target.hp = Math.max(0, target.hp - damage);
    const action = suppress ? 'unterdrückt' : melee ? 'greift an' : 'schießt auf';
    this.writeLog(
      attacker.name +
        ' ' +
        action +
        ' ' +
        target.name +
        ': ' +
        (hit ? damage + ' Schaden.' : 'verfehlt.')
    );
    this.updateOutcome();
    return {
      attackerId: attacker.id,
      targetId: target.id,
      hit,
      chancePercent,
      damage,
      targetHp: target.hp,
      targetDefeated: target.hp <= 0,
    };
  }

  private aliveUnits(team: BoardingTeam): BoardingUnit[] {
    return this.units.filter((unit) => unit.team === team && unit.hp > 0);
  }

  private updateOutcome(): void {
    if (this.aliveUnits('player').length === 0) this.outcome = 'enemy_win';
    else if (this.aliveUnits('enemy').length === 0) this.outcome = 'player_win';
  }

  private writeLog(text: string): void {
    this.log = [{ round: this.round, text }, ...this.log].slice(0, 40);
  }
}

export function createBoardingTacticalService(
  options: CreateBoardingEncounterOptions
): BoardingTacticalService {
  return new BoardingTacticalRuntime(options);
}
