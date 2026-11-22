import { DistressDamageParticles } from '../salvage/distress-damage-particles';
import { drawShipDestruction } from './ship-destruction-visual';
import type {
  CombatVisualAsteroid,
  CombatPoint,
  StrategicCombatSnapshot,
} from '../../systems/combat/strategic-combat-types';

/** Every native snapshot agrees about exits and every wreck replaces one hull. */
export function nativeFleetVisibility(
  first: StrategicCombatSnapshot,
  others: readonly StrategicCombatSnapshot[],
  externalEscapes: readonly string[]
): { escaped: ReadonlySet<string>; damageHidden: ReadonlySet<string> } {
  const escaped = new Set(externalEscapes);
  for (const duel of [first, ...others]) {
    if (duel.outcomeReason !== 'escape') continue;
    if (duel.winner === 'defender') escaped.add(duel.attacker.id);
    if (duel.winner === 'attacker') escaped.add(duel.defender.id);
  }
  const damageHidden = new Set(escaped);
  for (const rock of first.arena.asteroids ?? []) {
    if (rock.id.startsWith('fleet-wreck:')) {
      damageHidden.add(rock.id.slice('fleet-wreck:'.length));
    }
  }
  return { escaped, damageHidden };
}

/**
 * The wreck's actual 3D mesh is drawn by the existing asteroid/salvage painter.
 * This overlay adds the initial breakup and a persistent smoke/fire emitter,
 * anchored to the drifting physical wreck instead of the vanished ship.
 */
export class CombatFleetWreckEffects {
  private readonly firstSeenAt = new Map<string, number>();
  private readonly smokeById = new Map<string, DistressDamageParticles>();

  draw(
    context: CanvasRenderingContext2D,
    bodies: readonly CombatVisualAsteroid[],
    project: (point: CombatPoint) => CombatPoint,
    scale: number,
    now: number,
    width: number,
    height: number
  ): void {
    const camera = {
      worldToScreen: (point: CombatPoint) => project(point),
      scale: (meters: number) => meters * scale,
    };
    for (const rock of bodies) {
      if (!rock.id.startsWith('fleet-wreck:')) continue;
      const firstSeen = this.firstSeenAt.get(rock.id) ?? now;
      this.firstSeenAt.set(rock.id, firstSeen);
      const center = project(rock.position);
      const size = rock.radius * scale;
      const age = now - firstSeen;
      if (age < 2.8) {
        drawShipDestruction(context, center.x, center.y, size * 0.7, age);
      }
      let particles = this.smokeById.get(rock.id);
      if (!particles) {
        particles = new DistressDamageParticles();
        this.smokeById.set(rock.id, particles);
      }
      particles.update(
        now,
        rock.position,
        rock.rotation,
        rock.radius * 2,
        camera,
        context,
        width,
        height,
        0
      );
    }
  }
}
