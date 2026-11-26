export const SECURITY_DRONE_SHIP_ID = '24m-security-drone';
export const SECURITY_DRONE_THREAT_WEIGHT = 1.6;
export const DRONE_SCAN_RADIUS = 460;
export const SECURITY_DRONE_REPLACEMENT_SECONDS = 180;

export function fieldSecurityDroneCount(dangerLevel: number): number {
  return dangerLevel <= 1 ? 2 : dangerLevel === 2 ? 1 : 0;
}

/** Compact GC-87 shield contact footprint in world metres. */
export const DRONE_SHIELD_RADIUS_METERS = 18;

export function isSecurityDrone(id?: string): boolean {
  return id?.startsWith('security-drone:') ?? false;
}
