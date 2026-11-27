import type { WorldLocation } from './world-types';

/** Inhabited docks service civilian ships; barren fields and derelicts do not. */
export function isServicedPort(location: WorldLocation | undefined): boolean {
  if (!location) return false;
  const kind = location.kind;
  if (kind !== 'planet' && kind !== 'moon' && kind !== 'station') return false;
  const facilities = location.activities;
  return Boolean(facilities.refuel || facilities.dock || facilities.trade || facilities.shipyard);
}
