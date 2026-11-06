import type { StarMapViewModel } from '../../features/star-map/star-map-view-model';
import type { MapCamera, ScreenPoint } from './map-camera';
import { starMapShipWidth } from './map-visual-scale';
import {
  layoutOrbitalShipAngles,
  OrbitalMapTransitions,
  projectOrbitalMapShip,
} from './orbital-map-projection';

/** Shared player and NPC layout, including stable contact-relative angles. */
export class OrbitalMapSceneProjection {
  private readonly playerTransitions = new OrbitalMapTransitions();

  reset(): void {
    this.playerTransitions.reset();
  }

  angles(model: StarMapViewModel, camera: MapCamera): ReadonlyMap<string, number> {
    const zoom = camera.getRelativeZoom();
    const player = model.playerShip;
    return layoutOrbitalShipAngles(
      [
        ...model.npcShips.map((npc) => ({
          id: npc.id,
          locationId: npc.locationId,
          position: npc.position,
          shipWidth: starMapShipWidth(npc.nominalLengthMeters, zoom),
          stationary: !npc.isTravelling && !npc.combatMode,
        })),
        {
          id: 'player',
          locationId: model.navigation.currentLocationId,
          position: player.position,
          shipWidth: starMapShipWidth(player.nominalLengthMeters, zoom),
          stationary: !player.isTravelling,
        },
      ],
      model.locations,
      zoom
    );
  }

  playerPoint(
    model: StarMapViewModel,
    camera: MapCamera,
    width: number,
    height: number,
    angles: ReadonlyMap<string, number>
  ): ScreenPoint {
    const player = model.playerShip;
    const location = model.locations.find(
      (entry) => entry.id === model.navigation.currentLocationId
    );
    return projectOrbitalMapShip(
      player.position,
      location,
      camera,
      width,
      height,
      starMapShipWidth(player.nominalLengthMeters, camera.getRelativeZoom()),
      !player.isTravelling,
      this.playerTransitions.blend('player', !player.isTravelling, performance.now()),
      angles.get('player')
    );
  }
}
