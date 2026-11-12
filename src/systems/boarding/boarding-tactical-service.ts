import type {
  BoardingAttackResult,
  BoardingEncounterSnapshot,
  BoardingHex,
  BoardingMapDefinition,
  BoardingOutcome,
  BoardingTeam,
  BoardingUnit,
  BoardingUnitTemplate,
  BoardingSuppressionZone,
} from '../../core/boarding-types';
import { boardingMapById, boardingMaps } from '../../data/boarding/boarding-maps';
import { boardingMeleeWeapons, boardingRangedWeapons } from '../../data/boarding/boarding-weapons';
import {
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
  suppressArea(unitId: string, center: BoardingHex): boolean;
  overwatch(unitId: string, target: BoardingHex): boolean;
  holdCover(unitId: string): boolean;
  endTurn(): BoardingEncounterSnapshot;
  retreat(): BoardingEncounterSnapshot;
}

interface CreateBoardingEncounterOptions {
  readonly seed: number;
  readonly mapId?: string;
  readonly playerUnits: readonly BoardingUnitTemplate[];
  readonly enemyUnits: readonly BoardingUnitTemplate[];
  readonly allowRetreat?: boolean;
  readonly restore?: BoardingEncounterSnapshot;
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
    const spot = candidates.find((hex) => boardingUnitAt(units, hex.q, hex.r, unit?.id) === null);
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
  const coverPenalty =
    (boardingTargetHasCover(map, attacker, target) ? COVER_PENALTY : 0) +
    (target.holdingCover ? 15 : 0);
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

function damageAfterArmor(damage: number, armorPenetration: number, targetArmor: number): number {
  return Math.max(1, damage - Math.max(0, targetArmor - armorPenetration));
}

class BoardingTacticalRuntime implements BoardingTacticalService {
  private readonly random: () => number;
  private readonly map: BoardingMapDefinition;
  private readonly units: BoardingUnit[];
  private readonly doorStates: Record<string, boolean>;
  private suppressionZones: BoardingSuppressionZone[] = [];
  private randomCalls = 0;
  private round = 1;
  private activeTeam: BoardingTeam = 'player';
  private selectedUnitId: string | null = null;
  private outcome: BoardingOutcome = 'active';
  private log: { readonly round: number; readonly text: string }[] = [];

  constructor(private readonly options: CreateBoardingEncounterOptions) {
    this.random = createRandom(options.seed);
    this.map =
      options.restore?.map ??
      (options.mapId
        ? (boardingMapById(options.mapId) ?? defaultMap(options.seed))
        : defaultMap(options.seed));
    this.units = options.restore
      ? options.restore.units.map((unit) => ({
          ...unit,
          overwatchTarget: unit.overwatchTarget ? { ...unit.overwatchTarget } : null,
        }))
      : [...options.playerUnits, ...options.enemyUnits].map(createUnit);
    this.doorStates = options.restore
      ? { ...options.restore.doorStates }
      : Object.fromEntries(this.map.doors.map((door) => [door.id, false]));
    if (options.restore) {
      this.round = options.restore.round;
      this.activeTeam = options.restore.activeTeam;
      this.selectedUnitId = options.restore.selectedUnitId;
      this.outcome = options.restore.outcome;
      this.log = [...options.restore.log];
      this.suppressionZones = options.restore.suppressionZones.map((zone) => ({
        ...zone,
        center: { ...zone.center },
      }));
      this.randomCalls = options.restore.randomCalls;
      for (let index = 0; index < this.randomCalls; index += 1) this.random();
    } else {
      placeTeam(this.map, this.doorStates, this.units, 'player');
      placeTeam(this.map, this.doorStates, this.units, 'enemy');
      this.selectedUnitId = this.aliveUnits('player')[0]?.id ?? null;
      this.writeLog('Entertrupps haben Position bezogen.');
      this.updateOutcome();
    }
  }

  getSnapshot(): BoardingEncounterSnapshot {
    return {
      seed: this.options.seed,
      map: this.map,
      round: this.round,
      activeTeam: this.activeTeam,
      selectedUnitId: this.selectedUnitId,
      outcome: this.outcome,
      units: this.units.map((unit) => ({
        ...unit,
        overwatchTarget: unit.overwatchTarget ? { ...unit.overwatchTarget } : null,
      })),
      doorStates: { ...this.doorStates },
      log: [...this.log],
      suppressionZones: this.suppressionZones.map((zone) => ({
        ...zone,
        center: { ...zone.center },
      })),
      allowRetreat:
        (this.options.allowRetreat ?? this.options.restore?.allowRetreat) !== false,
      randomCalls: this.randomCalls,
    };
  }

