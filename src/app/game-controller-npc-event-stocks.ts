import type { SectorNpcState } from '../core/npc-types';
import type { SalvageField, SectorSalvageEvent } from '../core/salvage-types';
import { generateSectorSalvageEventField } from '../systems/salvage/salvage-event-field-generator';
import { grantDistressSalvageRights } from '../systems/salvage/distress-salvage-rights';
import { salvageStockId } from '../systems/salvage/salvage-stock-id';
import { getShipComponent } from '../systems/ships';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';

function eventField(context: ControllerRuntimeContext, event: SectorSalvageEvent): SalvageField {
  const fields = context.state.salvageEventFields;
  const existing = fields.get(event.id);
  if (existing) {
    if (event.salvageRights && existing.wrecks[0]?.resources.length === 0) {
      grantDistressSalvageRights(existing, event);
    }
    return existing;
  }
  const field = generateSectorSalvageEventField(event);
  context.economy.wreckClaims.restoreField(field);
  fields.set(event.id, field);
  return field;
}

export function recoverNpcEventField(
  context: ControllerRuntimeContext,
  npc: SectorNpcState,
  event: SectorSalvageEvent
): boolean {
  const { salvage, npcs, wreckClaims } = context.economy;
  const field = eventField(context, event);
  salvage.prepareEventField?.(field);
  let recovered = false;
  for (const wreck of field.wrecks) {
    if (wreck.combatWreckVariant) continue;
    const sourceId = salvageStockId(field, wreck);
    for (const deposit of wreck.resources) {
      const amount = npcs.salvageLocal(npc, deposit.resourceId, deposit.remainingAmount, sourceId);
      deposit.remainingAmount -= amount;
      if (amount > 0) recovered = true;
    }
    const component = wreck.component;
    if (component && wreck.componentStatus === 'available') {
      if (getShipComponent(component.type, component.componentId)) {
        npc.salvageComponents = [
          ...(npc.salvageComponents ?? []),
          { type: component.type, componentId: component.componentId },
        ];
        wreck.componentStatus = 'recovered';
        recovered = true;
      }
    }
  }
  wreckClaims.rememberField(field);
  return recovered;
}
