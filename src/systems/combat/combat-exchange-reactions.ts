import { mineDetection } from './strategic-combat-movement';
import { distance, normalize } from './strategic-combat-geometry';
import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatRuntime,
  StrategicCombatSide,
} from './strategic-combat-types';

export type ReactionKind = 'shield_down' | 'mine' | 'collision' | 'pursuit' | 'tractor';
export interface ReactiveDecision {
  readonly kind: ReactionKind;
  readonly priority: number;
  readonly goal: CombatPoint;
  readonly critical: boolean;
}
export interface ReactionMemory {
  shieldHp: number;
  lastTractorCount: number;
  lastReactionAt: number;
  kind: ReactionKind | null;
}
export function initialReactionMemory(
  ship: MutableCombatant,
  runtime: StrategicCombatRuntime
): ReactionMemory {
  return {
    shieldHp: ship.shieldHp,
    lastTractorCount: runtime.thrownAsteroids.length,
    lastReactionAt: -100,
    kind: null,
  };
}
function fleeFrom(ship: MutableCombatant, threat: CombatPoint, range: number): CombatPoint {
  const away = normalize(ship.position.x - threat.x, ship.position.y - threat.y);
  return { x: ship.position.x + away.x * range, y: ship.position.y + away.y * range };
}
function detectedMine(
  runtime: StrategicCombatRuntime,
  ship: MutableCombatant,
  side: StrategicCombatSide
): ReactiveDecision | null {
  const mine = runtime.mines
    .filter((entry) => entry.owner !== side && entry.armedSeconds <= 0)
    .filter((entry) => mineDetection(entry.definition, ship, entry.position) !== 'hidden')
    .filter(
      (entry) =>
        distance(ship.position, entry.position) < entry.definition.triggerRadiusMeters + 170
    )
    .sort((a, b) => distance(ship.position, a.position) - distance(ship.position, b.position))[0];
  if (!mine) return null;
  const forward = normalize(
    ship.velocity.x || Math.cos(ship.headingRadians),
    ship.velocity.y || Math.sin(ship.headingRadians)
  );
  const dx = mine.position.x - ship.position.x;
  const dy = mine.position.y - ship.position.y;
  const sideSign = dx * -forward.y + dy * forward.x >= 0 ? -1 : 1;
  return {
    kind: 'mine',
    priority: 90,
    critical: true,
    goal: {
      x: ship.position.x + (forward.x * 0.3 - forward.y * sideSign) * 330,
      y: ship.position.y + (forward.y * 0.3 + forward.x * sideSign) * 330,
    },
  };
}
function collisionThreat(
  runtime: StrategicCombatRuntime,
  ship: MutableCombatant,
  enemy: MutableCombatant
): ReactiveDecision | null {
  const danger = [enemy, ...(runtime.arena.obstacles ?? [])]
    .map((object) => ({
      position: object.position,
      radius: 'radius' in object ? object.radius + 75 : 110,
      velocity: 'velocity' in object ? object.velocity : { x: 0, y: 0 },
    }))
    .find((object) => {
      const dx = object.position.x - ship.position.x;
      const dy = object.position.y - ship.position.y;
      const vx = ship.velocity.x - object.velocity.x;
      const vy = ship.velocity.y - object.velocity.y;
      const speed2 = vx * vx + vy * vy;
      const t = speed2 > 1 ? Math.max(0, Math.min(1.8, (dx * vx + dy * vy) / speed2)) : 0;
      return t > 0 && Math.hypot(dx - vx * t, dy - vy * t) < object.radius;
    });
  if (!danger) return null;
  return {
    kind: 'collision',
    priority: 100,
    critical: true,
    goal: fleeFrom(ship, danger.position, 310),
  };
}
export function chooseReactiveDecision(
  runtime: StrategicCombatRuntime,
  ship: MutableCombatant,
  enemy: MutableCombatant,
  side: StrategicCombatSide,
  memory: ReactionMemory
): ReactiveDecision | null {
  const events: ReactiveDecision[] = [];
  if (memory.shieldHp > 0 && ship.shieldHp <= 0)
    events.push({
      kind: 'shield_down',
      priority: 80,
      critical: true,
      goal:
        ship.subsystems.tractor > 0 &&
        distance(ship.position, enemy.position) < (ship.setup.tractorRangeMeters ?? 0)
          ? { ...ship.position }
          : fleeFrom(ship, enemy.position, 380),
    });
  const mine = detectedMine(runtime, ship, side);
  if (mine) events.push(mine);
  const collision = collisionThreat(runtime, ship, enemy);
  if (collision) events.push(collision);
  if (
    enemy.tactic === 'flee' &&
    ship.tactic !== 'flee' &&
    distance(ship.position, enemy.position) > 280
  )
    events.push({
      kind: 'pursuit',
      priority: 45,
      critical: false,
      goal: {
        x: enemy.position.x + enemy.velocity.x * 2,
        y: enemy.position.y + enemy.velocity.y * 2,
      },
    });
  if (runtime.thrownAsteroids.length > memory.lastTractorCount)
    events.push({ kind: 'tractor', priority: 40, critical: false, goal: { ...enemy.position } });
  return events.sort((a, b) => b.priority - a.priority)[0] ?? null;
}
export function commitReactiveDecision(
  memory: ReactionMemory,
  decision: ReactiveDecision | null,
  now: number
): boolean {
  if (!decision) return false;
  if (!decision.critical && now - memory.lastReactionAt < 3) return false;
  if (memory.kind === decision.kind && now - memory.lastReactionAt < (decision.critical ? 1 : 3))
    return false;
  memory.lastReactionAt = now;
  memory.kind = decision.kind;
  return true;
}
