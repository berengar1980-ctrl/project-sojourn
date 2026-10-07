import type {
  LocalAsteroidView,
  LocalSpaceViewModel,
} from '../../features/local-space/local-space-view-model';
import { MapCamera, type ScreenPoint } from '../map/map-camera';
import {
  projectHardpoint,
  spriteDrawOffset,
  type ShipScreenGeometry,
} from '../ships/ship-hardpoint-projector';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { ShipHardpointDebugRenderer } from '../ships/ship-hardpoint-debug-renderer';
import { ShipManeuverEffectsRenderer } from '../ships/ship-maneuver-effects-renderer';
import { ShipLightingRenderer } from '../ships/ship-lighting-renderer';
import { ShieldImpactRenderer } from '../ships/shield-impact-renderer';
import { SpaceBackgroundRenderer } from '../space/space-background-renderer';
import { ProceduralSpaceBodyRenderer } from '../space/procedural-space-body-renderer';
import { longitudinalManeuverDemand } from '../../systems/ships/ship-maneuver-thrusters';
import { MiningEffectsRenderer } from './mining-effects-renderer';

interface AsteroidHitArea {
  readonly id: string;
  readonly point: ScreenPoint;
  readonly radius: number;
}

interface NpcHitArea {
  readonly id: string;
  readonly point: ScreenPoint;
  readonly radius: number;
}

