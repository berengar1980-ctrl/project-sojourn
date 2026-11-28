import type { LocalShipState } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';

export function ensureLocalShipPhysicalState(ship: LocalShipState): void {
  const legacySpeed = Number.isFinite(ship.speed) ? ship.speed : 0;
  ship.turnRateRadiansPerSecond ??= 0;
  ship.angularThrust ??= 0;
  ship.lateralThrust ??= 0;
  ship.longitudinalThrust ??= 0;
  if (!ship.velocity) {
    ship.velocity = {
      x: Math.cos(ship.headingRadians) * legacySpeed,
      y: Math.sin(ship.headingRadians) * legacySpeed,
    };
  }
  const descriptor = Object.getOwnPropertyDescriptor(ship, 'speed');
  if (descriptor?.get) return;
  Object.defineProperty(ship, 'speed', {
    configurable: true,
    enumerable: true,
    get() {
      return (
        Math.cos(this.headingRadians) * this.velocity.x +
        Math.sin(this.headingRadians) * this.velocity.y
      );
    },
  });
}

export function localShipVelocity(ship: LocalShipState): WorldPoint {
  ensureLocalShipPhysicalState(ship);
  return { ...ship.velocity };
}

export function localShipForwardSpeed(ship: LocalShipState): number {
  ensureLocalShipPhysicalState(ship);
  return (
    Math.cos(ship.headingRadians) * ship.velocity.x +
    Math.sin(ship.headingRadians) * ship.velocity.y
  );
}

export function localShipLateralSpeed(ship: LocalShipState): number {
  ensureLocalShipPhysicalState(ship);
  return (
    -Math.sin(ship.headingRadians) * ship.velocity.x +
    Math.cos(ship.headingRadians) * ship.velocity.y
  );
}

export function setLocalShipVelocity(ship: LocalShipState, velocity: WorldPoint): void {
  ensureLocalShipPhysicalState(ship);
  ship.velocity = { ...velocity };
}

export function setLocalShipComponents(
  ship: LocalShipState,
  forward: number,
  lateral: number
): void {
  ensureLocalShipPhysicalState(ship);
  const forwardX = Math.cos(ship.headingRadians);
  const forwardY = Math.sin(ship.headingRadians);
  ship.velocity = {
    x: forwardX * forward - forwardY * lateral,
    y: forwardY * forward + forwardX * lateral,
  };
}

export function clearLocalShipVelocity(ship: LocalShipState): void {
  ensureLocalShipPhysicalState(ship);
  ship.velocity = { x: 0, y: 0 };
}
