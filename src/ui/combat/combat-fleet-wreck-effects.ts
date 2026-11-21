import { DistressDamageParticles } from '../salvage/distress-damage-particles';
import { drawShipDestruction } from './ship-destruction-visual';
import type { CombatVisualAsteroid, CombatPoint } from '../../systems/combat/strategic-combat-types';

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
      worldToScreen: (point: CombatPoint) => point,
      scale: (meters: number) => meters,
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
      particles.update(now, center, rock.rotation, size * 2, camera, context, width, height, 0);
    }
  }
}
