import { centerSalvageCamera } from './salvage-camera-centering';
import { FleetNativeCombatRenderer } from '../combat/fleet-native-combat-renderer';
import { pickNearestHitArea } from './salvage-hit-test';
import { drawPlayerSalvageWorkEffect } from './salvage-work-effect-renderer';
import { drawSalvageContainer3d } from './salvage-container-mesh';
import { drawSalvageDebris3d } from './salvage-debris-mesh';
import { drawSalvageSection3d } from './salvage-section-mesh';
import { drawCombatWreck3d } from './combat-wreck-mesh';
import { drawWreckSelection } from './salvage-wreck-selection-renderer';
import { DistressDamageParticles } from './distress-damage-particles';
import { drawDistressRammingShield } from './distress-ramming-shield-effect';
import type {
  SalvageSpaceViewModel,
  SalvageWreckView,
} from '../../features/salvage/salvage-space-view-model';
import { drawDistressScanEffect, drawDistressShipSprite } from './salvage-distress-scan-effect';
import { drawDistressTow } from './distress-tow-renderer';
import { drawTargetDetailScan, drawWideAreaScan } from '../local-operations/scan-effects';
import { drawEmbeddedCombatShipTelemetry } from '../combat/embedded-combat-ship-telemetry';
import { drawFieldPlayerThrusters } from '../combat/embedded-combat-thrusters';
import { type ScreenPoint } from '../map/map-camera';
import { PvPMapCamera } from '../combat/pvp-map-camera';
import { ShieldImpactRenderer } from '../ships/shield-impact-renderer';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { spriteDrawOffset, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { ShipLightingRenderer } from '../ships/ship-lighting-renderer';
import { ShipManeuverEffectsRenderer } from '../ships/ship-maneuver-effects-renderer';
import { SpaceBackgroundRenderer } from '../space/space-background-renderer';
import { type NpcHitArea, SalvageSceneLayers, type WreckHitArea } from './salvage-scene-layers';
export class SalvageSpaceRenderer extends SalvageSceneLayers {
  protected readonly context: CanvasRenderingContext2D;
  private sharedCombatRenderer: FleetNativeCombatRenderer | null = null;
  private sharedCombatActive = false;
  protected readonly camera: PvPMapCamera;
  protected readonly background: SpaceBackgroundRenderer;
  protected readonly engineEffects = new ShipEngineEffectsRenderer();
  protected readonly maneuverEffects = new ShipManeuverEffectsRenderer();
  protected readonly shipLighting = new ShipLightingRenderer();
  protected readonly shieldImpacts = new ShieldImpactRenderer();
  protected readonly shipImage = new Image();
  protected readonly distressParticles = new DistressDamageParticles();
  protected readonly npcImages = new Map<string, HTMLImageElement>();
  protected model: SalvageSpaceViewModel;
  protected hitAreas: readonly WreckHitArea[] = [];
  protected npcHitAreas: readonly NpcHitArea[] = [];
  protected loadedShipUrl = '';
  protected hasFitted = false;
  private scanLabelsVisible = true;
  setScanLabelsVisible(visible: boolean): void {
    this.scanLabelsVisible = visible;
    this.draw();
  }
  private lastFrameAt = -Infinity;
  constructor(
    private readonly canvas: HTMLCanvasElement,
    model: SalvageSpaceViewModel
  ) {
    super();
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Salvage-space canvas context unavailable.');
    this.context = context;
    this.model = model;
    this.camera = new PvPMapCamera(model.width, model.height);
    this.background = new SpaceBackgroundRenderer(context, model.backgroundSeed);
    this.resize();
  }
  update(model: SalvageSpaceViewModel): void {
    this.model = model;
    for (const npc of model.npcShips) this.ensureNpcImage(npc.spriteUrl);
    if (model.combat) {
      const resumedCombat = this.sharedCombatRenderer !== null && !this.sharedCombatActive;
      this.sharedCombatActive = true;
      if (!this.sharedCombatRenderer) {
        this.sharedCombatRenderer = new FleetNativeCombatRenderer(
          this.canvas,
          model.combat,
          (_pose, width, height, timeSeconds) => {
            const battle = this.model.combat;
            if (!battle) return;
            const active = new Set([battle.attacker.id, battle.defender.id]);
            for (const duel of this.model.fleet?.duels ?? []) {
              active.add(duel.attacker.id);
              active.add(duel.defender.id);
            }
            for (const duel of this.model.fleet?.supporters ?? []) active.add(duel.attacker.id);
            this.drawNpcShips(width, height, timeSeconds, active);
          },
          this.camera.combat
        );
      } else if (resumedCombat) {
        this.sharedCombatRenderer.beginEncounter(model.combat);
      }
      this.sharedCombatRenderer.updateEncounter(model.combat, model.fleet);
      return;
    }
    if (this.sharedCombatRenderer && this.sharedCombatActive) {
      this.sharedCombatRenderer.suspend();
    }
    this.sharedCombatActive = false;
    // Retain the same native sprite/asteroid/camera renderer for later contacts.
    // Do not destroy and reload it after every duel or reinforcement.
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
    this.camera.setViewDimensions(rect.width, rect.height);
    if (!this.hasFitted) {
      centerSalvageCamera(this.camera, this.model.ship.position, rect.width, rect.height);
      this.hasFitted = true;
    }
    this.ensureShipImage(this.model.ship.spriteUrl);
    for (const npc of this.model.npcShips) this.ensureNpcImage(npc.spriteUrl);
    if (this.sharedCombatActive && this.sharedCombatRenderer) this.sharedCombatRenderer.resize();
    else this.draw();
  }
  pan(dx: number, dy: number): void {
    if (this.sharedCombatActive && this.sharedCombatRenderer) {
      this.sharedCombatRenderer.pan(dx, dy);
      return;
    }
    this.camera.pan(dx, dy);
    this.draw();
  }
  zoomAt(deltaY: number, x: number, y: number): void {
    if (this.sharedCombatActive && this.sharedCombatRenderer) {
      this.sharedCombatRenderer.zoomAt(Math.exp(-deltaY * 0.00135), x, y);
      return;
    }
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
    if (this.sharedCombatActive) return;
    this.drawLocalScene();
  }
  private drawLocalScene(): void {
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
    if (this.model.phase === 'diagnosing') {
      drawDistressScanEffect(
        this.context,
        this.camera,
        this.model,
        (this.model.operationProgress ?? 0) * 3,
        width,
        height
      );
    }
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
        this.context.fillStyle = '#6f858a';
        this.context.fillRect(-radius * 0.8, -radius * 0.24, radius * 1.6, radius * 0.48);
      }
    } else if (wreck.combatWreckVariant) {
      drawCombatWreck3d(
        this.context,
        wreck.combatWreckVariant,
        radius,
        wreck.rotation3d ?? { x: 0, y: 0, z: wreck.rotation }
      );
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
    drawWreckSelection(this.context, wreck, point, radius);
    return { id: wreck.id, point, radius: hitRadius };
  }
  private drawWreckScanCallout(
    wreck: SalvageWreckView,
    point: { x: number; y: number },
    radius: number
  ): void {
    if (!this.scanLabelsVisible) return;
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
        'salvage'
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
    drawDistressRammingShield(
      this.context,
      this.camera,
      this.model,
      this.canvas.clientWidth,
      this.canvas.clientHeight
    );
    if (this.model.combat) {
      drawEmbeddedCombatShipTelemetry(this.context, this.model.combat.attacker, geometry);
    }
  }
}
