import type {
  SalvageSpaceViewModel,
  SalvageWreckView,
} from '../../features/salvage/salvage-space-view-model';
import { drawDistressScanEffect, drawDistressShipSprite } from './salvage-distress-scan-effect';
import { drawDistressTow } from './distress-tow-renderer';
import { longitudinalManeuverDemand } from '../../systems/ships/ship-maneuver-thrusters';
import { MapCamera, type ScreenPoint } from '../map/map-camera';
import { drawLocalSpaceExitGate } from '../map/local-space-exit-gate';
import { ShieldImpactRenderer } from '../ships/shield-impact-renderer';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import {
  projectHardpoint,
  spriteDrawOffset,
  type ShipScreenGeometry,
} from '../ships/ship-hardpoint-projector';
import { ShipLightingRenderer } from '../ships/ship-lighting-renderer';
import { ShipManeuverEffectsRenderer } from '../ships/ship-maneuver-effects-renderer';
import { SpaceBackgroundRenderer } from '../space/space-background-renderer';
import {
  type NpcHitArea,
  SalvageSceneLayers,
  type WreckHitArea,
  fractional,
  hashId,
} from './salvage-scene-layers';
export class SalvageSpaceRenderer extends SalvageSceneLayers {
  protected readonly context: CanvasRenderingContext2D;
  protected readonly camera: MapCamera;
  protected readonly background: SpaceBackgroundRenderer;
  protected readonly engineEffects = new ShipEngineEffectsRenderer();
  protected readonly maneuverEffects = new ShipManeuverEffectsRenderer();
  protected readonly shipLighting = new ShipLightingRenderer();
  protected readonly shieldImpacts = new ShieldImpactRenderer();
  protected readonly shipImage = new Image();
  protected readonly npcImages = new Map<string, HTMLImageElement>();
  protected model: SalvageSpaceViewModel;
  protected combatImpactSerial = -1;
  protected combatImpactAge = 1;
  protected hitAreas: readonly WreckHitArea[] = [];
  protected npcHitAreas: readonly NpcHitArea[] = [];
  protected loadedShipUrl = '';
  protected hasFitted = false;
  protected diagnosisStartedAt = -1;
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
    this.camera.zoomAt(Math.exp(-deltaY * 0.00135), { x, y }, rect.width, rect.height);
    this.draw();
  }
  worldPointAt(x: number, y: number): ScreenPoint {
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
  pickWreck(x: number, y: number): string | null {
    let best: WreckHitArea | null = null;
    for (const area of this.hitAreas) {
      if (Math.hypot(x - area.point.x, y - area.point.y) > area.radius) continue;
      if (!best || area.radius < best.radius) best = area;
    }
    return best?.id ?? null;
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
    const hitAreas: WreckHitArea[] = [];
    for (const wreck of this.model.wrecks) {
      if (this.model.distressTow && wreck.id.startsWith('event-wreck-')) continue;
      const hit = this.drawWreck(wreck, width, height);
      if (hit) hitAreas.push(hit);
    }
    this.hitAreas = hitAreas;
    this.npcHitAreas = this.drawNpcShips(width, height, timeSeconds);
    this.drawCombat(width, height);
    this.drawRoute(width, height);
    drawLocalSpaceExitGate(
      this.context,
      this.camera,
      width,
      height,
      this.model.width,
      this.model.height
    );
    this.drawPlayerScanCone(width, height, timeSeconds);
    this.drawPlayerSalvageEffect(width, height, timeSeconds);
    this.drawDistressDiagnosis(width, height, timeSeconds);
    const geometry = this.shipGeometry(width, height);
    this.drawShip(geometry, timeSeconds);
    drawDistressTow(this.context, this.camera, this.model, width, height, geometry, (url) =>
      this.ensureNpcImage(url)
    );
  }
  protected drawDistressDiagnosis(width: number, height: number, now: number): void {
    drawDistressScanEffect(
      this.context,
      this.camera,
      this.model,
      now - this.diagnosisStartedAt,
      width,
      height
    );
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
    const radius = Math.max(15, this.camera.scale(wreck.radius));
    const padding = radius + 30;
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
    this.context.rotate(wreck.rotation);
    this.context.globalAlpha = wreck.depleted ? 0.38 : 0.95;
    const drewShip = drawDistressShipSprite(
      this.context,
      this.model.sectorEvent,
      wreck.id,
      this.camera.scale(1),
      (url) => this.ensureNpcImage(url)
    );
    if (!drewShip) {
      this.drawHullFragments(wreck, radius);
      this.drawWreckDebris(wreck.id, radius);
    }
    this.context.restore();
    if (wreck.isSelected || wreck.isWorkTarget) {
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

    return { id: wreck.id, point, radius: radius + 12 };
  }
  protected drawHullFragments(wreck: SalvageWreckView, radius: number): void {
    const context = this.context;
    const length = radius * 1.7;
    const height = radius * 0.72;
    const gradient = context.createLinearGradient(-length, -height, length, height);
    gradient.addColorStop(0, '#3e4549');
    gradient.addColorStop(0.48, '#70777a');
    gradient.addColorStop(1, '#24292d');
    context.fillStyle = gradient;
    context.strokeStyle = 'rgba(201, 210, 210, 0.22)';
    context.lineWidth = Math.max(0.8, radius * 0.018);

    context.beginPath();
    context.moveTo(-length * 0.92, -height * 0.55);
    context.lineTo(-length * 0.08, -height * 0.7);
    context.lineTo(length * 0.02, -height * 0.15);
    context.lineTo(-length * 0.1, height * 0.62);
    context.lineTo(-length * 0.9, height * 0.46);
    context.closePath();
    context.fill();
    context.stroke();

    context.save();
    context.translate(length * 0.18, -height * 0.08);
    context.rotate(-0.12);
    context.beginPath();
    context.moveTo(-length * 0.05, -height * 0.48);
    context.lineTo(length * 0.68, -height * 0.34);
    context.lineTo(length * 0.9, 0);
    context.lineTo(length * 0.5, height * 0.42);
    context.lineTo(-length * 0.04, height * 0.32);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();

    this.drawKindDetails(wreck, radius);
    context.strokeStyle = 'rgba(6, 8, 10, 0.86)';
    context.lineWidth = Math.max(1.2, radius * 0.055);
    context.beginPath();
    context.moveTo(-radius * 0.08, -height * 0.65);
    context.lineTo(radius * 0.15, height * 0.58);
    context.stroke();
  }
  protected drawKindDetails(wreck: SalvageWreckView, radius: number): void {
    const context = this.context;
    context.fillStyle = 'rgba(26, 31, 34, 0.92)';
    if (wreck.kind === 'freighter') {
      for (let index = -2; index <= 1; index += 1) {
        context.fillRect(
          -radius * 0.65 + index * radius * 0.24,
          -radius * 0.2,
          radius * 0.2,
          radius * 0.4
        );
      }
    } else if (wreck.kind === 'miner') {
      for (const y of [-0.38, 0, 0.38]) {
        context.fillRect(radius * 0.38, radius * y - radius * 0.06, radius * 0.55, radius * 0.12);
      }
    } else if (wreck.kind === 'salvager') {
      context.fillRect(-radius * 0.25, -radius * 0.7, radius * 0.46, radius * 0.26);
      context.fillRect(radius * 0.08, radius * 0.42, radius * 0.58, radius * 0.25);
    } else {
      context.beginPath();
      context.moveTo(radius * 0.12, -radius * 0.48);
      context.lineTo(radius * 0.95, 0);
      context.lineTo(radius * 0.1, radius * 0.42);
      context.closePath();
      context.fill();
    }
  }
  protected drawWreckDebris(id: string, radius: number): void {
    const context = this.context;
    const hash = hashId(id);
    context.fillStyle = 'rgba(124, 126, 122, 0.72)';
    for (let index = 0; index < 7; index += 1) {
      const angle = ((hash % 719) * 0.01 + index * 2.31) % (Math.PI * 2);
      const spread = radius * (0.9 + ((hash >> (index % 12)) & 7) * 0.08);
      const size = Math.max(1.3, radius * (0.035 + (index % 3) * 0.018));
      context.save();
      context.translate(Math.cos(angle) * spread, Math.sin(angle) * spread);
      context.rotate(angle * 1.7);
      context.fillRect(-size, -size * 0.35, size * 2, size * 0.7);
      context.restore();
    }
  }
  protected drawPlayerScanCone(width: number, height: number, timeSeconds: number): void {
    if (this.model.phase !== 'inspecting') return;
    const wreck = this.model.wrecks.find((entry) => entry.isWorkTarget);
    if (!wreck) return;
    const geometry = this.shipGeometry(width, height);
    const target = this.camera.worldToScreen(wreck.position, width, height);
    const hardpoints = this.model.ship.hardpoints.tractorBeams ?? [];
    const origin =
      hardpoints.length > 0
        ? projectHardpoint(hardpoints[0]!, this.model.ship.hardpoints, geometry)
        : geometry.center;
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return;
    const angle = Math.atan2(dy, dx);
    const halfAngle = Math.PI / 9;
    const progress = Math.max(0, Math.min(1, this.model.operationProgress ?? 0));
    const pulse = 0.55 + Math.sin(timeSeconds * 9) * 0.12;
    const sweepAngle = angle - halfAngle + 2 * halfAngle * progress;
    this.context.save();
    this.context.beginPath();
    this.context.moveTo(origin.x, origin.y);
    this.context.arc(origin.x, origin.y, distance, angle - halfAngle, angle + halfAngle);
    this.context.closePath();
    this.context.fillStyle = `rgba(95, 223, 237, ${0.1 + pulse * 0.1})`;
    this.context.fill();
    this.context.strokeStyle = `rgba(130, 242, 255, ${0.35 + pulse * 0.3})`;
    this.context.lineWidth = 1.2;
    this.context.stroke();
    this.context.beginPath();
    this.context.moveTo(origin.x, origin.y);
    this.context.lineTo(
      origin.x + Math.cos(sweepAngle) * distance,
      origin.y + Math.sin(sweepAngle) * distance
    );
    this.context.strokeStyle = 'rgba(210, 253, 255, 0.85)';
    this.context.lineWidth = 2;
    this.context.stroke();
    this.context.restore();
  }
  protected drawPlayerSalvageEffect(width: number, height: number, timeSeconds: number): void {
    if (this.model.phase !== 'stripping' && this.model.phase !== 'extracting-component') return;
    const wreck = this.model.wrecks.find((entry) => entry.isWorkTarget);
    if (!wreck) return;
    const geometry = this.shipGeometry(width, height);
    const wreckPoint = this.camera.worldToScreen(wreck.position, width, height);
    const hardpoints = this.model.ship.hardpoints.tractorBeams ?? [];
    const emitters =
      hardpoints.length > 0
        ? hardpoints.map((hardpoint) =>
            projectHardpoint(hardpoint, this.model.ship.hardpoints, geometry)
          )
        : [geometry.center];
    const progress = this.model.operationProgress ?? 0;
    const pulse = 0.68 + Math.sin(timeSeconds * 7.5) * 0.2;
    const component = this.model.phase === 'extracting-component';
    this.context.save();
    this.context.lineCap = 'round';
    for (const emitter of emitters) {
      this.context.shadowColor = component
        ? 'rgba(110, 214, 255, 0.8)'
        : 'rgba(235, 180, 83, 0.78)';
      this.context.shadowBlur = 8 + pulse * 5;
      this.context.strokeStyle = component
        ? `rgba(128, 220, 255, ${0.34 + pulse * 0.28})`
        : `rgba(239, 187, 91, ${0.32 + pulse * 0.3})`;
      this.context.lineWidth = 5.5;
      this.context.beginPath();
      this.context.moveTo(emitter.x, emitter.y);
      this.context.lineTo(wreckPoint.x, wreckPoint.y);
      this.context.stroke();
      this.context.shadowBlur = 2;
      this.context.strokeStyle = component
        ? `rgba(220, 248, 255, ${0.64 + pulse * 0.25})`
        : `rgba(255, 230, 164, ${0.62 + pulse * 0.28})`;
      this.context.lineWidth = 1.1;
      this.context.setLineDash([7, 5]);
      this.context.lineDashOffset = -timeSeconds * 24;
      this.context.beginPath();
      this.context.moveTo(emitter.x, emitter.y);
      this.context.lineTo(wreckPoint.x, wreckPoint.y);
      this.context.stroke();
    }
    this.context.setLineDash([]);

    for (let index = 0; index < 9; index += 1) {
      const destination = emitters[index % emitters.length] ?? geometry.center;
      const phase = fractional(
        timeSeconds * (0.55 + index * 0.017) + index * 0.137 + progress * 0.2
      );
      const curve = Math.sin(phase * Math.PI) * (index % 2 === 0 ? 8 : -8);
      const dx = destination.x - wreckPoint.x;
      const dy = destination.y - wreckPoint.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / length;
      const ny = dx / length;
      const x = wreckPoint.x + dx * phase + nx * curve;
      const y = wreckPoint.y + dy * phase + ny * curve;
      const alpha = Math.sin(phase * Math.PI) * 0.78;
      this.context.fillStyle = component
        ? `rgba(176, 232, 255, ${alpha})`
        : `rgba(220, 192, 132, ${alpha})`;
      this.context.beginPath();
      this.context.arc(x, y, component ? 2.2 : 1.5 + (index % 3) * 0.55, 0, Math.PI * 2);
      this.context.fill();
    }

    this.context.strokeStyle = component
      ? `rgba(146, 225, 255, ${0.42 + pulse * 0.24})`
      : `rgba(255, 194, 93, ${0.38 + pulse * 0.28})`;
    this.context.lineWidth = 1.4;
    this.context.beginPath();
    this.context.arc(wreckPoint.x, wreckPoint.y, 12 + pulse * 5, 0, Math.PI * 2);
    this.context.stroke();
    this.context.restore();
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
      this.model.combat?.attacker.shieldImpacts ?? [],
      source,
      geometry
    );
  }
}
