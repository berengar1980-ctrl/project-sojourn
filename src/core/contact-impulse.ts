import type { WorldPoint } from './world-types';

export interface TranslationalContactBody {
  readonly position: { x: number; y: number };
  readonly velocity: { x: number; y: number };
  readonly mass: number;
}

/** Separate two overlapping bodies according to their inverse masses. */
export function separateContactBodies(
  first: TranslationalContactBody,
  second: TranslationalContactBody,
  normal: WorldPoint,
  overlap: number
): void {
  if (overlap <= 0) return;
  const inverseFirst = 1 / Math.max(0.001, first.mass);
  const inverseSecond = 1 / Math.max(0.001, second.mass);
  const total = inverseFirst + inverseSecond;
  const firstDistance = overlap * (inverseFirst / total);
  const secondDistance = overlap * (inverseSecond / total);
  first.position.x -= normal.x * firstDistance;
  first.position.y -= normal.y * firstDistance;
  second.position.x += normal.x * secondDistance;
  second.position.y += normal.y * secondDistance;
}

/** Apply the normal impulse needed to reach a requested relative separating speed. */
export function resolveContactImpulse(
  first: TranslationalContactBody,
  second: TranslationalContactBody,
  normal: WorldPoint,
  targetRelativeSpeed: number,
  additionalInverseMass = 0
): number {
  const relativeX = second.velocity.x - first.velocity.x;
  const relativeY = second.velocity.y - first.velocity.y;
  const currentRelativeSpeed = relativeX * normal.x + relativeY * normal.y;
  const requiredChange = targetRelativeSpeed - currentRelativeSpeed;
  if (requiredChange <= 0) return 0;

  const inverseFirst = 1 / Math.max(0.001, first.mass);
  const inverseSecond = 1 / Math.max(0.001, second.mass);
  const impulseMagnitude =
    requiredChange / (inverseFirst + inverseSecond + Math.max(0, additionalInverseMass));
  first.velocity.x -= normal.x * impulseMagnitude * inverseFirst;
  first.velocity.y -= normal.y * impulseMagnitude * inverseFirst;
  second.velocity.x += normal.x * impulseMagnitude * inverseSecond;
  second.velocity.y += normal.y * impulseMagnitude * inverseSecond;
  return impulseMagnitude;
}
