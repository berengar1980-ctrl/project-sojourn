import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-service';
import type { SalvageField } from '../core/salvage-types';
import type { NpcLocalSalvageService } from '../systems/npcs/npc-local-salvage-service';
import type { createSalvageLocalSpaceService } from '../systems/salvage';
import { invalidateSalvagePhysics } from '../systems/salvage/salvage-container-motion';

/** Reconcile destructible salvage fragments and both combat ship positions. */
export function finishSalvageCombat(
  field: SalvageField,
  service: ReturnType<typeof createSalvageLocalSpaceService>,
  npcSalvage: NpcLocalSalvageService,
  snapshot: StrategicCombatSnapshot
): void {
  if (snapshot.arena.asteroids) {
    const remaining = new Map(snapshot.arena.asteroids.map((rock) => [rock.id, rock]));
    // Reconcile ALL native parts; a thrown container must not respawn as loot.
    for (let index = field.wrecks.length - 1; index >= 0; index -= 1) {
      const wreck = field.wrecks[index]!;
      const live = remaining.get(wreck.id);
      if (!live) {
        field.wrecks.splice(index, 1);
        continue;
      }
      wreck.position = { ...live.position };
      wreck.rotation = live.rotation;
      wreck.driftVelocity = { ...live.velocity };
      if (wreck.rotation3d) wreck.rotation3d = { ...wreck.rotation3d, z: live.rotation };
    }
    for (let index = (field.debris?.length ?? 0) - 1; index >= 0; index -= 1) {
      const part = field.debris![index]!;
      const live = remaining.get(part.id);
      if (!live) {
        field.debris!.splice(index, 1);
        continue;
      }
      part.position = { ...live.position };
      part.driftVelocity = { ...live.velocity };
      part.rotation3d = { ...part.rotation3d, z: live.rotation };
    }
    for (let index = (field.sections?.length ?? 0) - 1; index >= 0; index -= 1) {
      const section = field.sections![index]!;
      const live = remaining.get(section.id);
      if (!live) {
        field.sections!.splice(index, 1);
        continue;
      }
      section.position = { ...live.position };
      section.driftVelocity = { ...live.velocity };
      section.rotation3d = { ...section.rotation3d, z: live.rotation };
    }
    invalidateSalvagePhysics(field);
  }
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
