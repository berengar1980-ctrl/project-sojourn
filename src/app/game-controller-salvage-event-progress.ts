import type { SalvageLocalSpaceSnapshot, SectorSalvageEvent } from '../core/salvage-types';

/** Check completion without coupling sector-event resolution to scene rendering. */
export function completeSalvageSectorEvent(
  event: SectorSalvageEvent | null,
  alreadyResolved: boolean,
  snapshot: SalvageLocalSpaceSnapshot,
  onComplete?: (eventId: string) => void
): boolean {
  if (!event || alreadyResolved || (event.type !== 'special-wreck' && !event.salvageRights))
    return alreadyResolved;
  const complete = snapshot.field.wrecks.every(
    (wreck) =>
      wreck.resources.every((resource) => resource.remainingAmount <= 0) &&
      wreck.componentStatus !== 'available'
  );
  if (!complete) return false;
  onComplete?.(event.id);
  return true;
}