  selectUnit(unitId: string | null): BoardingEncounterSnapshot {
    if (unitId === null) this.selectedUnitId = null;
    else if (
      this.units.some(
        (unit) => unit.id === unitId && unit.hp > 0 && unit.team === this.activeTeam
      )
    )
      this.selectedUnitId = unitId;
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
    const path: BoardingHex[] = [];
    let current: BoardingHex = target;
    for (let currentCost = cost; currentCost > 0; currentCost -= 1) {
      path.unshift(current);
      const previous = boardingHexNeighbours(this.map, current).find(
        (hex) => costs[boardingHexKey(hex.q, hex.r)] === currentCost - 1
      );
      if (!previous) return false;
      current = previous;
    }
    unit.holdingCover = false;
    let travelled = 0;
    for (const next of path) {
      const from = { q: unit.q, r: unit.r };
      this.triggerDisengagement(unit, from, next);
      if (unit.hp <= 0 || this.outcome !== 'active') break;
      unit.q = next.q;
      unit.r = next.r;
      unit.ap -= 1;
      travelled += 1;
      this.triggerReactions(unit);
      if (unit.hp <= 0 || this.outcome !== 'active') break;
    }
    this.writeLog(unit.name + ' bewegt sich ' + travelled + ' Feld(er).');
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

  suppressArea(unitId: string, center: BoardingHex): boolean {
    const unit = this.unitForAction(unitId);
    if (!unit || unit.ap < 1 || unit.combatUsed || !unit.weapon.canSuppress) return false;
    if (boardingHexDistance(unit, center) > unit.weapon.range) return false;
    if (boardingHexBlocked(this.map, this.doorStates, center.q, center.r)) return false;
    if (!boardingHasLineOfSight(this.map, this.doorStates, unit, center)) return false;
    unit.ap -= 1;
    unit.combatUsed = true;
    unit.rangedActions += 1;
    this.suppressionZones.push({
      ownerId: unit.id,
      team: unit.team,
      center: { ...center },
    });
    for (const target of this.units) {
      if (
        target.team !== unit.team &&
        target.hp > 0 &&
        boardingHexDistance(target, center) <= 1
      ) {
        target.suppressed = true;
      }
    }
    this.writeLog(unit.name + ' legt ein Unterdrückungsfeld.');
    return true;
  }

  overwatch(unitId: string, target: BoardingHex): boolean {
    const unit = this.unitForAction(unitId);
    if (!unit || unit.ap < 2 || unit.combatUsed || unit.weapon.range < 1) return false;
    if (boardingHexDistance(unit, target) > unit.weapon.range) return false;
    if (boardingHexBlocked(this.map, this.doorStates, target.q, target.r)) return false;
    if (!boardingHasLineOfSight(this.map, this.doorStates, unit, target)) return false;
    unit.ap -= 2;
    unit.combatUsed = true;
    unit.overwatch = true;
    unit.overwatchTarget = { ...target };
    this.writeLog(unit.name + ' sichert den Korridor.');
    return true;
  }

  holdCover(unitId: string): boolean {
    const unit = this.unitForAction(unitId);
    if (
      !unit ||
      unit.ap < 1 ||
      unit.combatUsed ||
      !this.map.cover.some((cover) => cover.q === unit.q && cover.r === unit.r)
    )
      return false;
    unit.ap -= 1;
    unit.combatUsed = true;
    unit.holdingCover = true;
    this.writeLog(unit.name + ' hält die Deckung.');
    return true;
  }

  endTurn(): BoardingEncounterSnapshot {
    if (this.outcome !== 'active') return this.getSnapshot();
    this.activeTeam = this.activeTeam === 'player' ? 'enemy' : 'player';
    if (this.activeTeam === 'player') this.round += 1;
    for (const unit of this.aliveUnits(this.activeTeam)) {
      unit.ap = MAX_AP;
      unit.combatUsed = false;
      unit.overwatch = false;
      unit.overwatchTarget = null;
      unit.suppressed = false;
      unit.reactionUsed = false;
    }
    this.suppressionZones = this.suppressionZones.filter((zone) => zone.team !== this.activeTeam);
    this.selectedUnitId = this.aliveUnits(this.activeTeam)[0]?.id ?? null;
    this.writeLog((this.activeTeam === 'player' ? 'Eigener' : 'Feindlicher') + ' Zug beginnt.');
    return this.getSnapshot();
  }

  retreat(): BoardingEncounterSnapshot {
    if (
      this.outcome === 'active' &&
      this.activeTeam === 'player' &&
      (this.options.allowRetreat ?? this.options.restore?.allowRetreat) !== false
    ) {
      this.outcome = 'retreat';
      this.writeLog('Entertrupp zieht sich zurück.');
    }
    return this.getSnapshot();
  }

  private roll(): number {
    this.randomCalls += 1;
    return this.random();
  }

  private attackDamage(attacker: BoardingUnit, target: BoardingUnit, melee: boolean): number {
    const profile = melee ? attacker.meleeWeapon : attacker.weapon;
    const piercing =
      !melee &&
      attacker.weapon.piercing &&
      target.armor <= attacker.weapon.piercing.maxArmor
        ? attacker.weapon.piercing.bonusDamage
        : 0;
    return damageAfterArmor(profile.damage, profile.armorPenetration, target.armor) + piercing;
  }

  private reactiveAttack(
    attacker: BoardingUnit,
    target: BoardingUnit,
    chance: number,
    melee: boolean
  ): void {
    const hit = this.roll() * 100 < chance;
    const damage = hit ? this.attackDamage(attacker, target, melee) : 0;
    target.hp = Math.max(0, target.hp - damage);
    if (melee) attacker.meleeActions += 1;
    else attacker.rangedActions += 1;
    this.writeLog(
      attacker.name +
        ' reagiert auf ' +
        target.name +
        ': ' +
        (hit ? damage + ' Schaden.' : 'verfehlt.')
    );
    this.updateOutcome();
  }

  private triggerDisengagement(
    mover: BoardingUnit,
    previous: BoardingHex,
    next: BoardingHex
  ): void {
    for (const enemy of this.units) {
      if (
        enemy.team === mover.team ||
        enemy.hp <= 0 ||
        enemy.reactionUsed ||
        boardingHexDistance(enemy, previous) !== 1 ||
        boardingHexDistance(enemy, next) <= 1
      ) continue;
      enemy.reactionUsed = true;
      this.reactiveAttack(enemy, mover, Math.max(5, meleeChance(enemy) - 20), true);
      if (mover.hp <= 0 || this.outcome !== 'active') break;
    }
  }

  private inOverwatchArc(shooter: BoardingUnit, target: BoardingHex): boolean {
    const aimed = shooter.overwatchTarget;
    if (!aimed) return false;
    const axial = (hex: BoardingHex) => ({
      x: hex.q + hex.r * 0.5,
      y: hex.r * 0.8660254,
    });
    const origin = axial(shooter);
    const direction = axial(aimed);
    const destination = axial(target);
    const ax = direction.x - origin.x;
    const ay = direction.y - origin.y;
    const bx = destination.x - origin.x;
    const by = destination.y - origin.y;
    const product = Math.hypot(ax, ay) * Math.hypot(bx, by);
    return product > 0 && (ax * bx + ay * by) / product >= 0.5;
  }

  private triggerReactions(mover: BoardingUnit): void {
    for (const zone of [...this.suppressionZones]) {
      if (zone.team === mover.team || boardingHexDistance(zone.center, mover) > 1) continue;
      const owner = this.units.find((unit) => unit.id === zone.ownerId && unit.hp > 0);
      if (!owner || !boardingHasLineOfSight(this.map, this.doorStates, owner, mover)) continue;
      this.suppressionZones = this.suppressionZones.filter((entry) => entry !== zone);
      mover.suppressed = true;
      this.reactiveAttack(
        owner,
        mover,
        clamp(attackChance(this.map, this.doorStates, owner, mover) - 10, 5, 90),
        false
      );
      if (mover.hp <= 0 || this.outcome !== 'active') return;
    }
    for (const shooter of this.units) {
      if (
        shooter.team === mover.team ||
        shooter.hp <= 0 ||
        !shooter.overwatch ||
        !this.inOverwatchArc(shooter, mover) ||
        boardingHexDistance(shooter, mover) > shooter.weapon.range ||
        !boardingHasLineOfSight(this.map, this.doorStates, shooter, mover)
      ) continue;
      shooter.overwatch = false;
      shooter.overwatchTarget = null;
      this.reactiveAttack(
        shooter,
        mover,
        attackChance(this.map, this.doorStates, shooter, mover),
        false
      );
      if (mover.hp <= 0 || this.outcome !== 'active') return;
    }
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
    if (
      !attacker ||
      !target ||
      target.team === attacker.team ||
      attacker.ap < 1 ||
      attacker.combatUsed
    ) {
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
    const hit = this.roll() * 100 < chancePercent;
    if (melee) attacker.meleeActions += 1;
    else attacker.rangedActions += 1;
    const damage = hit ? this.attackDamage(attacker, target, melee) : 0;
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
