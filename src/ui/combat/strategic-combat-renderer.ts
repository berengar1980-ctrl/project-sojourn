import { drawCombatAsteroids } from './combat-asteroid-renderer';
import { drawTractorThrows } from './combat-tractor-throw-renderer';
import { CombatCamera } from './combat-camera';
import { ProceduralSpaceBodyRenderer } from '../space/procedural-space-body-renderer';
import { drawCombatTorpedo } from './combat-torpedo-renderer';
import { drawCombatEscapeGate } from './combat-escape-gate-renderer';
import { drawCombatBoostMeter } from './combat-boost-meter-renderer';
import { clamp01 } from './strategic-combat-renderer-math';
import { drawCombatBackground } from './combat-background-renderer';
import { drawCombatHullImpact } from './combat-hull-impact-renderer';
import { DistressDamageParticles } from '../salvage/distress-damage-particles';
import { drawCombatGrapple } from './combat-grapple-renderer';
import type {
  CombatBeamSnapshot,
  CombatMineSnapshot,
  CombatProjectileSnapshot,
  StrategicCombatSnapshot,
} from '../../systems/combat/strategic-combat-service';
import { getShipDefinition } from '../../systems/ships';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import {
  projectHardpoint,
  spriteDrawOffset,
  type ShipScreenGeometry,
} from '../ships/ship-hardpoint-projector';
import { drawPirateInsignia } from '../ships/pirate-insignia-renderer';
import { ShipLightingRenderer } from '../ships/ship-lighting-renderer';
import { ShipManeuverEffectsRenderer } from '../ships/ship-maneuver-effects-renderer';
import { ShieldImpactRenderer } from '../ships/shield-impact-renderer';
interface Point {
  readonly x: number;
  readonly y: number;
}
export class StrategicCombatRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly spaceBodies: ProceduralSpaceBodyRenderer;
  private readonly camera = new CombatCamera();
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly damageParticles = new Map<string, DistressDamageParticles>();
  private readonly engineEffects = new ShipEngineEffectsRenderer();
  private readonly maneuverEffects = new ShipManeuverEffectsRenderer();
  private readonly lighting = new ShipLightingRenderer();
  private readonly shieldImpacts = new ShieldImpactRenderer();
  private model: StrategicCombatSnapshot;
  private seenImpactSerial = -1;
  private impactAge = 1;
  constructor(
    private readonly canvas: HTMLCanvasElement,
    model: StrategicCombatSnapshot
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Strategic combat canvas context unavailable.');
    this.context = context;
    this.spaceBodies = new ProceduralSpaceBodyRenderer(context);
    this.model = model;
    this.resize();
  }
  update(model: StrategicCombatSnapshot): void {
    if (model.lastImpact && model.lastImpact.serial !== this.seenImpactSerial) {
      this.seenImpactSerial = model.lastImpact.serial;
      this.impactAge = 0;
    } else {
      this.impactAge = Math.min(1, this.impactAge + 0.07);
    }
    this.model = model;
    this.draw();
  }
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }
  private image(shipId: string): HTMLImageElement | null {
    const definition = getShipDefinition(shipId);
    if (!definition) return null;
    const cached = this.images.get(shipId);
    if (cached) return cached;
    const image = new Image();
    image.onload = () => this.draw();
    image.src = definition.sprite.assetUrl;
    this.images.set(shipId, image);
    return image;
  }
  pan(dx: number, dy: number): void {
    this.camera.pan(dx, dy);
    this.draw();
  }
  zoomAt(factor: number, x: number, y: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.zoomAt(factor, x, y, rect.width, rect.height);
    this.draw();
  }
  private screen(point: Point, width: number, height: number): Point {
    return this.camera.project(
      point,
      width,
      height,
      this.model.arena.width,
      this.model.arena.height
    );
  }
  private shipGeometry(
    combatant: StrategicCombatSnapshot['attacker'],
    width: number,
    height: number
  ): ShipScreenGeometry {
    const image = this.image(combatant.shipId);
    const definition = getShipDefinition(combatant.shipId);
    const nominalLength = definition?.nominalLengthMeters ?? 60;
    const canvasScale = this.camera.scale(
      width,
      height,
      this.model.arena.width,
      this.model.arena.height
    );
    const shipWidth = nominalLength * canvasScale;
    const aspect =
      image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : definition
          ? definition.sprite.widthPx / definition.sprite.heightPx
          : 2.2;
    return {
      center: this.screen(combatant.position, width, height),
      width: shipWidth,
      height: shipWidth / Math.max(0.35, aspect),
      angle: combatant.headingRadians,
    };
  }
  private draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const timeSeconds = performance.now() / 1000;
    this.context.clearRect(0, 0, width, height);
    drawCombatBackground(
      this.context,
      width,
      height,
      this.model.attacker.id,
      this.model.defender.id
    );
    drawCombatAsteroids(
      this.spaceBodies,
      this.model.arena.asteroids ?? [],
      this.camera.scale(width, height, this.model.arena.width, this.model.arena.height),
      (point) => this.screen(point, width, height)
    );
    drawTractorThrows(
      this.context,
      this.model.thrownAsteroids,
      this.camera.scale(width, height, this.model.arena.width, this.model.arena.height),
      (point) => this.screen(point, width, height)
    );
    drawCombatEscapeGate(this.context, this.screen(this.model.exitPoint, width, height));
    this.drawMines(width, height);
    this.drawProjectiles(width, height);
    this.drawBeams(width, height);
    drawCombatGrapple(this.context, this.model, (side) => {
      const combatant = this.model[side];
      const geometry = this.shipGeometry(combatant, width, height);
      const points = getShipDefinition(combatant.shipId)?.sprite.hardpoints;
      const mount = points?.grapplingHooks?.[0];
      return points && mount ? projectHardpoint(mount, points, geometry) : geometry.center;
    });
    this.drawShip(this.model.attacker, width, height, timeSeconds);
    this.drawCombatDamage(this.model.attacker, width, height, timeSeconds);
    this.drawShip(this.model.defender, width, height, timeSeconds);
    this.drawCombatDamage(this.model.defender, width, height, timeSeconds);
    this.drawHullImpact(this.model.lastImpact, width, height);
  }
  private drawBeams(width: number, height: number): void {
    for (const beam of this.model.beams) this.drawBeam(beam, width, height);
  }
  private drawBeam(beam: CombatBeamSnapshot, width: number, height: number): void {
    // The beam origin is captured at fire time, so it cannot slide with a
    // turning or translating ship while the brief beam effect is visible.
    const start = this.screen(beam.origin, width, height);
    const end = this.screen(beam.end, width, height);
    const alpha = clamp01(beam.ttlSeconds / Math.max(0.001, beam.maxTtlSeconds));
    const progress = 1 - alpha;
    const segmentStart =
      beam.kind === 'tractor'
        ? start
        : {
            x: start.x + (end.x - start.x) * Math.max(0, progress - 0.32),
            y: start.y + (end.y - start.y) * Math.max(0, progress - 0.32),
          };
    const segmentEnd =
      beam.kind === 'tractor'
        ? end
        : {
            x: start.x + (end.x - start.x) * Math.min(1, progress + 0.18),
            y: start.y + (end.y - start.y) * Math.min(1, progress + 0.18),
          };
    this.context.save();
    this.context.lineCap = 'round';
    if (beam.kind === 'tractor') {
      this.context.strokeStyle = `rgba(113, 220, 190, ${0.35 + alpha * 0.6})`;
      this.context.lineWidth = 2.5;
      this.context.setLineDash([4, 5]);
      this.context.beginPath();
      this.context.moveTo(segmentStart.x, segmentStart.y);
      this.context.lineTo(segmentEnd.x, segmentEnd.y);
      this.context.stroke();
    } else if (beam.kind === 'laser') {
      this.context.shadowColor = 'rgba(67, 185, 255, .95)';
      this.context.shadowBlur = 4;
      this.context.strokeStyle = `rgba(108, 214, 255, ${0.25 + alpha * 0.5})`;
      this.context.lineWidth = 1.8;
      this.context.beginPath();
      this.context.moveTo(segmentStart.x, segmentStart.y);
      this.context.lineTo(segmentEnd.x, segmentEnd.y);
      this.context.stroke();
      this.context.shadowBlur = 3;
      this.context.strokeStyle = `rgba(232, 251, 255, ${0.75 + alpha * 0.25})`;
      this.context.lineWidth = 0.65;
      this.context.beginPath();
      this.context.moveTo(segmentStart.x, segmentStart.y);
      this.context.lineTo(segmentEnd.x, segmentEnd.y);
      this.context.stroke();
      // Brief muzzle flare anchors each shot visually to the firing hardpoint.
      this.context.shadowBlur = 5;
      this.context.fillStyle = `rgba(202, 244, 255, ${alpha * 0.9})`;
      this.context.beginPath();
      this.context.arc(start.x, start.y, 1.3 + alpha * 1.1, 0, Math.PI * 2);
      this.context.fill();
    } else {
      this.context.strokeStyle = `rgba(250, 229, 190, ${0.55 + alpha * 0.4})`;
      this.context.lineWidth = 1.3;
      this.context.setLineDash([18, 5]);
      this.context.beginPath();
      this.context.moveTo(segmentStart.x, segmentStart.y);
      this.context.lineTo(segmentEnd.x, segmentEnd.y);
      this.context.stroke();
    }
    this.context.restore();
  }
  private drawProjectiles(width: number, height: number): void {
    for (const projectile of this.model.projectiles) {
      const point = this.screen(projectile.position, width, height);
      const target = this.screen(projectile.target, width, height);
      this.drawProjectile(projectile, point, target);
    }
  }
  private drawProjectile(projectile: CombatProjectileSnapshot, point: Point, target: Point): void {
    const angle =
      projectile.kind === 'missile'
        ? Math.atan2(projectile.direction.y, projectile.direction.x)
        : Math.atan2(target.y - point.y, target.x - point.x);
    this.context.save();
    this.context.translate(point.x, point.y);
    this.context.rotate(angle);
    if (projectile.kind === 'plasma') {
      this.context.shadowColor = '#73dfff';
      this.context.shadowBlur = 14;
      this.context.fillStyle = 'rgba(78, 177, 241, 0.45)';
      this.context.beginPath();
      this.context.arc(0, 0, 7, 0, Math.PI * 2);
      this.context.fill();
      this.context.fillStyle = '#e1f9ff';
      this.context.beginPath();
      this.context.arc(0, 0, 3, 0, Math.PI * 2);
      this.context.fill();
    } else if (projectile.kind === 'missile') {
      this.context.scale(this.camera.zoom / 3, this.camera.zoom / 3);
      drawCombatTorpedo(this.context);
    } else {
      this.context.fillStyle = 'rgba(245, 211, 156, .95)';
      this.context.fillRect(-3, -1, 6, 2);
    }
    this.context.restore();
  }
  private drawMines(width: number, height: number): void {
    for (const mine of this.model.mines) {
      if (mine.detection === 'hidden') continue;
      const point = this.screen(mine.position, width, height);
      this.drawMine(mine, point);
    }
  }
  private drawMine(mine: CombatMineSnapshot, point: Point): void {
    this.context.save();
    this.context.translate(point.x, point.y);
    this.context.strokeStyle = mine.armed ? 'rgba(226, 108, 82, .76)' : 'rgba(175, 177, 151, .48)';
    this.context.fillStyle = 'rgba(44, 49, 51, .9)';
    this.context.lineWidth = 1;
    this.context.beginPath();
    this.context.arc(0, 0, 6, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();
    for (let index = 0; index < 4; index += 1) {
      const angle = (Math.PI / 2) * index;
      this.context.beginPath();
      this.context.moveTo(Math.cos(angle) * 6, Math.sin(angle) * 6);
      this.context.lineTo(Math.cos(angle) * 10, Math.sin(angle) * 10);
      this.context.stroke();
    }
    this.context.restore();
  }
  private drawCombatDamage(
    combatant: StrategicCombatSnapshot['attacker'],
    width: number,
    height: number,
    now: number
  ): void {
    const fraction = clamp01(combatant.hullHp / Math.max(1, combatant.hullMaxHp));
    if (fraction > 0.85 && !this.damageParticles.has(combatant.id)) return;
    let particles = this.damageParticles.get(combatant.id);
    if (!particles) {
      particles = new DistressDamageParticles();
      this.damageParticles.set(combatant.id, particles);
    }
    const geometry = this.shipGeometry(combatant, width, height);
    const camera = {
      worldToScreen: (point: Point) => point,
      scale: (meters: number) => meters,
    };
    particles.update(
      now,
      geometry.center,
      geometry.angle,
      geometry.width,
      camera,
      this.context,
      width,
      height,
      fraction
    );
  }
  private drawShipBody(
    combatant: StrategicCombatSnapshot['attacker'],
    geometry: ShipScreenGeometry,
    hullRatio: number
  ): void {
    const image = this.image(combatant.shipId);
    const definition = getShipDefinition(combatant.shipId);
    const hardpoints = definition?.sprite.hardpoints;
    this.context.save();
    this.context.translate(geometry.center.x, geometry.center.y);
    this.context.rotate(geometry.angle);
    this.context.globalAlpha = hullRatio <= 0 ? 0.28 : 1;
    if (image && image.complete && image.naturalWidth > 0 && hardpoints) {
      const offset = spriteDrawOffset(hardpoints, geometry);
      this.lighting.draw(this.context, {
        image,
        width: geometry.width,
        height: geometry.height,
        angle: geometry.angle,
        light: { x: -0.72, y: -0.56 },
        offsetX: offset.x,
        offsetY: offset.y,
        directionalStrength: 2.05,
      });
    } else if (image && image.complete && image.naturalWidth > 0) {
      this.context.drawImage(
        image,
        -geometry.width / 2,
        -geometry.height / 2,
        geometry.width,
        geometry.height
      );
    } else {
      this.context.fillStyle = '#a4b2ba';
      this.context.fillRect(
        -geometry.width / 2,
        -geometry.height / 2,
        geometry.width,
        geometry.height
      );
    }
    this.context.restore();
  }
  private drawShip(
    combatant: StrategicCombatSnapshot['attacker'],
    width: number,
    height: number,
    timeSeconds: number
  ): void {
    const definition = getShipDefinition(combatant.shipId);
    const geometry = this.shipGeometry(combatant, width, height);
    const hullRatio = clamp01(combatant.hullHp / Math.max(1, combatant.hullMaxHp));
    const hardpoints = definition?.sprite.hardpoints;
    const engineIntensity =
      combatant.subsystems.engine > 0 ? Math.max(0, Math.min(1, combatant.speed / 120)) : 0;
    const maneuverDemand = {
      turnRateRadiansPerSecond: combatant.turnRateRadiansPerSecond,
      angularThrust: combatant.angularThrust,
      lateralThrust: combatant.lateralThrust ?? 0,
      longitudinalThrust: combatant.longitudinalThrust ?? 0,
    };
    if (hardpoints) {
      this.engineEffects.drawExhaust(
        this.context,
        hardpoints,
        geometry,
        engineIntensity,
        timeSeconds,
        'below',
        combatant.boostActive
      );
      this.maneuverEffects.drawExhaust(
        this.context,
        hardpoints,
        geometry,
        maneuverDemand,
        timeSeconds,
        'below'
      );
    }
    this.drawShipBody(combatant, geometry, hullRatio);
    if (combatant.pirateMark) {
      drawPirateInsignia(this.context, combatant.pirateMark, geometry);
    }
    if (hardpoints) {
      this.engineEffects.drawGlow(
        this.context,
        hardpoints,
        geometry,
        engineIntensity,
        timeSeconds,
        'above'
      );
      this.maneuverEffects.drawGlow(
        this.context,
        hardpoints,
        geometry,
        maneuverDemand,
        timeSeconds,
        'above'
      );
      this.shieldImpacts.draw(this.context, combatant.shieldImpacts, hardpoints, geometry);
    }
    this.drawShipCaption(combatant.name, hullRatio, geometry);
    if (combatant.combatIntent) {
      this.context.font = 'bold 10px ui-monospace, monospace';
      this.context.textAlign = 'center';
      this.context.fillStyle = combatant.combatIntent === 'FLIEHEN' ? '#ffd18b' : '#95d9f2';
      this.context.fillText(
        combatant.combatIntent + (combatant.boostActive ? ' · BOOST' : ''),
        geometry.center.x,
        geometry.center.y - geometry.height * 0.8 - 13
      );
    }
    drawCombatBoostMeter(
      this.context,
      geometry.center,
      geometry.height,
      combatant.boostSeconds,
      combatant.boostActive
    );
  }
  private drawShipCaption(name: string, hullRatio: number, geometry: ShipScreenGeometry): void {
    this.context.fillStyle = hullRatio > 0.35 ? 'rgba(220, 232, 238, .78)' : '#d88673';
    this.context.font = '10px ui-monospace, monospace';
    this.context.textAlign = 'center';
    this.context.fillText(
      name.toUpperCase(),
      geometry.center.x,
      geometry.center.y + geometry.height * 0.8 + 18
    );
  }
  private drawHullImpact(
    impact: StrategicCombatSnapshot['lastImpact'],
    width: number,
    height: number
  ): void {
    if (!impact) return;
    const point = this.screen(impact.position, width, height);
    drawCombatHullImpact(this.context, impact, this.impactAge, point);
    if (impact.source === 'tractor_asteroid' && this.impactAge < 1) {
      const progress = this.impactAge;
      this.context.save();
      this.context.globalAlpha = 1 - progress;
      this.context.strokeStyle = '#b8f7e7';
      this.context.shadowColor = '#7afae0';
      this.context.shadowBlur = 24;
      this.context.lineWidth = 5 * (1 - progress) + 0.5;
      this.context.beginPath();
      this.context.arc(point.x, point.y, 12 + progress * 85, 0, Math.PI * 2);
      this.context.stroke();
      for (let i = 0; i < 12; i += 1) {
        const angle = (i / 12) * Math.PI * 2 + impact.serial * 0.7;
        const length = (15 + progress * 95) * (0.7 + (i % 4) * 0.14);
        this.context.beginPath();
        this.context.moveTo(point.x + Math.cos(angle) * 6, point.y + Math.sin(angle) * 6);
        this.context.lineTo(point.x + Math.cos(angle) * length, point.y + Math.sin(angle) * length);
        this.context.stroke();
      }
      this.context.restore();
    }
  }
}
