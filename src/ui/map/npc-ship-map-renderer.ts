import type { StarMapViewModel } from '../../features/star-map/star-map-view-model';
import { drawPirateInsignia } from '../ships/pirate-insignia-renderer';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { ShipManeuverEffectsRenderer } from '../ships/ship-maneuver-effects-renderer';
import { ShipLightingRenderer } from '../ships/ship-lighting-renderer';
import { spriteDrawOffset, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import type { MapCamera } from './map-camera';
import { mapLocationVisualRadius, starMapShipWidth } from './map-visual-scale';
import { projectOrbitalMapShip } from './orbital-map-projection';
import {
  layoutNpcMapLabels,
  type MapLabelBox,
  type NpcMapLabelRequest,
} from './npc-ship-label-layout';

export interface NpcShipMapHitArea {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export class NpcShipMapRenderer {
  private readonly lighting = new ShipLightingRenderer();
  private readonly engines = new ShipEngineEffectsRenderer();
  private readonly maneuvers = new ShipManeuverEffectsRenderer();
  private readonly priorHeading = new Map<string, { angle: number; time: number }>();
  private readonly images = new Map<string, HTMLImageElement>();

  constructor(
    private readonly context: CanvasRenderingContext2D,
    private readonly requestRedraw: () => void
  ) {}

  draw(
    model: StarMapViewModel,
    camera: MapCamera,
    width: number,
    height: number,
    labelsVisible: boolean,
    navMode = false
  ): NpcShipMapHitArea[] {
    const hits: NpcShipMapHitArea[] = [];
    const zoom = camera.getRelativeZoom();
    const timeSeconds = performance.now() / 1000;
    const starPoint = camera.worldToScreen(model.star.position, width, height);
    const pendingLabels: NpcMapLabelRequest[] = [];

    for (const npc of model.npcShips) {
      const image = navMode ? null : this.image(npc.spriteUrl);
      const widthPx = starMapShipWidth(npc.nominalLengthMeters, zoom);
      const location = model.locations.find((entry) => entry.id === npc.locationId);
      const point = projectOrbitalMapShip(
        npc.position,
        location,
        camera,
        width,
        height,
        widthPx,
        !npc.isTravelling && !npc.combatMode
      );
      const aspect =
        image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
          ? image.naturalWidth / image.naturalHeight
          : npc.spriteAspectRatio;
      const geometry: ShipScreenGeometry = {
        center: point,
        width: widthPx,
        height: widthPx / aspect,
        angle: npc.headingRadians,
      };

      if (navMode) {
        const size = Math.min(12, Math.max(7, widthPx * 0.34));
        this.drawNavContact(point, npc.headingRadians, size);
        this.drawContactRing(model, npc.id, point.x, point.y, size * 2, size * 2);
      } else if (image) {
        this.drawShip(
          model,
          npc.id,
          image,
          geometry,
          starPoint,
          npc.headingRadians,
          npc.isTravelling,
          timeSeconds
        );
        if (npc.pirateMark) drawPirateInsignia(this.context, npc.pirateMark, geometry);
        this.drawContactRing(model, npc.id, point.x, point.y, widthPx, geometry.height);
      }
      hits.push({
        id: npc.id,
        x: point.x,
        y: point.y,
        radius: navMode ? 19 : Math.max(20, Math.max(widthPx, geometry.height) * 0.85 + 8),
      });

      if (labelsVisible) {
        pendingLabels.push({
          id: npc.id,
          name: npc.name,
          x: point.x,
          y: point.y,
          shipWidth: navMode ? 14 : widthPx,
          shipHeight: navMode ? 14 : geometry.height,
          isSelected: npc.isSelected === true,
          isPursuitTarget: npc.isPursuitTarget === true,
          isTravelling: npc.isTravelling,
        });
      }
    }

    this.drawNpcLabels(model, camera, width, height, zoom, navMode, pendingLabels);
    return hits;
  }

  private drawNpcLabels(
    model: StarMapViewModel,
    camera: MapCamera,
    width: number,
    height: number,
    zoom: number,
    navMode: boolean,
    pendingLabels: readonly NpcMapLabelRequest[]
  ): void {
    if (pendingLabels.length === 0) return;
    const obstacles: MapLabelBox[] = [];
    for (const location of model.locations) {
      const point = camera.worldToScreen(location.position, width, height);
      const radius = mapLocationVisualRadius(location, zoom);
      obstacles.push({ x: point.x, y: point.y, width: radius * 2, height: radius * 2 });
      obstacles.push({
        x: point.x,
        y: point.y + radius + 17,
        width: Math.max(35, location.name.length * 6 + 12),
        height: 15,
      });
    }
    this.context.fillStyle = navMode ? '#8ed8ac' : 'rgba(196, 211, 221, .78)';
    this.context.font = '9px ui-monospace, monospace';
    this.context.textAlign = 'center';
    for (const label of layoutNpcMapLabels(pendingLabels, obstacles)) {
      this.context.fillText(label.name, label.x, label.baseline);
    }
  }

  private drawNavContact(
    point: { readonly x: number; readonly y: number },
    headingRadians: number,
    size: number
  ): void {
    const context = this.context;
    context.save();
    context.translate(point.x, point.y);
    context.rotate(headingRadians);
    context.strokeStyle = '#8bd9a9';
    context.fillStyle = 'rgba(93, 187, 126, .15)';
    context.lineWidth = 1.3;
    context.beginPath();
    context.moveTo(size, 0);
    context.lineTo(-size * 0.75, -size * 0.6);
    context.lineTo(-size * 0.38, 0);
    context.lineTo(-size * 0.75, size * 0.6);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
  }

  drawPursuitLine(model: StarMapViewModel, camera: MapCamera, width: number, height: number): void {
    const targetId = model.navigation.pursuitTargetId;
    if (!targetId) return;
    const target = model.npcShips.find((npc) => npc.id === targetId);
    if (!target) return;

    const from = camera.worldToScreen(model.playerShip.position, width, height);
    const location = model.locations.find((entry) => entry.id === target.locationId);
    const to = projectOrbitalMapShip(
      target.position,
      location,
      camera,
      width,
      height,
      starMapShipWidth(target.nominalLengthMeters, camera.getRelativeZoom()),
      !target.isTravelling && !target.combatMode
    );
    this.context.save();
    this.context.strokeStyle = 'rgba(221, 82, 67, .58)';
    this.context.lineWidth = 1.3;
    this.context.setLineDash([4, 5]);
    this.context.beginPath();
    this.context.moveTo(from.x, from.y);
    this.context.lineTo(to.x, to.y);
    this.context.stroke();
    this.context.restore();
  }

  private image(spriteUrl: string): HTMLImageElement {
    const cached = this.images.get(spriteUrl);
    if (cached) return cached;
    const image = new Image();
    image.onload = this.requestRedraw;
    image.src = spriteUrl;
    this.images.set(spriteUrl, image);
    return image;
  }

  private drawShip(
    model: StarMapViewModel,
    npcId: string,
    image: HTMLImageElement,
    geometry: ShipScreenGeometry,
    starPoint: { readonly x: number; readonly y: number },
    headingRadians: number,
    isTravelling: boolean,
    timeSeconds: number
  ): void {
    const npc = model.npcShips.find((candidate) => candidate.id === npcId);
    if (!npc) return;
    const previous = this.priorHeading.get(npcId);
    const elapsed = previous ? timeSeconds - previous.time : 0;
    const delta = previous
      ? Math.atan2(
          Math.sin(headingRadians - previous.angle),
          Math.cos(headingRadians - previous.angle)
        )
      : 0;
    const turnRate =
      elapsed > 0.001 && elapsed < 0.5 ? Math.max(-1.15, Math.min(1.15, delta / elapsed)) : 0;
    this.priorHeading.set(npcId, { angle: headingRadians, time: timeSeconds });
    const demand = {
      turnRateRadiansPerSecond: turnRate,
      angularThrust: turnRate / 1.15,
      lateralThrust: 0,
      longitudinalThrust: 0,
    };
    const intensity = isTravelling ? 0.82 : 0;
    this.engines.drawExhaust(this.context, npc.hardpoints, geometry, intensity, timeSeconds);
    this.maneuvers.drawExhaust(this.context, npc.hardpoints, geometry, demand, timeSeconds);
    this.context.save();
    this.context.translate(geometry.center.x, geometry.center.y);
    this.context.rotate(headingRadians);
    this.context.globalAlpha = isTravelling ? 0.96 : 0.8;
    if (image.complete && image.naturalWidth > 0) {
      const offset = spriteDrawOffset(npc.hardpoints, geometry);
      this.lighting.draw(this.context, {
        image,
        width: geometry.width,
        height: geometry.height,
        angle: headingRadians,
        light: {
          x: starPoint.x - geometry.center.x,
          y: starPoint.y - geometry.center.y,
        },
        offsetX: offset.x,
        offsetY: offset.y,
        preserveDetail: true,
      });
    } else {
      this.context.fillStyle =
        npc.job === 'pirate' ? '#c78f72' : npc.job === 'patrol' ? '#9fc8e8' : '#b5c4b1';
      this.context.fillRect(
        -geometry.width / 2,
        -geometry.height / 2,
        geometry.width,
        geometry.height
      );
    }
    this.context.restore();
    this.engines.drawGlow(this.context, npc.hardpoints, geometry, intensity, timeSeconds);
    this.maneuvers.drawGlow(this.context, npc.hardpoints, geometry, demand, timeSeconds);
  }

  private drawContactRing(
    model: StarMapViewModel,
    npcId: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const npc = model.npcShips.find((candidate) => candidate.id === npcId);
    // Ordinary NPC pursuits must not cover an entire busy port in orange circles.
    if (!npc || (!npc.isSelected && !npc.isPursuitTarget)) return;

    this.context.save();
    this.context.strokeStyle = npc.isPursuitTarget
      ? 'rgba(233, 102, 83, .95)'
      : npc.combatMode
        ? 'rgba(225, 142, 75, .82)'
        : 'rgba(231, 193, 101, .84)';
    this.context.lineWidth = npc.isPursuitTarget ? 2.2 : 1.5;
    this.context.beginPath();
    this.context.arc(x, y, Math.max(width, height) * 0.72 + 5, 0, Math.PI * 2);
    this.context.stroke();
    this.context.restore();
  }
}
