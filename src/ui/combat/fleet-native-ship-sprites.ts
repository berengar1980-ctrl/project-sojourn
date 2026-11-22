import { getShipDefinition } from '../../systems/ships';
import { DRONE_DIAMETER_PX } from '../local-space/local-security-drone-visual';
import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-types';
import type { CombatCamera } from './combat-camera';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';

/** Shared native combat ship art and projected geometry for 1v1 and fleet. */
export class FleetNativeShipSprites {
  private readonly images = new Map<string, HTMLImageElement>();

  constructor(private readonly redraw: () => void) {}

  image(shipId: string, securityDrone = false): HTMLImageElement | null {
    const definition = getShipDefinition(shipId);
    if (!definition && !securityDrone) return null;
    const key = securityDrone ? 'security-drone-sprite' : shipId;
    const cached = this.images.get(key);
    if (cached) return cached;
    const image = new Image();
    image.onload = this.redraw;
    image.src = securityDrone ? '/drones/security-drone-gc87r8.webp' : definition!.sprite.assetUrl;
    this.images.set(key, image);
    return image;
  }

  geometry(
    combatant: StrategicCombatSnapshot['attacker'],
    width: number,
    height: number,
    camera: CombatCamera,
    arena: StrategicCombatSnapshot['arena']
  ): ShipScreenGeometry {
    const isDrone = combatant.id.startsWith('security-drone:');
    const image = this.image(combatant.shipId, isDrone);
    const definition = getShipDefinition(combatant.shipId);
    const nominalLength = definition?.nominalLengthMeters ?? 60;
    const canvasScale = camera.scale(width, height, arena.width, arena.height);
    const shipWidth = isDrone ? DRONE_DIAMETER_PX * camera.zoom : nominalLength * canvasScale;
    const aspect = isDrone
      ? 1
      : image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : definition
          ? definition.sprite.widthPx / definition.sprite.heightPx
          : 2.2;
    return {
      center: camera.project(combatant.position, width, height, arena.width, arena.height),
      width: shipWidth,
      height: shipWidth / Math.max(0.35, aspect),
      angle: combatant.headingRadians,
    };
  }
}