function hashId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class LocalSpaceRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly camera: MapCamera;
  private readonly miningEffects: MiningEffectsRenderer;
  private readonly engineEffects = new ShipEngineEffectsRenderer();
  private readonly hardpointDebug = new ShipHardpointDebugRenderer();
  private readonly maneuverEffects = new ShipManeuverEffectsRenderer();
  private readonly shipLighting = new ShipLightingRenderer();
  private readonly shieldImpacts = new ShieldImpactRenderer();
  private readonly backgroundRenderer: SpaceBackgroundRenderer;
  private readonly spaceBodies: ProceduralSpaceBodyRenderer;
  private readonly shipImage = new Image();
  private readonly npcImages = new Map<string, HTMLImageElement>();
  private model: LocalSpaceViewModel;
  private combatImpactSerial = -1;
  private combatImpactAge = 1;
  private hitAreas: readonly AsteroidHitArea[] = [];
  private npcHitAreas: readonly NpcHitArea[] = [];
  private loadedShipUrl = '';
  private hasFitted = false;
  private debugHardpoints = false;
  private scanLabelsVisible = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    model: LocalSpaceViewModel
  ) {
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

  private ensureShipImage(url: string): void {
    if (this.loadedShipUrl === url) return;
    this.loadedShipUrl = url;
    this.shipImage.onload = () => this.draw();
    this.shipImage.src = url;
  }

  private draw(): void {
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
    this.drawLongRangeScan(width, height, timeSeconds);
    this.drawShortRangeScan(width, height, timeSeconds);
    this.miningEffects.drawTractorFields(
      this.model,
      geometry,
      width,
      height,
      timeSeconds,
      'below'
    );
    this.miningEffects.drawMining(this.model, geometry, width, height, timeSeconds, 'below');
    this.drawShip(geometry, timeSeconds);
    this.miningEffects.drawMining(this.model, geometry, width, height, timeSeconds, 'above');
    this.miningEffects.drawTractorFields(
      this.model,
      geometry,
      width,
      height,
      timeSeconds,
      'above'
    );
    if (this.debugHardpoints) {
      this.hardpointDebug.draw(this.context, this.model.ship.hardpoints, geometry);
    }
  }

  private ensureNpcImage(url: string): HTMLImageElement {
    const existing = this.npcImages.get(url);
    if (existing) return existing;
    const image = new Image();
    image.onload = () => this.draw();
    image.src = url;
    this.npcImages.set(url, image);
    return image;
  }

  private drawNpcShips(width: number, height: number, timeSeconds: number): NpcHitArea[] {
    const hits: NpcHitArea[] = [];
    for (const npc of this.model.npcShips) {
      const point = this.camera.worldToScreen(npc.position, width, height);
      const shipWidth = this.camera.scale(npc.nominalLengthMeters);
      const geometry: ShipScreenGeometry = {
        center: point,
        width: shipWidth,
        height: shipWidth / npc.spriteAspectRatio,
        angle: npc.headingRadians,
      };
      const image = this.ensureNpcImage(npc.spriteUrl);
      const engineIntensity = npc.speed > 1 ? Math.max(0.35, Math.min(1, npc.speed / 110)) : 0;

      if (engineIntensity > 0) {
        this.engineEffects.draw(
          this.context,
          npc.hardpoints,
          geometry,
          engineIntensity,
          timeSeconds,
          'below'
        );
      }

      this.context.save();
      this.context.translate(point.x, point.y);
      this.context.rotate(npc.headingRadians);
      if (image.complete && image.naturalWidth > 0) {
        const offset = spriteDrawOffset(npc.hardpoints, geometry);
        this.shipLighting.draw(this.context, {
          image,
          width: geometry.width,
          height: geometry.height,
          angle: npc.headingRadians,
          light: { x: -0.72, y: -0.56 },
          offsetX: offset.x,
          offsetY: offset.y,
          directionalStrength: 2.05,
        });
      } else {
        this.context.fillStyle = '#8597a1';
        this.context.fillRect(-shipWidth / 2, -geometry.height / 2, shipWidth, geometry.height);
      }
      this.context.restore();

      if (engineIntensity > 0) {
        this.engineEffects.draw(
          this.context,
          npc.hardpoints,
          geometry,
          engineIntensity,
          timeSeconds,
          'above'
        );
      }
      const combatDefender =
        this.model.combat?.defender.id === npc.id ? this.model.combat.defender : null;
      if (combatDefender) {
        this.shieldImpacts.draw(
          this.context,
          combatDefender.shieldImpacts,
          npc.hardpoints,
          geometry
        );
      }

      hits.push({
        id: npc.id,
        point,
        radius: Math.max(18, Math.max(geometry.width, geometry.height) * 0.6),
      });
      if (npc.isSelected) {
        this.context.save();
        this.context.strokeStyle = 'rgba(235, 91, 76, .95)';
        this.context.lineWidth = 2;
        this.context.beginPath();
        this.context.arc(point.x, point.y, Math.max(geometry.width, geometry.height) * 0.65 + 7, 0, Math.PI * 2);
        this.context.stroke();
        this.context.restore();
      }

      if (npc.targetAsteroidId) {
        const target = this.model.asteroids.find((asteroid) => asteroid.id === npc.targetAsteroidId);
        if (target && npc.phase === 'scanning') {
          this.drawNpcMinerScan(
            point,
            target.position,
            width,
            height,
            npc.scanProgress ?? 0,
            timeSeconds
          );
        } else if (target && npc.laserActive) {
          this.drawNpcMiningBeam(point, target.position, width, height, timeSeconds);
        }
      }

      const zoom = this.camera.getRelativeZoom();
      if (zoom >= 1.55) {
        this.context.fillStyle = 'rgba(184, 210, 216, .78)';
        this.context.font = '9px ui-monospace, monospace';
        this.context.textAlign = 'center';
        this.context.fillText(npc.name, point.x, point.y + geometry.height / 2 + 12);
      }
    }
    return hits;
  }

  private drawCombat(width: number, height: number): void {
    const combat = this.model.combat;
    if (!combat) return;

    for (const mine of combat.mines) {
      if (mine.detection === 'hidden') continue;
      const point = this.camera.worldToScreen(mine.position, width, height);
      this.context.save();
      this.context.strokeStyle = mine.armed
        ? 'rgba(226, 108, 82, .82)'
        : 'rgba(166, 175, 177, .55)';
      this.context.fillStyle = 'rgba(42, 47, 50, .92)';
      this.context.beginPath();
      this.context.arc(point.x, point.y, 6, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
      this.context.restore();
    }

    for (const beam of combat.beams) {
      const source =
        beam.owner === 'attacker'
          ? {
              hardpoints: this.model.ship.hardpoints,
              geometry: this.shipGeometry(width, height),
            }
          : (() => {
              const npc = this.model.npcShips.find((entry) => entry.id === combat.defender.id);
              if (!npc) return null;
              const center = this.camera.worldToScreen(npc.position, width, height);
              const shipWidth = this.camera.scale(npc.nominalLengthMeters);
              return {
                hardpoints: npc.hardpoints,
                geometry: {
                  center,
                  width: shipWidth,
                  height: shipWidth / npc.spriteAspectRatio,
                  angle: npc.headingRadians,
                } satisfies ShipScreenGeometry,
              };
            })();
      if (!source) continue;
      const weaponHardpoints = source.hardpoints.weaponLasers ?? [];
      const hardpoint =
        weaponHardpoints.length > 0
          ? weaponHardpoints[beam.weaponIndex % weaponHardpoints.length]
          : null;
      const from = hardpoint
        ? projectHardpoint(hardpoint, source.hardpoints, source.geometry)
        : source.geometry.center;
      const to = this.camera.worldToScreen(beam.end, width, height);
      const alpha = Math.max(0, Math.min(1, beam.ttlSeconds / Math.max(0.001, beam.maxTtlSeconds)));
      this.context.save();
      this.context.lineCap = 'round';
      if (beam.kind === 'laser') {
        this.context.shadowColor = 'rgba(67, 185, 255, .95)';
        this.context.shadowBlur = 10;
        this.context.strokeStyle = `rgba(108, 214, 255, ${0.45 + alpha * 0.5})`;
        this.context.lineWidth = 4.5;
        this.context.beginPath();
        this.context.moveTo(from.x, from.y);
        this.context.lineTo(to.x, to.y);
        this.context.stroke();
        this.context.shadowBlur = 3;
        this.context.strokeStyle = `rgba(232, 251, 255, ${0.75 + alpha * 0.25})`;
        this.context.lineWidth = 1.15;
        this.context.beginPath();
        this.context.moveTo(from.x, from.y);
        this.context.lineTo(to.x, to.y);
        this.context.stroke();
      } else {
        this.context.strokeStyle = `rgba(250, 229, 190, ${0.55 + alpha * 0.4})`;
        this.context.lineWidth = 1.3;
        this.context.setLineDash([18, 5]);
        this.context.beginPath();
        this.context.moveTo(from.x, from.y);
        this.context.lineTo(to.x, to.y);
        this.context.stroke();
      }
      this.context.restore();
    }

    for (const projectile of combat.projectiles) {
      const point = this.camera.worldToScreen(projectile.position, width, height);
      const target = this.camera.worldToScreen(projectile.target, width, height);
      const angle = Math.atan2(target.y - point.y, target.x - point.x);
      this.context.save();
      this.context.translate(point.x, point.y);
      this.context.rotate(angle);
      if (projectile.kind === 'missile') {
        this.context.fillStyle = '#e7d7b0';
        this.context.fillRect(-7, -2, 12, 4);
        this.context.strokeStyle = 'rgba(230, 133, 73, .72)';
        this.context.lineWidth = 3;
        this.context.beginPath();
        this.context.moveTo(-8, 0);
        this.context.lineTo(-22, 0);
        this.context.stroke();
      } else if (projectile.kind === 'plasma') {
        this.context.fillStyle = 'rgba(118, 225, 255, .95)';
        this.context.shadowColor = 'rgba(81, 194, 255, .95)';
        this.context.shadowBlur = 10;
        this.context.beginPath();
        this.context.arc(0, 0, 5, 0, Math.PI * 2);
        this.context.fill();
      } else {
        this.context.fillStyle = 'rgba(245, 211, 156, .95)';
        this.context.fillRect(-2, -1, 5, 2);
      }
      this.context.restore();
    }

    const impact = combat.lastImpact;
    if (
      !impact ||
      (impact.layer !== 'hull' && impact.layer !== 'obstacle') ||
      this.combatImpactAge >= 1
    ) {
      return;
    }
    const point = this.camera.worldToScreen(impact.position, width, height);
    const alpha = 1 - this.combatImpactAge;
    const radius = 10 + this.combatImpactAge * 34;
    this.context.save();
    this.context.fillStyle =
      impact.layer === 'obstacle'
        ? `rgba(196, 185, 160, ${alpha * 0.6})`
        : `rgba(255, 139, 68, ${alpha * 0.8})`;
    this.context.beginPath();
    this.context.arc(point.x, point.y, Math.max(5, radius * 0.45), 0, Math.PI * 2);
    this.context.fill();
    this.context.restore();
  }


  private drawNpcMinerScan(
    shipPoint: ScreenPoint,
    targetWorld: { readonly x: number; readonly y: number },
    width: number,
    height: number,
    progress: number,
    timeSeconds: number
  ): void {
    const target = this.camera.worldToScreen(targetWorld, width, height);
    const radius = 10 + progress * 28;
    this.context.save();
    this.context.strokeStyle = `rgba(116, 235, 248, ${0.52 + Math.sin(timeSeconds * 10) * 0.16})`;
    this.context.lineWidth = 1.2;
    this.context.beginPath();
    this.context.arc(target.x, target.y, radius, 0, Math.PI * 2);
    this.context.stroke();
    this.context.setLineDash([4, 5]);
    this.context.beginPath();
    this.context.moveTo(shipPoint.x, shipPoint.y);
    this.context.lineTo(target.x, target.y);
    this.context.stroke();
    this.context.restore();
  }

  private drawNpcMiningBeam(
    shipPoint: ScreenPoint,
    targetWorld: { readonly x: number; readonly y: number },
    width: number,
    height: number,
    timeSeconds: number
  ): void {
    const target = this.camera.worldToScreen(targetWorld, width, height);
    const pulse = 0.68 + Math.sin(timeSeconds * 13) * 0.18;
    this.context.save();
    this.context.strokeStyle = `rgba(121, 214, 235, ${pulse})`;
    this.context.lineWidth = 1.4;
    this.context.shadowColor = 'rgba(86, 205, 235, .7)';
    this.context.shadowBlur = 7;
    this.context.beginPath();
    this.context.moveTo(shipPoint.x, shipPoint.y);
    this.context.lineTo(target.x, target.y);
    this.context.stroke();

    this.context.strokeStyle = `rgba(160, 228, 241, ${pulse * 0.35})`;
    this.context.lineWidth = 8;
    this.context.beginPath();
    this.context.moveTo(shipPoint.x, shipPoint.y);
    this.context.lineTo(target.x, target.y);
    this.context.stroke();
    this.context.restore();
  }

  private drawAsteroid(
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

  private drawScanMarker(asteroid: LocalAsteroidView, point: ScreenPoint, radius: number): void {
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

  private scanCalloutLines(asteroid: LocalAsteroidView): readonly string[] {
    if (asteroid.scanLevel === 'unscanned') return [];
    if (asteroid.surveyResult === 'empty') return ['LEER'];
    if (asteroid.scanLevel === 'surveyed') {
      return asteroid.deposits.map(() => '???');
    }

    return asteroid.deposits.map((deposit) => {
      const name = deposit.resourceName?.toUpperCase() ?? '???';
      const amount = Math.round(deposit.estimatedAmount ?? 0);
      return name + ' · ~' + amount;
    });
  }

  private drawScanCallout(asteroid: LocalAsteroidView, point: ScreenPoint, radius: number): void {
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

  private shipGeometry(width: number, height: number): ShipScreenGeometry {
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

  private drawShip(geometry: ShipScreenGeometry, timeSeconds: number): void {
    const source = this.model.ship.hardpoints;
    const engineIntensity = Math.max(0, Math.min(1, this.model.ship.speed / 240));
    const maneuverDemand = {
      turnRateRadiansPerSecond: this.model.ship.turnRateRadiansPerSecond,
      angularThrust: this.model.ship.angularThrust,
      lateralThrust: this.model.ship.lateralThrust,
      longitudinalThrust: longitudinalManeuverDemand(this.model.ship.speed),
    };

    this.engineEffects.draw(
      this.context,
      source,
      geometry,
      engineIntensity,
      timeSeconds,
      'below'
    );
    this.maneuverEffects.draw(
      this.context,
      source,
      geometry,
      maneuverDemand,
      timeSeconds,
      'below'
    );

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

    this.engineEffects.draw(
      this.context,
      source,
      geometry,
      engineIntensity,
      timeSeconds,
      'above'
    );
    this.maneuverEffects.draw(
      this.context,
      source,
      geometry,
      maneuverDemand,
      timeSeconds,
      'above'
    );

    this.shieldImpacts.draw(
      this.context,
      [
        ...this.model.shieldImpacts,
        ...(this.model.combat?.attacker.shieldImpacts ?? []),
      ],
      source,
      geometry
    );
  }

  private drawShortRangeScan(width: number, height: number, timeSeconds: number): void {
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

  private drawLongRangeScan(width: number, height: number, timeSeconds: number): void {
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

  private drawNavigationRoute(width: number, height: number): void {
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

  private drawChunks(width: number, height: number): void {
    for (const chunk of this.model.chunks) {
      const point = this.camera.worldToScreen(chunk.position, width, height);
      if (point.x < -8 || point.y < -8 || point.x > width + 8 || point.y > height + 8) continue;
      const variation = (hashId(chunk.id) % 100) / 100;
      const radius = 1.5 + variation * 2.2;
      this.context.fillStyle = '#a88f73';
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      this.context.fill();
    }
  }
}
