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
  if (field.debris && snapshot.arena.asteroids) {
    const remaining = new Map(snapshot.arena.asteroids.map((rock) => [rock.id, rock]));
    // Once captured and thrown, the original fragment must not respawn in the field.
    for (let index = field.debris.length - 1; index >= 0; index -= 1) {
      const part = field.debris[index]!;
      const live = remaining.get(part.id);
      if (!live) {
        field.debris.splice(index, 1);
        continue;
      }
      part.position = { ...live.position };
      part.driftVelocity = { ...live.velocity };
      part.rotation3d = { ...part.rotation3d, z: live.rotation };
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
