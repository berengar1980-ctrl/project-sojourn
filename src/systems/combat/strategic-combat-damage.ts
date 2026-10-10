import type { ShieldDamageSource } from '../../core/shield-types';

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
} from './strategic-combat-types';

import { COMBAT_DAMAGE_SCALE, rotate, normalize } from './strategic-combat-geometry';

function scaledDamage(raw: number, attacker: MutableCombatant, critical: boolean): number {
  const criticalMultiplier = critical ? 1.5 : 1;
  return Math.max(
    1,
    raw * attacker.setup.damageMultiplier * criticalMultiplier * COMBAT_DAMAGE_SCALE
  );
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

export function combatShieldCenter(target: MutableCombatant): CombatPoint {
  const geometry = combatShieldGeometry(target);
  const offset = rotate(geometry.centerOffset, target.headingRadians);
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
  const start = rotate({ x: from.x - center.x, y: from.y - center.y }, -target.headingRadians);
  const end = rotate({ x: to.x - center.x, y: to.y - center.y }, -target.headingRadians);
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
  const worldOffset = rotate(local, target.headingRadians);
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
  const local = rotate(outwardWorld, -target.headingRadians);
  const length = Math.hypot(local.x, local.y) || 1;
  return { x: local.x / length, y: local.y / length };
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
  const damage = Math.min(
    directed ? target.subsystems[targetSubsystem] : target.hullHp,
    scaledDamage(hullDamage, attacker, critical)
  );
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
  obstacles: readonly StrategicCombatObstacle[]
): { obstacle: StrategicCombatObstacle; point: CombatPoint; t: number } | null {
  return (
    obstacles
      .flatMap((obstacle) => {
        const hit = segmentCircleHit(from, to, obstacle);
        return hit ? [{ obstacle, ...hit }] : [];
      })
      .sort((first, second) => first.t - second.t)[0] ?? null
  );
}
