import { isSecurityDrone } from '../../core/security-drone';
import { usesNaturalCombatContour } from './combat-visible-collider';
import type { ShieldDamageSource } from '../../core/shield-types';
import { segmentRockHit } from '../../core/compound-raycast';

import { applyShieldHit } from '../shields/shield-service';

import type {
  MutableCombatant,
  CombatShieldGeometry,
  CombatPoint,
  ShieldSegmentHit,
  CombatImpactLayer,
  CombatProjectileKind,
  CombatTargetSubsystem,
  StrategicCombatObstacle,
  CombatVisualAsteroid,
} from './strategic-combat-types';

import { rotate, normalize } from './strategic-combat-geometry';

function scaledDamage(raw: number, attacker: MutableCombatant, critical: boolean): number {
  const criticalMultiplier = critical ? 1.5 : 1;
  return Math.max(1, raw * attacker.setup.damageMultiplier * criticalMultiplier);
}

export function combatShieldGeometry(target: MutableCombatant): CombatShieldGeometry {
  return (
    target.setup.shieldGeometry ?? {
      centerOffset: { x: 0, y: 0 },
      radiusX: 48,
      radiusY: 48,
      modifier: 1,
    }
  );
}

export function combatShieldHeading(target: MutableCombatant): number {
  return isSecurityDrone(target.setup?.id) ? 0 : target.headingRadians;
}

export function combatShieldCenter(target: MutableCombatant): CombatPoint {
  const geometry = combatShieldGeometry(target);
  const offset = rotate(geometry.centerOffset, combatShieldHeading(target));
  return {
    x: target.position.x + offset.x,
    y: target.position.y + offset.y,
  };
}

export function segmentShieldHit(
  from: CombatPoint,
  to: CombatPoint,
  target: MutableCombatant
): ShieldSegmentHit | null {
  if (target.shieldHp <= 0) return null;
  const geometry = combatShieldGeometry(target);
  const center = combatShieldCenter(target);
  const start = rotate(
    { x: from.x - center.x, y: from.y - center.y },
    -combatShieldHeading(target)
  );
  const end = rotate({ x: to.x - center.x, y: to.y - center.y }, -combatShieldHeading(target));
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const rx = Math.max(1, geometry.radiusX);
  const ry = Math.max(1, geometry.radiusY);
  const a = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  if (a <= 0.000001) return null;
  const b = 2 * ((start.x * dx) / (rx * rx) + (start.y * dy) / (ry * ry));
  const c = (start.x * start.x) / (rx * rx) + (start.y * start.y) / (ry * ry) - 1;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const t = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((value) => value >= 0 && value <= 1)
    .sort((first, second) => first - second)[0];
  if (t == null) return null;
  const local = { x: start.x + dx * t, y: start.y + dy * t };
  const worldOffset = rotate(local, combatShieldHeading(target));
  return {
    point: { x: center.x + worldOffset.x, y: center.y + worldOffset.y },
    surfaceAnchor: { x: local.x / rx, y: local.y / ry },
    t,
  };
}

function impactAnchor(target: MutableCombatant, sourcePosition: CombatPoint): CombatPoint {
  const outwardWorld = normalize(
    sourcePosition.x - target.position.x,
    sourcePosition.y - target.position.y
  );
  const local = rotate(outwardWorld, -combatShieldHeading(target));
  const length = Math.hypot(local.x, local.y) || 1;
  return { x: local.x / length, y: local.y / length };
}

/** Physical armor protects the impacted facing once the shields are exhausted. */
export function directionalHullDamage(
  target: MutableCombatant,
  rawDamage: number,
  sourcePosition: CombatPoint
): number {
  const armor = target.setup?.armor;
  if (!armor || rawDamage <= 0) return rawDamage;
  const local = rotate(
    { x: sourcePosition.x - target.position.x, y: sourcePosition.y - target.position.y },
    -target.headingRadians
  );
  const reduction =
    Math.abs(local.x) >= Math.abs(local.y)
      ? local.x >= 0
        ? armor.front
        : armor.rear
      : local.y >= 0
        ? armor.starboard
        : armor.port;
  return rawDamage * (1 - Math.max(0, Math.min(1, reduction)));
}

