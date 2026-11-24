import { drawTractorThrows } from './combat-tractor-throw-renderer';
import { drawCombatScrap } from './combat-scrap-renderer';
import { drawCombatGrapple } from './combat-grapple-renderer';
import { drawCombatMineMarker } from './combat-ship-detail-renderer';
import { drawFleetDuelDamage } from './fleet-native-damage-visual';
import { drawCombatImpactBatch } from './combat-impact-visual-batch';
import { appendCombatImpacts, combatEffectSource } from './combat-effect-clock';
import { VISION_IMPACT_SECONDS } from '../../core/combat-visual-timings';
import { AUTOCANNON_ROUNDS, AUTOCANNON_ROUND_INTERVAL } from '../../core/combat-visual-timings';
import { getShipDefinition } from '../../systems/ships';
import { projectHardpoint, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import type {
  CombatProjectileSnapshot,
  CombatBeamSnapshot,
  StrategicCombatSnapshot,
  StrategicCombatantSnapshot,
} from '../../systems/combat/strategic-combat-types';
import type { DistressDamageParticles } from '../salvage/distress-damage-particles';
import type {
  Point,
  VisibleCombatImpact,
  AutocannonVisualBurst,
} from './strategic-combat-renderer-types';

/** Keep the player-view snapshot primary even when joining an existing NPC duel. */
export function fleetRenderSources(
  model: StrategicCombatSnapshot,
  duels: readonly StrategicCombatSnapshot[],
  supporters: readonly StrategicCombatSnapshot[]
): {
  readonly additional: readonly StrategicCombatSnapshot[];
  readonly supportingFromIndex: number;
} {
  const all = [...duels, ...supporters];
  const key = combatEffectSource(model);
  const direct = all.findIndex((duel) => combatEffectSource(duel) === key);
  const reversed =
    model.boardingInitiator && direct < 0
      ? all.findIndex(
          (duel) => duel.attacker.id === model.defender.id && duel.defender.id === model.attacker.id
        )
      : -1;
  const match = direct < 0 ? reversed : direct;
  return {
    additional: all.filter((_, index) => index !== match),
    supportingFromIndex: duels.length - Number(match >= 0 && match < duels.length),
  };
}

/** The player result is frozen while surviving ships continue in native duels. */
export function liveFleetCombatView(
  result: StrategicCombatSnapshot,
  duels: readonly StrategicCombatSnapshot[]
): StrategicCombatSnapshot {
  if (result.winner === null || duels.length === 0) return result;
  const live = (ship: StrategicCombatantSnapshot) => {
    if (ship.hullHp <= 0) return ship;
    const active = duels.find(
      (duel) =>
        duel.winner === null && (duel.attacker.id === ship.id || duel.defender.id === ship.id)
    );
    const source =
      active ?? duels.find((duel) => duel.attacker.id === ship.id || duel.defender.id === ship.id);
    if (!source) return ship;
    return source.attacker.id === ship.id ? source.attacker : source.defender;
  };
  return { ...result, attacker: live(result.attacker), defender: live(result.defender) };
}

/** Keep autocannon burst IDs unique across independent native combat runtimes. */
export function updateParallelAutocannonBursts(
  duels: readonly StrategicCombatSnapshot[],
  bursts: Map<string, AutocannonVisualBurst>,
  elapsed: number
): void {
  for (const duel of duels) {
    if (duel.winner !== null) continue;
    const source = combatEffectSource(duel);
    for (const projectile of duel.projectiles) {
      const id = source + ':' + projectile.id;
      if (projectile.kind !== 'autocannon' || bursts.has(id)) continue;
      const origin = projectile.origin;
      const target = projectile.target;
      const travel = Math.hypot(target.x - origin.x, target.y - origin.y);
      bursts.set(id, {
        origin: { ...origin },
        target: { ...target },
        spawnedAt: elapsed,
        flightSeconds: Math.max(0.12, travel / 900),
      });
    }
  }
  for (const [id, burst] of bursts) {
    const lifetime = burst.flightSeconds + (AUTOCANNON_ROUNDS - 1) * AUTOCANNON_ROUND_INTERVAL;
    if (elapsed - burst.spawnedAt >= lifetime) bursts.delete(id);
  }
}

/** Additional original 1vs1 snapshots are painted with existing primitives on
 * the same canvas; this module neither creates a renderer nor owns a camera.
 */
export function paintParallelNativeDuels(options: {
  readonly context: CanvasRenderingContext2D;
  readonly duels: readonly StrategicCombatSnapshot[];
  /** Support snapshots share their defender with a regular duel; draw it once. */
  readonly supportingFromIndex?: number;
  readonly hiddenIds?: ReadonlySet<string>;
  readonly damagePaintedIds?: Set<string>;
  readonly scale: number;
  readonly project: (point: Point) => Point;
  readonly geometry: (ship: StrategicCombatantSnapshot) => ShipScreenGeometry;
  readonly paintShip: (ship: StrategicCombatantSnapshot) => void;
  readonly paintBeam: (beam: CombatBeamSnapshot) => void;
  readonly paintProjectile: (shot: CombatProjectileSnapshot) => void;
  readonly damageParticles: Map<string, DistressDamageParticles>;
  readonly visibleImpacts: ReadonlyMap<string, readonly VisibleCombatImpact[]>;
  readonly width: number;
  readonly height: number;
  readonly timeSeconds: number;
  readonly visualElapsed: number;
}): void {
  const {
    context,
    duels,
    supportingFromIndex,
    hiddenIds,
    damagePaintedIds,
    scale,
    project,
    geometry,
    paintShip,
    paintBeam,
    paintProjectile,
    damageParticles,
    visibleImpacts,
    width,
    height,
    timeSeconds,
    visualElapsed,
  } = options;
  for (const [index, duel] of duels.entries()) {
    drawTractorThrows(
      context,
      duel.winner === null ? duel.thrownAsteroids : [],
      scale,
      project,
      (ctx, rock, radius) => drawCombatScrap(ctx, rock, radius, timeSeconds)
    );
    drawCombatGrapple(context, duel, (side) => {
      const ship = duel[side];
      const shape = geometry(ship);
      const points = getShipDefinition(ship.shipId)?.sprite.hardpoints;
      const mount = points?.grapplingHooks?.[0];
      return points && mount ? projectHardpoint(mount, points, shape) : shape.center;
    });
    for (const mine of duel.mines) {
      if (mine.detection === 'hidden') continue;
      drawCombatMineMarker(context, mine, project(mine.position));
    }
    for (const projectile of duel.projectiles) {
      if (projectile.kind === 'autocannon') continue;
      paintProjectile(projectile);
    }
    for (const beam of duel.beams) {
      if (beam.ttlSeconds > 0) paintBeam(beam);
    }
    const supporting = index >= (supportingFromIndex ?? Number.POSITIVE_INFINITY);
    if (duel.winner === null || duel.attacker.hullHp > 0) paintShip(duel.attacker);
    if (!supporting && (duel.winner === null || duel.defender.hullHp > 0)) {
      paintShip(duel.defender);
    }
    drawFleetDuelDamage(
      context,
      duel,
      supporting,
      geometry,
      damageParticles,
      timeSeconds,
      width,
      height,
      hiddenIds,
      damagePaintedIds
    );
    drawCombatImpactBatch(
      context,
      visibleImpacts.get(combatEffectSource(duel)) ?? [],
      visualElapsed,
      project,
      (side) => geometry(duel[side]).height
    );
  }
}

/** Cache only newly reported native impacts, retaining the original effect painter. */
export function updateParallelNativeImpacts(
  duels: readonly StrategicCombatSnapshot[],
  sharedElapsed: number,
  now: number,
  seenImpacts: Map<string, number>,
  visibleImpacts: Map<string, VisibleCombatImpact[]>
): void {
  const active = new Set<string>();
  for (const duel of duels) {
    const source = combatEffectSource(duel);
    if (active.has(source)) continue;
    active.add(source);
    const visible = visibleImpacts.get(source) ?? [];
    const seen = appendCombatImpacts(duel, visible, seenImpacts.get(source) ?? -1, sharedElapsed);
    seenImpacts.set(source, seen);
    visibleImpacts.set(
      source,
      visible.filter((effect) => now - effect.startedAt < VISION_IMPACT_SECONDS)
    );
  }
  for (const source of seenImpacts.keys()) {
    if (active.has(source)) continue;
    seenImpacts.delete(source);
    visibleImpacts.delete(source);
  }
}
