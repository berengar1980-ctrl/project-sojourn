import type {
  LocalAsteroidView,
  LocalSpaceViewModel,
} from '../../features/local-space/local-space-view-model';
import { longitudinalManeuverDemand } from '../../systems/ships/ship-maneuver-thrusters';
import { MapCamera, type ScreenPoint } from '../map/map-camera';
import { drawLocalSpaceExitGate } from '../map/local-space-exit-gate';
import { ShieldImpactRenderer } from '../ships/shield-impact-renderer';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { ShipHardpointDebugRenderer } from '../ships/ship-hardpoint-debug-renderer';
import { spriteDrawOffset, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { ShipLightingRenderer } from '../ships/ship-lighting-renderer';
import { ShipManeuverEffectsRenderer } from '../ships/ship-maneuver-effects-renderer';
import { ProceduralSpaceBodyRenderer } from '../space/procedural-space-body-renderer';
import { SpaceBackgroundRenderer } from '../space/space-background-renderer';
import {
  type AsteroidHitArea,
  LocalSpaceSceneLayers,
  type NpcHitArea,
} from './local-space-scene-layers';
import { MiningEffectsRenderer } from './mining-effects-renderer';
export class LocalSpaceRenderer extends LocalSpaceSceneLayers {
  protected readonly context: CanvasRenderingContext2D;
  protected readonly camera: MapCamera;
  protected readonly miningEffects: MiningEffectsRenderer;
  protected readonly engineEffects = new ShipEngineEffectsRenderer();
  protected readonly hardpointDebug = new ShipHardpointDebugRenderer();
  protected readonly maneuverEffects = new ShipManeuverEffectsRenderer();
  protected readonly shipLighting = new ShipLightingRenderer();
  protected readonly shieldImpacts = new ShieldImpactRenderer();
  protected readonly backgroundRenderer: SpaceBackgroundRenderer;
  protected readonly spaceBodies: ProceduralSpaceBodyRenderer;
  protected readonly shipImage = new Image();
  protected readonly npcImages = new Map<string, HTMLImageElement>();
  protected model: LocalSpaceViewModel;
  protected combatImpactSerial = -1;
  protected combatImpactAge = 1;
  protected hitAreas: readonly AsteroidHitArea[] = [];
  protected npcHitAreas: readonly NpcHitArea[] = [];
  protected loadedShipUrl = '';
  protected hasFitted = false;
  protected debugHardpoints = false;
  protected scanLabelsVisible = true;
  constructor(
    private readonly canvas: HTMLCanvasElement,
    model: LocalSpaceViewModel
  ) {
    super();
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Local-space canvas context unavailable.');

    this.context = context;
    this.model = model;
    this.camera = new MapCamera(model.width, model.height);
    this.miningEffects = new MiningEffectsRenderer(context, this.camera);
    this.backgroundRenderer = new SpaceBackgroundRenderer(context, model.backgroundSeed);
    this.spaceBodies = new ProceduralSpaceBodyRenderer(context);
    this.resize();
  }
  update(model: LocalSpaceViewModel): void {
    const impact = model.combat?.lastImpact;
    if (impact && impact.serial !== this.combatImpactSerial) {
      this.combatImpactSerial = impact.serial;
      this.combatImpactAge = 0;
    } else {
      this.combatImpactAge = Math.min(1, this.combatImpactAge + 0.07);
    }
    this.model = model;
    this.ensureShipImage(model.ship.spriteUrl);
    for (const npc of model.npcShips) this.ensureNpcImage(npc.spriteUrl);
    this.draw();
  }
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);

    if (!this.hasFitted) {
      this.camera.fit(rect.width, rect.height);
      this.camera.zoomAt(3, { x: rect.width / 2, y: rect.height / 2 }, rect.width, rect.height);
      this.hasFitted = true;
    }

    this.ensureShipImage(this.model.ship.spriteUrl);
    for (const npc of this.model.npcShips) this.ensureNpcImage(npc.spriteUrl);
    this.draw();
  }
  pan(dx: number, dy: number): void {
    this.camera.pan(dx, dy);
    this.draw();
  }
  zoomAt(deltaY: number, x: number, y: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const factor = Math.exp(-deltaY * 0.00135);
    this.camera.zoomAt(factor, { x, y }, rect.width, rect.height);
    this.draw();
  }
  toggleHardpointDebug(): void {
    this.debugHardpoints = !this.debugHardpoints;
    this.draw();
  }
  setScanLabelsVisible(visible: boolean): void {
    this.scanLabelsVisible = visible;
    this.draw();
  }
  worldPointAt(x: number, y: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return this.camera.screenToWorld({ x, y }, rect.width, rect.height);
  }
  pickNpc(x: number, y: number): string | null {
    let best: NpcHitArea | null = null;
    for (const area of this.npcHitAreas) {
      if (Math.hypot(x - area.point.x, y - area.point.y) > area.radius) continue;
      if (!best || area.radius < best.radius) best = area;
    }
    return best?.id ?? null;
  }
  pickAsteroid(x: number, y: number): string | null {
    let best: AsteroidHitArea | null = null;
    for (const area of this.hitAreas) {
      if (Math.hypot(x - area.point.x, y - area.point.y) > area.radius) continue;
      if (!best || area.radius < best.radius) best = area;
    }
    return best?.id ?? null;
  }
  protected ensureShipImage(url: string): void {
    if (this.loadedShipUrl === url) return;
    this.loadedShipUrl = url;
    this.shipImage.onload = () => this.draw();
    this.shipImage.src = url;
  }
  protected draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const timeSeconds = performance.now() / 1000;
    const geometry = this.shipGeometry(width, height);

    this.backgroundRenderer.draw({
      width,
      height,
      cameraCenter: this.camera.getCenter(),
      cameraZoom: this.camera.getZoom(),
      timeSeconds,
    });
    const hitAreas: AsteroidHitArea[] = [];
    for (const asteroid of this.model.asteroids) {
      const hitArea = this.drawAsteroid(asteroid, width, height);
      if (hitArea && asteroid.kind === 'resource') hitAreas.push(hitArea);
    }
    this.hitAreas = hitAreas;

    this.npcHitAreas = this.drawNpcShips(width, height, timeSeconds);
    this.drawCombat(width, height);
    this.drawChunks(width, height);
    this.drawNavigationRoute(width, height);
    drawLocalSpaceExitGate(this.context, this.camera, width, height, this.model.width, this.model.height);
    this.drawLongRangeScan(width, height, timeSeconds);
    this.drawShortRangeScan(width, height, timeSeconds);
    this.miningEffects.drawTractorFields(this.model, geometry, width, height, timeSeconds, 'below');
    this.miningEffects.drawMining(this.model, geometry, width, height, timeSeconds, 'below');
    this.drawShip(geometry, timeSeconds);
    this.miningEffects.drawMining(this.model, geometry, width, height, timeSeconds, 'above');
    this.miningEffects.drawTractorFields(this.model, geometry, width, height, timeSeconds, 'above');
    if (this.debugHardpoints) {
      this.hardpointDebug.draw(this.context, this.model.ship.hardpoints, geometry);
    }
  }
  protected ensureNpcImage(url: string): HTMLImageElement {
    const existing = this.npcImages.get(url);
    if (existing) return existing;
    const image = new Image();
    image.onload = () => this.draw();
    image.src = url;
    this.npcImages.set(url, image);
    return image;
  }
  protected drawAsteroid(
    asteroid: LocalAsteroidView,
    width: number,
    height: number
  ): AsteroidHitArea | null {
    const point = this.camera.worldToScreen(asteroid.position, width, height);
    const minimumRadius = asteroid.kind === 'debris' ? 2 : 10;
    const radius = Math.max(minimumRadius, this.camera.scale(asteroid.radius));
    const cullPadding = radius + 20;
    if (
      point.x < -cullPadding ||
      point.y < -cullPadding ||
      point.x > width + cullPadding ||
      point.y > height + cullPadding
    ) {
      return null;
    }

    this.spaceBodies.drawAsteroid({
      id: asteroid.id,
      x: point.x,
      y: point.y,
      radius,
      rotation: asteroid.rotation,
      kind: asteroid.kind,
      light: { x: -0.72, y: -0.56 },
    });

    if (asteroid.kind === 'resource') {
      this.drawScanMarker(asteroid, point, radius);
      this.drawScanCallout(asteroid, point, radius);
    }

    if (
      asteroid.kind === 'resource' &&
      (asteroid.isSelected || asteroid.isMiningTarget || asteroid.isScanTarget)
    ) {
      this.context.strokeStyle =
        asteroid.isMiningTarget || asteroid.isScanTarget ? '#67d1e8' : '#dfc173';
      this.context.lineWidth = 1.7;
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius + 8, 0, Math.PI * 2);
      this.context.stroke();
    }

    return { id: asteroid.id, point, radius: radius + 10 };
  }
  protected drawScanMarker(asteroid: LocalAsteroidView, point: ScreenPoint, radius: number): void {
    if (asteroid.scanLevel === 'unscanned') return;

    this.context.save();
    this.context.setLineDash(asteroid.scanLevel === 'surveyed' ? [3, 4] : []);
    this.context.lineWidth = asteroid.scanLevel === 'analyzed' ? 1.8 : 1.2;

    if (asteroid.surveyResult === 'empty') {
      this.context.strokeStyle = 'rgba(126, 137, 145, .72)';
    } else if (asteroid.scanLevel === 'analyzed') {
      this.context.strokeStyle = 'rgba(103, 209, 232, .9)';
    } else {
      this.context.strokeStyle = 'rgba(126, 220, 151, .82)';
    }

    this.context.beginPath();
    this.context.arc(point.x, point.y, radius + 4, 0, Math.PI * 2);
    this.context.stroke();
    this.context.restore();
  }
  protected scanCalloutLines(asteroid: LocalAsteroidView): readonly string[] {
    if (asteroid.surveyResult === 'empty') return ['LEER'];
    if (asteroid.scanLevel === 'unscanned') {
      return asteroid.deposits
        .filter((deposit) => deposit.resourceName !== null)
        .map((deposit) => deposit.resourceName!.toUpperCase());
    }
    if (asteroid.scanLevel === 'surveyed') {
      return asteroid.deposits.map((deposit) => deposit.resourceName?.toUpperCase() ?? '???');
    }

    return asteroid.deposits.map((deposit) => {
      const name = deposit.resourceName?.toUpperCase() ?? '???';
      const amount = Math.round(deposit.estimatedAmount ?? 0);
      return name + ' · ~' + amount;
    });
  }
  protected drawScanCallout(asteroid: LocalAsteroidView, point: ScreenPoint, radius: number): void {
    if (!this.scanLabelsVisible) return;
    const lines = this.scanCalloutLines(asteroid);
    if (lines.length === 0) return;

    const startX = point.x + radius * 0.72;
    const startY = point.y - radius * 0.72;
    const bendX = startX + 10;
    const bendY = startY - 10;
    const endX = bendX + 8;

    this.context.save();
    this.context.strokeStyle =
      asteroid.scanLevel === 'analyzed' ? 'rgba(121, 220, 237, .82)' : 'rgba(139, 192, 153, .72)';
    this.context.fillStyle =
      asteroid.scanLevel === 'analyzed' ? 'rgba(179, 235, 244, .92)' : 'rgba(168, 205, 178, .84)';
    this.context.lineWidth = 1;
    this.context.beginPath();
    this.context.moveTo(startX, startY);
    this.context.lineTo(bendX, bendY);
    this.context.lineTo(endX, bendY);
    this.context.stroke();
    this.context.font = '9px ui-monospace, SFMono-Regular, Consolas, monospace';
    this.context.textBaseline = 'middle';
    lines.forEach((line, index) => {
      this.context.fillText(line, endX + 4, bendY + index * 12);
    });
    this.context.restore();
  }
  protected shipGeometry(width: number, height: number): ShipScreenGeometry {
    const center = this.camera.worldToScreen(this.model.ship.position, width, height);
    const shipWidth = this.camera.scale(this.model.ship.nominalLengthMeters);
    const aspectRatio =
      this.shipImage.complete && this.shipImage.naturalHeight > 0
        ? this.shipImage.naturalWidth / this.shipImage.naturalHeight
        : this.model.ship.spriteAspectRatio;

    return {
      center,
      width: shipWidth,
      height: shipWidth / aspectRatio,
      angle: this.model.ship.headingRadians,
    };
  }
  protected drawShip(geometry: ShipScreenGeometry, timeSeconds: number): void {
    const source = this.model.ship.hardpoints;
    const engineIntensity = Math.max(0, Math.min(1, this.model.ship.speed / 240));
    const maneuverDemand = {
      turnRateRadiansPerSecond: this.model.ship.turnRateRadiansPerSecond,
      angularThrust: this.model.ship.angularThrust,
      lateralThrust: this.model.ship.lateralThrust,
      longitudinalThrust: longitudinalManeuverDemand(this.model.ship.speed),
    };

    this.engineEffects.draw(this.context, source, geometry, engineIntensity, timeSeconds, 'below');
    this.maneuverEffects.draw(this.context, source, geometry, maneuverDemand, timeSeconds, 'below');

    this.context.save();
    this.context.translate(geometry.center.x, geometry.center.y);
    this.context.rotate(geometry.angle);

    if (this.shipImage.complete && this.shipImage.naturalWidth > 0) {
      const offset = spriteDrawOffset(source, geometry);
      this.shipLighting.draw(this.context, {
        image: this.shipImage,
        width: geometry.width,
        height: geometry.height,
        angle: geometry.angle,
        light: { x: -0.72, y: -0.56 },
        offsetX: offset.x,
        offsetY: offset.y,
        directionalStrength: 2.05,
      });
    }

    this.context.restore();

    this.engineEffects.draw(this.context, source, geometry, engineIntensity, timeSeconds, 'above');
    this.maneuverEffects.draw(this.context, source, geometry, maneuverDemand, timeSeconds, 'above');

    this.shieldImpacts.draw(
      this.context,
      [...this.model.shieldImpacts, ...(this.model.combat?.attacker.shieldImpacts ?? [])],
      source,
      geometry
    );
  }
  protected drawShortRangeScan(width: number, height: number, timeSeconds: number): void {
    const progress = this.model.shortRangeScanProgress;
    const target = this.model.scanTarget;
    if (progress == null || !target) return;

    const point = this.camera.worldToScreen(target.position, width, height);
    const radius = Math.max(14, this.camera.scale(target.radius) + 9);
    const sweepY = point.y - radius + radius * 2 * progress;
    const pulse = 0.72 + Math.sin(timeSeconds * 18) * 0.2;

    this.context.save();
    this.context.strokeStyle = `rgba(116, 235, 248, ${0.68 + pulse * 0.2})`;
    this.context.lineWidth = 1.4;
    this.context.shadowColor = 'rgba(91, 223, 244, .78)';
    this.context.shadowBlur = 7;

    this.context.beginPath();
    this.context.arc(
      point.x,
      point.y,
      radius + 5,
      timeSeconds * 1.8,
      timeSeconds * 1.8 + Math.PI * 1.35
    );
    this.context.stroke();

    this.context.beginPath();
    this.context.arc(
      point.x,
      point.y,
      radius + 10,
      -timeSeconds * 1.25,
      -timeSeconds * 1.25 + Math.PI * 0.72
    );
    this.context.stroke();

    this.context.beginPath();
    this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    this.context.clip();

    const scannedHeight = Math.max(0, sweepY - (point.y - radius));
    this.context.fillStyle = 'rgba(79, 211, 233, .075)';
    this.context.fillRect(point.x - radius, point.y - radius, radius * 2, scannedHeight);

    this.context.strokeStyle = 'rgba(205, 253, 255, .96)';
    this.context.lineWidth = 1.2;
    this.context.beginPath();
    this.context.moveTo(point.x - radius, sweepY);
    this.context.lineTo(point.x + radius, sweepY);
    this.context.stroke();

    this.context.strokeStyle = 'rgba(93, 224, 244, .26)';
    this.context.lineWidth = 4;
    this.context.beginPath();
    this.context.moveTo(point.x - radius, sweepY - 3);
    this.context.lineTo(point.x + radius, sweepY - 3);
    this.context.stroke();
    this.context.restore();
  }
  protected drawLongRangeScan(width: number, height: number, timeSeconds: number): void {
    const progress = this.model.longRangeScanProgress;
    if (progress == null) return;

    const center = this.camera.worldToScreen(this.model.ship.position, width, height);
    const maximumRadius = Math.max(width, height) * 0.68;
    const radius = Math.max(8, maximumRadius * (0.08 + progress * 0.92));
    const pulse = 0.72 + Math.sin(timeSeconds * 9) * 0.18;

    this.context.save();
    this.context.strokeStyle = `rgba(97, 222, 242, ${0.48 * (1 - progress * 0.42)})`;
    this.context.lineWidth = 1.4;
    this.context.shadowColor = 'rgba(84, 207, 238, .55)';
    this.context.shadowBlur = 5;
    this.context.beginPath();
    this.context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    this.context.stroke();

    this.context.globalAlpha = pulse * 0.45;
    this.context.beginPath();
    this.context.arc(center.x, center.y, radius * 0.72, 0, Math.PI * 2);
    this.context.stroke();
    this.context.restore();
  }
  protected drawNavigationRoute(width: number, height: number): void {
    const route = this.model.navigationRoute;
    const target = this.model.navigationTarget;
    if (!target || route.length === 0) return;

    this.context.save();
    this.context.strokeStyle = 'rgba(104, 213, 239, .7)';
    this.context.lineWidth = 1.25;
    this.context.setLineDash([6, 6]);
    this.context.beginPath();

    route.forEach((point, index) => {
      const screen = this.camera.worldToScreen(point, width, height);
      if (index === 0) this.context.moveTo(screen.x, screen.y);
      else this.context.lineTo(screen.x, screen.y);
    });
    this.context.stroke();
    this.context.setLineDash([]);

    const point = this.camera.worldToScreen(target, width, height);
    const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.12;
    const radius = 8 * pulse;
    this.context.strokeStyle = 'rgba(119, 226, 248, .9)';
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    this.context.stroke();
    this.context.beginPath();
    this.context.moveTo(point.x - radius - 5, point.y);
    this.context.lineTo(point.x + radius + 5, point.y);
    this.context.moveTo(point.x, point.y - radius - 5);
    this.context.lineTo(point.x, point.y + radius + 5);
    this.context.stroke();
    this.context.restore();
  }
}