export function applyDamage(
  target: MutableCombatant,
  shieldDamage: number,
  hullDamage: number,
  attacker: MutableCombatant,
  critical: boolean,
  sourcePosition: CombatPoint,
  source: ShieldDamageSource,
  impactId: number,
  shieldImpact?: ShieldSegmentHit,
  targetSubsystem: CombatTargetSubsystem = 'hull'
): {
  layer: CombatImpactLayer;
  damage: number;
  point: CombatPoint;
  subsystem?: CombatTargetSubsystem;
} {
  if (target.shieldHp > 0) {
    const geometry = combatShieldGeometry(target);
    const state = {
      maxHp: target.shieldMaxHp,
      modifier: geometry.modifier,
      currentHp: target.shieldHp,
    };
    const impactPoint = shieldImpact?.point ?? combatShieldCenter(target);
    const center = combatShieldCenter(target);
    const outward = normalize(impactPoint.x - center.x, impactPoint.y - center.y);
    const result = applyShieldHit(
      state,
      {
        source,
        point: { ...impactPoint },
        normal: outward,
        surfaceAnchor: shieldImpact?.surfaceAnchor ?? impactAnchor(target, sourcePosition),
        directDamage: scaledDamage(shieldDamage, attacker, critical),
      },
      impactId
    );
    target.shieldHp = state.currentHp;
    target.shieldImpacts.push(result.impact);
    return { layer: 'shield', damage: result.absorbedDamage, point: impactPoint };
  }

  const directed = targetSubsystem !== 'hull' && target.subsystems[targetSubsystem] > 0;
  const scaled = scaledDamage(hullDamage, attacker, critical);
  // Armor is for hull HP. Targeted subsystem attacks retain their own balancing.
  const effective = directed ? scaled : directionalHullDamage(target, scaled, sourcePosition);
  const remaining = directed ? target.subsystems[targetSubsystem] : target.hullHp;
  const damage = Math.min(remaining, effective);
  if (directed)
    target.subsystems[targetSubsystem] = Math.max(0, target.subsystems[targetSubsystem] - damage);
  else target.hullHp = Math.max(0, target.hullHp - damage);
  return {
    layer: 'hull',
    damage,
    point: { ...target.position },
    ...(directed ? { subsystem: targetSubsystem } : {}),
  };
}

export function projectileSpeed(kind: CombatProjectileKind): number {
  if (kind === 'missile') return 360;
  if (kind === 'plasma') return 520;
  return 900;
}

function segmentCircleHit(
  from: CombatPoint,
  to: CombatPoint,
  obstacle: StrategicCombatObstacle
): { point: CombatPoint; t: number } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const fx = from.x - obstacle.position.x;
  const fy = from.y - obstacle.position.y;
  const a = dx * dx + dy * dy;
  if (a <= 0.000001) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - obstacle.radius * obstacle.radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  const t = [t1, t2].filter((value) => value >= 0 && value <= 1).sort((x, y) => x - y)[0];
  if (t == null) return null;
  return { point: { x: from.x + dx * t, y: from.y + dy * t }, t };
}

export function firstObstacleHit(
  from: CombatPoint,
  to: CombatPoint,
  obstacles: readonly StrategicCombatObstacle[],
  asteroids: readonly CombatVisualAsteroid[] = []
): { obstacle: StrategicCombatObstacle; point: CombatPoint; t: number } | null {
  const bodies = new Map(asteroids.map((rock) => [rock.id, rock]));
  let nearest: { obstacle: StrategicCombatObstacle; point: CombatPoint; t: number } | null = null;
  for (const obstacle of obstacles) {
    const rock = bodies.get(obstacle.id);
    const natural = rock && usesNaturalCombatContour(rock);
    const hit = natural
      ? segmentRockHit(from, to, rock)
      : segmentCircleHit(from, to, rock ? { ...obstacle, position: rock.position } : obstacle);
    if (hit && (!nearest || hit.t < nearest.t)) nearest = { obstacle, ...hit };
  }
  return nearest;
}
