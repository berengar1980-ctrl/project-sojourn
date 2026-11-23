import type { SectorNpcState } from '../core/npc-types';
import type { LocalNpcShipView } from '../features/local-space/local-space-view-model';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-types';
import { getShipDefinition } from '../systems/ships';

/** Render the native combat actor even if traffic/worker lists have temporarily
 * handed the same NPC over to combat. The actor ID and physical pose are
 * authoritative; this only assembles existing field-sprite view data.
 */
export function fieldNpcCombatViews(
  fieldShips: readonly LocalNpcShipView[],
  combats: readonly StrategicCombatSnapshot[],
  npcs: readonly SectorNpcState[],
  escaped: ReadonlySet<string>,
  selectedNpcId: string | null
): LocalNpcShipView[] {
  const actors = new Map(
    combats.flatMap((duel) => [duel.attacker, duel.defender]).map((actor) => [actor.id, actor] as const)
  );
  const visible = new Set<string>();
  const result: LocalNpcShipView[] = [];
  for (const ship of fieldShips) {
    if (escaped.has(ship.id) || visible.has(ship.id)) continue;
    visible.add(ship.id);
    const actor = actors.get(ship.id);
    result.push(
      actor
        ? {
            ...ship,
            position: { ...actor.position },
            headingRadians: actor.headingRadians,
            speed: actor.speed,
            laserActive: false,
          }
        : ship
    );
  }
  for (const [id, actor] of actors) {
    if (visible.has(id) || escaped.has(id) || id === 'player' || id.startsWith('security-drone:'))
      continue;
    if (actor.hullHp <= 0) continue;
    const npc = npcs.find((entry) => entry.id === id);
    const ship = getShipDefinition(actor.shipId);
    if (!npc || !ship) continue;
    result.push({
      id,
      name: npc.name,
      position: { ...actor.position },
      headingRadians: actor.headingRadians,
      speed: actor.speed,
      phase: 'approaching',
      targetAsteroidId: null,
      laserActive: false,
      scanProgress: 0,
      nominalLengthMeters: ship.nominalLengthMeters,
      spriteUrl: ship.sprite.assetUrl,
      spriteAspectRatio: ship.sprite.widthPx / ship.sprite.heightPx,
      hardpoints: ship.sprite.hardpoints,
      isSelected: selectedNpcId === id,
      isPirate: Boolean(npc.pirate),
    });
    visible.add(id);
  }
  return result;
}
