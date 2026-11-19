import type { SalvageField } from '../core/salvage-types';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { dispatchPatrolToReport } from './game-controller-law-enforcement';

/** Only actual, sensor-confirmed attempts to violate an existing wreck claim
 * become legal incidents. The underlying salvage permission check still
 * prevents removal of foreign cargo.
 */
export function reportUnauthorizedWreckSalvage(
  context: ControllerRuntimeContext,
  field: SalvageField,
  wreckId: string
): void {
  const day = context.economy.situations.currentDay;
  const claim = context.economy.wreckClaims.claim(field.id, wreckId, day);
  if (!claim || claim.ownerId === 'player') return;
  const shipId = context.state.activeShip.id;
  const incident = 'illegal-wreck-salvage:' + field.id + ':' + wreckId + ':' + day;
  const legal = context.economy.legal;
  const charge = legal.reportOffense(
    shipId,
    claim.ownerId,
    'Versuchte unbefugte Wrackbergung',
    500,
    day,
    incident
  );
  if (!charge) return;
  context.systemLog.write(
    'SEC-01 > UNBEFUGTE BERGUNG ERKANNT: WRACK ' + wreckId.toUpperCase()
  );
  const report = legal.reportSighting(shipId, field.sourceLocationId, day, 'distress');
  if (report) dispatchPatrolToReport(context, field.sourceLocationId, null);
}
