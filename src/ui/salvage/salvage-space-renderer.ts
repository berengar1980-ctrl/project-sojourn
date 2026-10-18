import { pickNearestHitArea } from './salvage-hit-test';
import { drawPlayerSalvageWorkEffect } from './salvage-work-effect-renderer';
import { drawSalvageContainer3d } from './salvage-container-mesh';
import { drawSalvageDebris3d } from './salvage-debris-mesh';
import { drawSalvageSection3d } from './salvage-section-mesh';
import { DistressDamageParticles } from './distress-damage-particles';
import { drawDistressRammingShield } from './distress-ramming-shield-effect';
import type {
  SalvageSpaceViewModel,
  SalvageWreckView,
} from '../../features/salvage/salvage-space-view-model';
import { drawDistressScanEffect, drawDistressShipSprite } from './salvage-distress-scan-effect';
import { drawDistressTow } from './distress-tow-renderer';
import { drawTargetDetailScan, drawWideAreaScan } from '../local-operations/scan-effects';
import { longitudinalManeuverDemand } from '../../systems/ships/ship-maneuver-thrusters';
import { MapCamera, type ScreenPoint } from '../map/map-camera';
import { ShieldImpactRenderer } from '../ships/shield-impact-renderer';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { spriteDrawOffset, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { ShipLightingRenderer } from '../ships/ship-lighting-renderer';
import { ShipManeuverEffectsRenderer } from '../ships/ship-maneuver-effects-renderer';
import { SpaceBackgroundRenderer } from '../space/space-background-renderer';
import { type NpcHitArea, SalvageSceneLayers, type WreckHitArea } from './salvage-scene-layers';
export class SalvageSpaceRenderer extends SalvageSceneLayers {
  protected readonly context: CanvasRenderingContext2D;
  protected readonly camera: MapCamera;
  protected readonly background: SpaceBackgroundRenderer;
  protected readonly engineEffects = new ShipEngineEffectsRenderer();
  protected readonly maneuverEffects = new ShipManeuverEffectsRenderer();
  protected readonly shipLighting = new ShipLightingRenderer();
  protected readonly shieldImpacts = new ShieldImpactRenderer();
  protected readonly shipImage = new Image();
  protected readonly distressParticles = new DistressDamageParticles();
  protected readonly npcImages = new Map<string, HTMLImageElement>();
  protected model: SalvageSpaceViewModel;
  protected combatImpactSerial = -1;
  protected combatImpactAge = 1;
  protected hitAreas: readonly WreckHitArea[] = [];
  protected npcHitAreas: readonly NpcHitArea[] = [];
  protected loadedShipUrl = '';
  protected hasFitted = false;
  protected diagnosisStartedAt = -1;
  private scanLabelsVisible = true;
  setScanLabelsVisible(visible: boolean): void {
    this.scanLabelsVisible = visible;
    this.draw();
  }
  private lastFrameAt = -Infinity;
  startDistressDiagnosis(): void {
    this.diagnosisStartedAt = performance.now() / 1000;
    this.draw();
  }
  constructor(
    private readonly canvas: HTMLCanvasElement,
    model: SalvageSpaceViewModel
  ) {
    super();
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Salvage-space canvas context unavailable.');
    this.context = context;
    this.model = model;
    this.camera = new MapCamera(model.width, model.height);
    this.background = new SpaceBackgroundRenderer(context, model.backgroundSeed);
    this.resize();
  }
  update(model: SalvageSpaceViewModel): void {
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
    const now = performance.now();
    if (now - this.lastFrameAt >= 33) {
      this.lastFrameAt = now;
      this.draw();
    }
  }
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.max(1, Math.min(1.5, window.devicePixelRatio || 1));
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!this.hasFitted) {
      this.camera.fit(rect.width, rect.height);
      this.camera.zoomAt(3, { x: rect.width / 2, y: rect.height / 2 }, rect.width, rect.height);
      // The sensor pulse is centered on the ship, not the world midpoint.
      // Center the initial camera there so newly scanned contacts are visible.
      const shipPoint = this.camera.worldToScreen(
        this.model.ship.position,
        rect.width,
        rect.height
      );
      this.camera.pan(rect.width / 2 - shipPoint.x, rect.height / 2 - shipPoint.y);
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
    this.camera.zoomAt(Math.exp(-deltaY * 0.00135), { x, y }, rect.width, rect.height);
    this.draw();
  }
  worldPointAt(x: number, y: number): ScreenPoint {
    const rect = this.canvas.getBoundingClientRect();
    return this.camera.screenToWorld({ x, y }, rect.width, rect.height);
  }
  pickNpc(x: number, y: number): string | null {
    return pickNearestHitArea(this.npcHitAreas, x, y);
  }
  pickWreck(x: number, y: number): string | null {
    return pickNearestHitArea(this.hitAreas, x, y);
  }
  protected ensureShipImage(url: string): void {
    if (url === this.loadedShipUrl) return;
    this.loadedShipUrl = url;
    this.shipImage.onload = () => this.draw();
    this.shipImage.src = url;
  }
  protected draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const timeSeconds = performance.now() / 1000;
    this.background.draw({
      width,
      height,
      cameraCenter: this.camera.getCenter(),
      cameraZoom: this.camera.getZoom(),
      timeSeconds,
    });
    for (const section of this.model.sections) {
      const point = this.camera.worldToScreen(section.position, width, height);
      const radius = this.camera.scale(section.radius);
      const padding = Math.max(25, radius * 1.55);
      if (
        point.x < -padding ||
        point.y < -padding ||
        point.x > width + padding ||
        point.y > height + padding
      )
        continue;
      this.context.save();
      this.context.translate(point.x, point.y);
      drawSalvageSection3d(this.context, section, radius, timeSeconds);
      this.context.restore();
    }
    const thrownScrap = new Set(
      (this.model.combat?.thrownAsteroids ?? []).map((rock) => rock.asteroidId)
    );
    for (const part of this.model.debris) {
      if (thrownScrap.has(part.id)) continue;
      const point = this.camera.worldToScreen(part.position, width, height);
      const radius = this.camera.scale(part.radius);
      const padding = Math.max(20, radius * 1.5);
      if (
        point.x < -padding ||
        point.y < -padding ||
        point.x > width + padding ||
        point.y > height + padding
      ) {
        continue;
      }
      this.context.save();
      this.context.translate(point.x, point.y);
      drawSalvageDebris3d(this.context, part, radius, timeSeconds);
      this.context.restore();
    }
    const hitAreas: WreckHitArea[] = [];
    for (const wreck of this.model.wrecks) {
      if (this.model.distressTow && wreck.id.startsWith('event-wreck-')) continue;
      const hit = this.drawWreck(wreck, width, height);
      if (hit) hitAreas.push(hit);
    }
    this.hitAreas = hitAreas;
    this.npcHitAreas = this.drawNpcShips(width, height, timeSeconds);
    this.drawCombat(width, height);
    this.distressParticles.drawScene(
      timeSeconds,
      this.model,
      this.camera,
      this.context,
      width,
      height
    );
    this.drawRoute(width, height);
    this.drawExitGate(width, height);
    this.drawLongRangeSalvageScan(width, height, timeSeconds);
    this.drawPlayerScanCone(width, height, timeSeconds);
    this.drawPlayerSalvageEffect(width, height, timeSeconds);
    drawDistressScanEffect(
      this.context,
      this.camera,
      this.model,
      timeSeconds - this.diagnosisStartedAt,
      width,
      height
    );
    const geometry = this.shipGeometry(width, height);
    drawDistressTow(this.context, this.camera, this.model, width, height, geometry, (url) =>
      this.ensureNpcImage(url)
    );
    this.drawShip(geometry, timeSeconds);
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
  protected drawWreck(wreck: SalvageWreckView, width: number, height: number): WreckHitArea | null {
    const point = this.camera.worldToScreen(wreck.position, width, height);
    const radius = this.camera.scale(wreck.radius);
    const hitRadius = Math.max(19, radius + 10);
    const padding = hitRadius + 30;
    if (
      point.x < -padding ||
      point.y < -padding ||
      point.x > width + padding ||
      point.y > height + padding
    ) {
      return null;
    }
    this.context.save();
    this.context.translate(point.x, point.y);
    this.context.globalAlpha = wreck.depleted ? 0.38 : 0.95;
    if (wreck.id.startsWith('event-wreck-salvage-distress-')) {
      this.context.rotate(wreck.rotation);
      const drewShip = drawDistressShipSprite(
        this.context,
        this.model.sectorEvent,
        wreck.id,
        this.camera.scale(1),
        (url) => this.ensureNpcImage(url)
      );
      if (!drewShip) {
        // Ship silhouette while the existing distress-rescue sprite is loading.
        this.context.fillStyle = '#6f858a';
        this.context.fillRect(-radius * 0.8, -radius * 0.24, radius * 1.6, radius * 0.48);
      }
    } else if (wreck.sectionVariant) {
      drawSalvageSection3d(
        this.context,
        {
          variant: wreck.sectionVariant,
          rotation3d: wreck.rotation3d ?? { x: 0, y: 0, z: wreck.rotation },
          effectSeed: wreck.effectSeed ?? 0,
        },
        radius,
        performance.now() / 1000
      );
    } else if (wreck.debrisVariant) {
      drawSalvageDebris3d(
        this.context,
        {
          variant: wreck.debrisVariant,
          rotation3d: wreck.rotation3d ?? { x: 0, y: 0, z: wreck.rotation },
          effectSeed: wreck.effectSeed ?? 0,
        },
        radius,
        performance.now() / 1000
      );
    } else {
      drawSalvageContainer3d(
        this.context,
        wreck.containerVariant ?? 'standard',
        radius,
        wreck.rotation3d ?? { x: 0, y: 0, z: wreck.rotation }
      );
    }
    this.context.restore();
    this.drawWreckScanCallout(wreck, point, radius);
    this.drawWreckSelection(wreck, point, radius);
    return { id: wreck.id, point, radius: hitRadius };
  }
  private drawWreckSelection(
    wreck: SalvageWreckView,
    point: { x: number; y: number },
    radius: number
  ): void {
    if (
      (wreck.isSelected || wreck.isWorkTarget) &&
      !wreck.id.startsWith('event-wreck-salvage-distress-')
    ) {
      this.context.save();
      this.context.strokeStyle = wreck.isWorkTarget
        ? 'rgba(232, 184, 96, 0.95)'
        : 'rgba(130, 206, 224, 0.86)';
      this.context.lineWidth = 1.5;
      this.context.setLineDash(wreck.inspected ? [] : [5, 4]);
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius + 10, 0, Math.PI * 2);
      this.context.stroke();
      this.context.restore();
    }
  }

  private drawWreckScanCallout(
    wreck: SalvageWreckView,
    point: { x: number; y: number },
    radius: number
  ): void {
    if (!this.scanLabelsVisible) return;
    // Same map callouts as asteroid scan: ? from range scan, contents after detail scan.
    if (wreck.scanLevel === 'surveyed' || wreck.scanLevel === 'analyzed') {
      const lines =
        wreck.scanLevel === 'analyzed'
          ? wreck.resources.length > 0
            ? wreck.resources.map(
                (resource) =>
                  resource.name.toUpperCase() + ' · ' + Math.round(resource.remaining) + ' t'
              )
            : ['LEER']
          : ['???'];
      const x = point.x + radius * 0.72;
      const y = point.y - radius * 0.72;
      this.context.save();
      this.context.strokeStyle = wreck.inspected
        ? 'rgba(121,220,237,.82)'
        : 'rgba(139,192,153,.72)';
      this.context.fillStyle = wreck.inspected ? 'rgba(179,235,244,.92)' : 'rgba(168,205,178,.84)';
      this.context.lineWidth = 1;
      this.context.beginPath();
      this.context.moveTo(x, y);
      this.context.lineTo(x + 10, y - 10);
      this.context.lineTo(x + 18, y - 10);
      this.context.stroke();
      this.context.font = '9px ui-monospace, monospace';
      lines.forEach((line, index) => this.context.fillText(line, x + 22, y - 10 + index * 12));
      this.context.restore();
    }
  }

  protected drawLongRangeSalvageScan(width: number, height: number, timeSeconds: number): void {
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

  protected drawPlayerScanCone(width: number, height: number, timeSeconds: number): void {
    if (this.model.phase !== 'inspecting') return;
    const wreck = this.model.wrecks.find((entry) => entry.isWorkTarget);
    if (!wreck) return;
    drawTargetDetailScan(
      this.context,
      this.camera.worldToScreen(wreck.position, width, height),
      Math.max(14, this.camera.scale(wreck.radius) + 9),
      Math.max(0, Math.min(1, this.model.operationProgress ?? 0)),
      timeSeconds
    );
  }
  protected drawPlayerSalvageEffect(width: number, height: number, timeSeconds: number): void {
    if (this.model.phase !== 'stripping' && this.model.phase !== 'extracting-component') return;
    drawPlayerSalvageWorkEffect(
      this.context,
      this.camera,
      this.model,
      this.shipGeometry(width, height),
      width,
      height,
      timeSeconds
    );
  }
  protected drawRoute(width: number, height: number): void {
    if (!this.model.navigationTarget || this.model.navigationRoute.length < 2) return;
    this.context.save();
    this.context.strokeStyle = 'rgba(224, 177, 88, 0.68)';
    this.context.lineWidth = 1.25;
    this.context.setLineDash([6, 6]);
    this.context.beginPath();
    this.model.navigationRoute.forEach((entry, index) => {
      const point = this.camera.worldToScreen(entry, width, height);
      if (index === 0) this.context.moveTo(point.x, point.y);
      else this.context.lineTo(point.x, point.y);
    });
    this.context.stroke();
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
    const engineIntensity = Math.max(0, Math.min(1, this.model.ship.speed / 100));
    const maneuverDemand = {
      turnRateRadiansPerSecond: this.model.ship.turnRateRadiansPerSecond,
      angularThrust: this.model.ship.angularThrust,
      lateralThrust: this.model.ship.lateralThrust,
      longitudinalThrust: longitudinalManeuverDemand(this.model.ship.speed),
    };
    this.engineEffects.drawExhaust(this.context, source, geometry, engineIntensity, timeSeconds);
    this.maneuverEffects.drawExhaust(this.context, source, geometry, maneuverDemand, timeSeconds);
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
    this.engineEffects.drawGlow(this.context, source, geometry, engineIntensity, timeSeconds);
    this.maneuverEffects.drawGlow(this.context, source, geometry, maneuverDemand, timeSeconds);
    this.shieldImpacts.draw(
      this.context,
      [...this.model.shieldImpacts, ...(this.model.combat?.attacker.shieldImpacts ?? [])],
      source,
      geometry
    );
    drawDistressRammingShield(
      this.context,
      this.camera,
      this.model,
      this.canvas.clientWidth,
      this.canvas.clientHeight
    );
  }
}
