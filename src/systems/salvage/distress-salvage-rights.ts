import type { SalvageField, SectorSalvageEvent } from '../../core/salvage-types';
import { generateSectorSalvageEventField } from './salvage-event-field-generator';

/** Unlock the awarded salvage on the current field; never recreate local flight state. */
export function grantDistressSalvageRights(field: SalvageField, event: SectorSalvageEvent): void {
  if (!event.salvageRights) return;
  const current = field.wrecks[0];
  const granted = generateSectorSalvageEventField(event).wrecks[0];
  if (!current || !granted) return;
  field.wrecks[0] = {
    ...current,
    quality: granted.quality,
    resources: granted.resources,
    component: granted.component,
    componentStatus: granted.componentStatus,
  };
}
