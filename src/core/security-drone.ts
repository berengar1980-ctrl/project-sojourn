export const DRONE_SCAN_RADIUS = 460;

/** Compact GC-87 shield contact footprint in world metres. */
export const DRONE_SHIELD_RADIUS_METERS = 18;

export function isSecurityDrone(id?: string): boolean {
  return id?.startsWith('security-drone:') ?? false;
}
