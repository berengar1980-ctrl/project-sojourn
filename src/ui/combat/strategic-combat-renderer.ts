import { drawCombatEscapeGate } from './combat-escape-gate-renderer';
import { drawCombatBoostMeter } from './combat-boost-meter-renderer';
import { hash, clamp01 } from './strategic-combat-renderer-math';
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

  private screen(point: Point, width: number, height: number): Point {
    const padding = 70;
    const usableWidth = Math.max(1, width - padding * 2);
    const usableHeight = Math.max(1, height - padding * 2);
    return {
      x: padding + (point.x / this.model.arena.width) * usableWidth,
      y: padding + (point.y / this.model.arena.height) * usableHeight,
    };
  }

  private shipGeometry(
    combatant: StrategicCombatSnapshot['attacker'],
    width: number,
    height: number
  ): ShipScreenGeometry {
    const image = this.image(combatant.shipId);
    const definition = getShipDefinition(combatant.shipId);
    const nominalLength = definition?.nominalLengthMeters ?? 60;
    const canvasScale = Math.min(width / this.model.arena.width, height / this.model.arena.height);
    const shipWidth = Math.max(44, Math.min(150, nominalLength * canvasScale * 3.2));
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
    this.drawBackground(width, height);
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

  private drawBackground(width: number, height: number): void {
    const gradient = this.context.createRadialGradient(
      width * 0.5,
      height * 0.46,
      0,
      width * 0.5,
      height * 0.46,
      Math.max(width, height) * 0.78
    );
    gradient.addColorStop(0, '#111b24');
    gradient.addColorStop(0.52, '#071018');
    gradient.addColorStop(1, '#020507');
    this.context.fillStyle = gradient;
    this.context.fillRect(0, 0, width, height);

    const seed = hash(this.model.attacker.id + ':' + this.model.defender.id);
    this.context.fillStyle = 'rgba(205, 225, 236, .62)';
    for (let index = 0; index < 110; index += 1) {
      const x = ((seed + index * 2654435761) >>> 0) % 10000;
      const y = ((seed ^ (index * 2246822519)) >>> 0) % 10000;
      this.context.globalAlpha = 0.26 + ((index * 37) % 48) / 100;
      this.context.beginPath();
      this.context.arc(
        (x / 10000) * width,
        (y / 10000) * height,
        index % 11 === 0 ? 1.2 : 0.55,
        0,
        Math.PI * 2
      );
      this.context.fill();
    }
    this.context.globalAlpha = 1;
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

    this.context.save();
    this.context.lineCap = 'round';
    if (beam.kind === 'laser') {
      this.context.shadowColor = 'rgba(67, 185, 255, .95)';
      this.context.shadowBlur = 4;
      this.context.strokeStyle = `rgba(108, 214, 255, ${0.25 + alpha * 0.5})`;
      this.context.lineWidth = 1.8;
      this.context.beginPath();
      this.context.moveTo(start.x, start.y);
      this.context.lineTo(end.x, end.y);
      this.context.stroke();

      this.context.shadowBlur = 3;
      this.context.strokeStyle = `rgba(232, 251, 255, ${0.75 + alpha * 0.25})`;
      this.context.lineWidth = 0.65;
      this.context.beginPath();
      this.context.moveTo(start.x, start.y);
      this.context.lineTo(end.x, end.y);
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
      this.context.moveTo(start.x, start.y);
      this.context.lineTo(end.x, end.y);
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
    const angle = Math.atan2(target.y - point.y, target.x - point.x);
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
      // A pointed missile with a short exhaust plume, rather than a flat
      // rectangle dragging an oversized orange line across the arena.
      this.context.shadowColor = '#ffad57';
      this.context.shadowBlur = 7;
      this.context.fillStyle = 'rgba(240, 112, 36, 0.45)';
      this.context.beginPath();
      this.context.moveTo(-7, 0);
      this.context.lineTo(-17, -3);
      this.context.lineTo(-14, 0);
      this.context.lineTo(-17, 3);
      this.context.closePath();
      this.context.fill();
      this.context.shadowBlur = 0;
      this.context.fillStyle = '#c1ced2';
      this.context.beginPath();
      this.context.moveTo(9, 0);
      this.context.lineTo(2, -3);
      this.context.lineTo(-7, -2.5);
      this.context.lineTo(-7, 2.5);
      this.context.lineTo(2, 3);
      this.context.closePath();
      this.context.fill();
      this.context.fillStyle = '#536674';
      this.context.fillRect(-5, -1, 8, 2);
      this.context.strokeStyle = '#87969a';
      this.context.lineWidth = 1;
      this.context.beginPath();
      this.context.moveTo(-4, -3);
      this.context.lineTo(-8, -5);
      this.context.moveTo(-4, 3);
      this.context.lineTo(-8, 5);
      this.context.stroke();
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

  private drawShip(
    combatant: StrategicCombatSnapshot['attacker'],
    width: number,
    height: number,
    timeSeconds: number
  ): void {
    const image = this.image(combatant.shipId);
    const definition = getShipDefinition(combatant.shipId);
    const geometry = this.shipGeometry(combatant, width, height);
    const hullRatio = clamp01(combatant.hullHp / Math.max(1, combatant.hullMaxHp));
    const hardpoints = definition?.sprite.hardpoints;
    const engineIntensity =
      combatant.subsystems.engine > 0 ? Math.max(0, Math.min(1, combatant.speed / 120)) : 0;
    const maneuverDemand = {
      turnRateRadiansPerSecond: combatant.turnRateRadiansPerSecond,
      angularThrust: combatant.angularThrust,
      lateralThrust: 0,
      longitudinalThrust: 0,
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
    drawCombatHullImpact(
      this.context,
      impact,
      this.impactAge,
      this.screen(impact.position, width, height)
    );
  }
}
