import { drawTractorThrows } from './combat-tractor-throw-renderer';
import { drawCombatScrap } from './combat-scrap-renderer';
import { drawCombatGrapple } from './combat-grapple-renderer';
import { drawCombatMineMarker } from './combat-ship-detail-renderer';
import {
  drawFleetCombatDamagePair as drawCombatDamagePair,
  drawFleetCombatDamageShip,
} from './fleet-native-damage-visual';
import { drawCombatImpactBatch } from './combat-impact-visual-batch';
import { WEAPON_VISUALS } from '../../core/weapon-visual-profiles';
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

/** Keep autocannon burst IDs unique across independent native combat runtimes. */
export function updateParallelAutocannonBursts(
  duels: readonly StrategicCombatSnapshot[],
  bursts: Map<string, AutocannonVisualBurst>,
  elapsed: number
): void {
  for (const [duelIndex, duel] of duels.entries()) {
    for (const projectile of duel.projectiles) {
      const id = duelIndex + ':' + projectile.id;
      if (projectile.kind !== 'autocannon' || bursts.has(id)) continue;
      const origin = projectile.origin;
      const target = projectile.target;
      const travel = Math.hypot(target.x - origin.x, target.y - origin.y);
      bursts.set(id, {
        origin: { ...origin },
        target: { ...target },
        spawnedAt: duel.elapsedSeconds,
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
  readonly visibleImpacts: ReadonlyMap<number, readonly VisibleCombatImpact[]>;
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
    if (supporting) {
      drawFleetCombatDamageShip(
        context,
        duel.attacker,
        geometry,
        damageParticles,
        timeSeconds,
        width,
        height,
        hiddenIds ?? new Set(),
        damagePaintedIds ?? new Set()
      );
    } else {
      drawCombatDamagePair(
        context,
        [duel.attacker, duel.defender],
        geometry,
        damageParticles,
        timeSeconds,
        width,
        height,
        hiddenIds,
        damagePaintedIds
      );
    }
    drawCombatImpactBatch(
      context,
      visibleImpacts.get(index) ?? [],
      visualElapsed,
      project,
      (side) => geometry(duel[side]).height
    );
  }
}

/** Cache only newly reported native impacts, retaining the original effect painter. */
export function updateParallelNativeImpacts(
  duels: readonly StrategicCombatSnapshot[],
  now: number,
  seenImpacts: Map<number, number>,
  visibleImpacts: Map<number, VisibleCombatImpact[]>
): void {
  for (const [index, duel] of duels.entries()) {
    const seen = seenImpacts.get(index) ?? -1;
    const impacts = [...duel.recentImpacts, ...(duel.lastImpact ? [duel.lastImpact] : [])]
      .filter((impact) => impact.serial > seen)
      .sort((a, b) => a.serial - b.serial);
    const visible = visibleImpacts.get(index) ?? [];
    for (const impact of impacts) {
      seenImpacts.set(index, impact.serial);
      const delay = impact.weaponFamily
        ? WEAPON_VISUALS[impact.weaponFamily].impactDelaySeconds
        : 0;
      visible.push({ impact, startedAt: duel.elapsedSeconds + delay });
    }
    visibleImpacts.set(
      index,
      visible.filter((effect) => now - effect.startedAt < VISION_IMPACT_SECONDS)
    );
  }
}
