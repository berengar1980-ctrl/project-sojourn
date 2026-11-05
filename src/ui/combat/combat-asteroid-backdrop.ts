import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';
import { AsteroidBackdropRenderer } from '../space/asteroid-backdrop-renderer';
import type { CombatCamera } from './combat-camera';
import { hash } from './strategic-combat-renderer-math';

type CombatArena = StrategicCombatSnapshot['arena'];

/** Backdrop only on real asteroid arenas; never in empty space or wreck fields. */
export class CombatAsteroidBackdrop {
  private readonly backdrop: AsteroidBackdropRenderer | null;
  private readonly worldWidth: number;
  private readonly worldHeight: number;

  constructor(context: CanvasRenderingContext2D, arena: CombatArena) {
    this.worldWidth = arena.width;
    this.worldHeight = arena.height;
    const rock = arena.asteroids?.find(
      (item) =>
        item.kind === 'resource' &&
        !item.debrisVariant &&
        !item.sectionVariant &&
        !item.containerVariant
    );
    if (!rock) {
      this.backdrop = null;
      return;
    }

    // Mining encounters inherit the mining field seed. Standalone arena setups
    // without one derive a stable fallback from the existing rock geometry.
    const parts = [
      arena.width,
      arena.height,
      rock.id,
      Math.round(rock.position.x),
      Math.round(rock.position.y),
    ];
    const seed = arena.backdropSeed ?? hash(parts.join(':'));
    this.backdrop = new AsteroidBackdropRenderer(context, seed, arena.width, arena.height);
  }

  draw(width: number, height: number, camera: CombatCamera): void {
    if (!this.backdrop) return;
    // CombatCamera.project uses independent viewport X/Y scales. Match them
    // exactly to avoid distorted movement when the viewport is not square.
    const zoomX = ((width - 140) / this.worldWidth) * camera.zoom;
    const zoomY = ((height - 140) / this.worldHeight) * camera.zoom;
    if (zoomX <= 0 || zoomY <= 0) return;
    this.backdrop.draw({
      width,
      height,
      cameraZoom: zoomX,
      cameraZoomY: zoomY,
      cameraCenter: {
        x: this.worldWidth * 0.5 - camera.offsetX / zoomX,
        y: this.worldHeight * 0.5 - camera.offsetY / zoomY,
      },
    });
  }
}
