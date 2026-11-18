import { measurePerformance } from '../../core/performance-diagnostics';
import { resizeMapCanvasBackingStore } from '../map/map-canvas-backing-store';
import type {
  LocalAsteroidView,
  LocalSpaceViewModel,
} from '../../features/local-space/local-space-view-model';
import { drawEmbeddedCombatShipTelemetry } from '../combat/embedded-combat-ship-telemetry';
import { drawFieldPlayerThrusters } from '../combat/embedded-combat-thrusters';
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
import { AsteroidBackdropRenderer } from '../space/asteroid-backdrop-renderer';
import { MiningEffectsRenderer } from './mining-effects-renderer';
import { drawTargetDetailScan, drawWideAreaScan } from '../local-operations/scan-effects';
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
  protected readonly asteroidBackdrop: AsteroidBackdropRenderer;
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
    this.asteroidBackdrop = new AsteroidBackdropRenderer(
      context,
      model.backgroundSeed,
      model.width,
      model.height
    );
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
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    resizeMapCanvasBackingStore(this.canvas, this.context, rect.width, rect.height, ratio);

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
    measurePerformance('canvas.local.draw', () => this.drawFrame());
  }

  private drawFrame(): void {
    const rect = this.canvas.getBoundingClientRect();
    const { width, height } = rect;
    const timeSeconds = performance.now() / 1000;
    const geometry = this.shipGeometry(width, height);

    measurePerformance('canvas.local.background', () =>
      this.backgroundRenderer.draw({
        width,
        height,
        cameraCenter: this.camera.getCenter(),
        cameraZoom: this.camera.getZoom(),
        timeSeconds,
      })
    );
    measurePerformance('canvas.local.backdrop', () =>
      this.asteroidBackdrop.draw({
        width,
        height,
        cameraCenter: this.camera.getCenter(),
        cameraZoom: this.camera.getZoom(),
      })
    );
    this.hitAreas = measurePerformance('canvas.local.asteroids', () => {
      const areas: AsteroidHitArea[] = [];
      for (const asteroid of this.model.asteroids) {
        const hit = this.drawAsteroid(asteroid, width, height);
        if (hit && asteroid.kind === 'resource') areas.push(hit);
      }
      return areas;
    });

    this.npcHitAreas = measurePerformance('canvas.local.npc-ships', () =>
      this.drawNpcShips(width, height, timeSeconds)
    );
    this.drawSecurityDrone(width, height, timeSeconds);
    this.drawCombat(width, height);
    this.drawChunks(width, height);
    this.drawNavigationRoute(width, height);
    drawLocalSpaceExitGate(
      this.context,
      this.camera,
      width,
      height,
      this.model.width,
      this.model.height,
      this.model.backgroundSeed
    );
    this.drawLongRangeScan(width, height, timeSeconds);
    this.drawShortRangeScan(width, height, timeSeconds);
    this.miningEffects.drawTractorFields(this.model, geometry, width, height, timeSeconds, 'below');
    this.miningEffects.drawMining(this.model, geometry, width, height, timeSeconds, 'below');
    measurePerformance('canvas.local.player-ship', () => this.drawShip(geometry, timeSeconds));
    this.miningEffects.drawMining(this.model, geometry, width, height, timeSeconds, 'above');
    this.miningEffects.drawTractorFields(this.model, geometry, width, height, timeSeconds, 'above');
    if (this.debugHardpoints) {
      this.hardpointDebug.draw(this.context, this.model.ship.hardpoints, geometry);
    }
  }
  protected drawSecurityDrone(width: number, height: number, timeSeconds: number): void {
    const drone = this.model.securityDrone;
    if (!drone?.operational) return;
    const point = this.camera.worldToScreen(drone.position, width, height);
    const ctx = this.context;
    ctx.save();
    ctx.strokeStyle = 'rgba(80, 185, 225, 0.17)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 10]);
    ctx.beginPath();
    ctx.arc(point.x, point.y, this.camera.scale(drone.scanRadius), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.translate(point.x, point.y);
    ctx.rotate(timeSeconds * 0.3);
    ctx.fillStyle = '#455b66';
    ctx.strokeStyle = '#74c8df';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let corner = 0; corner < 6; corner++) {
      const angle = (corner * Math.PI) / 3;
      const x = Math.cos(angle) * 13;
      const y = Math.sin(angle) * 13;
      if (corner === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#aeeaf9';
    ctx.beginPath();
    ctx.arc(0, 0, 3 + Math.sin(timeSeconds * 3) * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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

    if (asteroid.claimOwnerId) {
      const blink = 0.55 + 0.45 * Math.sin(performance.now() / 360);
      this.context.save();
      this.context.fillStyle =
        asteroid.claimOwnerId === 'player'
          ? 'rgba(118, 225, 168, ' + blink + ')'
          : 'rgba(242, 195, 101, ' + blink + ')';
      this.context.beginPath();
      this.context.arc(point.x + radius + 6, point.y - radius - 6, 3.5, 0, Math.PI * 2);
      this.context.fill();
      this.context.restore();
    }

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
    const drawThrusters = (layer: 'below' | 'above'): void =>
      drawFieldPlayerThrusters(
        this.context,
        source,
        geometry,
        this.model.ship,
        this.model.combat?.attacker ?? null,
        timeSeconds,
        layer,
        this.engineEffects,
        this.maneuverEffects,
        'mining'
      );
    drawThrusters('below');

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

    drawThrusters('above');

    this.shieldImpacts.draw(
      this.context,
      [...this.model.shieldImpacts, ...(this.model.combat?.attacker.shieldImpacts ?? [])],
      source,
      geometry
    );
    if (this.model.combat) {
      drawEmbeddedCombatShipTelemetry(this.context, this.model.combat.attacker, geometry);
    }
  }
  protected drawShortRangeScan(width: number, height: number, timeSeconds: number): void {
    const progress = this.model.shortRangeScanProgress;
    const target = this.model.scanTarget;
    if (progress === null || !target) return;
    drawTargetDetailScan(
      this.context,
      this.camera.worldToScreen(target.position, width, height),
      Math.max(14, this.camera.scale(target.radius) + 9),
      progress,
      timeSeconds
    );
  }

  protected drawLongRangeScan(width: number, height: number, timeSeconds: number): void {
    const progress = this.model.longRangeScanProgress;
    if (progress === null) return;
    drawWideAreaScan(
      this.context,
      this.camera.worldToScreen(this.model.ship.position, width, height),
      progress,
      timeSeconds,
      width,
      height
    );
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
