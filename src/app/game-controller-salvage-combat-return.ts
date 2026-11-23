import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-service';
import type { SalvageField } from '../core/salvage-types';
import type { NpcLocalSalvageService } from '../systems/npcs/npc-local-salvage-service';
import type { createSalvageLocalSpaceService } from '../systems/salvage';
import { syncSalvageCombatField } from '../systems/combat/field-combat-arena';
export { syncSalvageCombatField } from '../systems/combat/field-combat-arena';

/** Reconcile destructible salvage fragments and both combat ship positions. */
export function finishSalvageCombat(
  field: SalvageField,
  service: ReturnType<typeof createSalvageLocalSpaceService>,
  npcSalvage: NpcLocalSalvageService,
  snapshot: StrategicCombatSnapshot
): void {
  syncSalvageCombatField(field, snapshot);
  service.syncCombatPose(
    snapshot.attacker.position,
    snapshot.attacker.headingRadians,
    snapshot.attacker.speed
  );
  npcSalvage.syncCombatPose(
    snapshot.defender.id,
    snapshot.defender.position,
    snapshot.defender.headingRadians,
    snapshot.defender.speed
  );
}
