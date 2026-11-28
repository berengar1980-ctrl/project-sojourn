export interface MutablePhysicalPoint {
  x: number;
  y: number;
}

/** Physical pose shared by every live ship simulation and its field handoffs. */
export interface PhysicalShipState {
  position: MutablePhysicalPoint;
  velocity: MutablePhysicalPoint;
  headingRadians: number;
  turnRateRadiansPerSecond: number;
  angularThrust: number;
  lateralThrust: number;
  longitudinalThrust: number;
}

export interface ManeuveringShipControls {
  turnRateRadiansPerSecond: number;
  angularThrust: number;
  lateralThrust?: number;
  longitudinalThrust?: number;
}

/** Kinematic heading and translational maneuver controls shared by powered hulls. */
export type ManeuveringShipState = PhysicalShipState;

export function velocityFromHeading(headingRadians: number, speed: number): MutablePhysicalPoint {
  return { x: Math.cos(headingRadians) * speed, y: Math.sin(headingRadians) * speed };
}

export function ensurePhysicalShipVelocity(ship: {
  headingRadians: number;
  velocity?: MutablePhysicalPoint;
  speed?: number;
  turnRateRadiansPerSecond?: number;
  angularThrust?: number;
  lateralThrust?: number;
  longitudinalThrust?: number;
}): asserts ship is PhysicalShipState & { speed: number } {
  const legacySpeed = Number.isFinite(ship.speed) ? (ship.speed as number) : 0;
  ship.velocity ??= velocityFromHeading(ship.headingRadians, legacySpeed);
  ship.turnRateRadiansPerSecond ??= 0;
  ship.angularThrust ??= 0;
  ship.lateralThrust ??= 0;
  ship.longitudinalThrust ??= 0;
  const descriptor = Object.getOwnPropertyDescriptor(ship, 'speed');
  if (descriptor?.get) return;
  Object.defineProperty(ship, 'speed', {
    configurable: true,
    enumerable: true,
    get() {
      return Math.hypot(this.velocity.x, this.velocity.y);
    },
  });
}
