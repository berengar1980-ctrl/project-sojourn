import type { CombatPoint } from './strategic-combat-types';

/**
 * Analytic constant-velocity interception for unguided projectiles.
 * No valid positive intercept means the current position is the best available aim.
 * Projectiles are already simulated in world space without inherited ship velocity.
 */
export function ballisticInterceptPoint(
  muzzle: CombatPoint,
  target: CombatPoint,
  targetVelocity: CombatPoint,
  speed: number
): CombatPoint {
  if (speed <= 0) return { ...target };
  const x = target.x - muzzle.x;
  const y = target.y - muzzle.y;
  const vx = targetVelocity.x;
  const vy = targetVelocity.y;
  const a = vx * vx + vy * vy - speed * speed;
  const b = 2 * (x * vx + y * vy);
  const c = x * x + y * y;
  if (c < 0.000001) return { ...target };
  let time = -1;
  if (Math.abs(a) < 0.000001) {
    if (Math.abs(b) > 0.000001) time = -c / b;
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const first = (-b - root) / (2 * a);
      const second = (-b + root) / (2 * a);
      time = [first, second].filter((t) => t > 0).sort((p, q) => p - q)[0] ?? -1;
    }
  }
  if (!Number.isFinite(time) || time <= 0) return { ...target };
  return { x: target.x + vx * time, y: target.y + vy * time };
}
