import { drawCombatAsteroids } from './combat-asteroid-renderer';
import { drawTractorThrows } from './combat-tractor-throw-renderer';
import { drawCombatScrap } from './combat-scrap-renderer';
import { CombatCamera } from './combat-camera';
import { ProceduralSpaceBodyRenderer } from '../space/procedural-space-body-renderer';
import { drawCombatTorpedo } from './combat-torpedo-renderer';
import { drawLegacyCombatBeam } from './combat-legacy-beam-renderer';
import {
  drawCombatMineMarker,
  drawCombatShipBody,
  drawCombatShipCaption,
} from './combat-ship-detail-renderer';
import { drawIonCannonArc, drawRailgunLance } from './combat-weapon-fx-renderer';
import {
  drawVisionAutocannon,
  drawVisionIonLaser,
  drawVisionProjectile,
  drawVisionPulseLaser,
  drawVisionFrontRepeater,
  drawVisionWeaponImpact,
} from './combat-weapon-vision-renderer';
import { VISION_IMPACT_SECONDS } from '../../core/combat-visual-timings';
import { AUTOCANNON_ROUNDS, AUTOCANNON_ROUND_INTERVAL } from '../../core/combat-visual-timings';
import { drawCombatEscapeGate } from './combat-escape-gate-renderer';
import { drawCombatBoostMeter } from './combat-boost-meter-renderer';
import { clamp01 } from './strategic-combat-renderer-math';
import { drawCombatBackground } from './combat-background-renderer';
import { drawStrategicHullImpact } from './strategic-hull-impact-effect';
import { DistressDamageParticles } from '../salvage/distress-damage-particles';
import { drawCombatGrapple } from './combat-grapple-renderer';
import type {
  CombatBeamSnapshot,
  CombatImpactSnapshot,
  CombatProjectileSnapshot,
  StrategicCombatSnapshot,
} from '../../systems/combat/strategic-combat-service';
import { getShipDefinition } from '../../systems/ships';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { projectHardpoint, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { drawPirateInsignia } from '../ships/pirate-insignia-renderer';
import { ShipLightingRenderer } from '../ships/ship-lighting-renderer';
import { ShipManeuverEffectsRenderer } from '../ships/ship-maneuver-effects-renderer';
import { ShieldImpactRenderer } from '../ships/shield-impact-renderer';
interface Point {
  readonly x: number;
  readonly y: number;
}
interface AutocannonVisualBurst {
  readonly origin: Point;
  readonly target: Point;
  readonly spawnedAt: number;
  readonly flightSeconds: number;
}
interface VisibleCombatImpact {
  readonly impact: CombatImpactSnapshot;
  readonly startedAt: number;
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
  private readonly autocannonBursts = new Map<number, AutocannonVisualBurst>();
  private model: StrategicCombatSnapshot;
  private seenImpactSerial = -1;
  private readonly visibleImpacts: VisibleCombatImpact[] = [];
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
    for (const projectile of model.projectiles) {
      if (projectile.kind !== 'autocannon' || this.autocannonBursts.has(projectile.id)) continue;
      const origin = projectile.origin;
      const target = projectile.target;
      const travel = Math.hypot(target.x - origin.x, target.y - origin.y);
      this.autocannonBursts.set(projectile.id, {
        origin: { ...origin },
        target: { ...target },
        spawnedAt: model.elapsedSeconds,
        flightSeconds: Math.max(0.12, travel / 900),
      });
    }
    for (const [id, burst] of this.autocannonBursts) {
      const lifetime = burst.flightSeconds + (AUTOCANNON_ROUNDS - 1) * AUTOCANNON_ROUND_INTERVAL;
      if (model.elapsedSeconds - burst.spawnedAt >= lifetime) this.autocannonBursts.delete(id);
    }
    if (model.lastImpact && model.lastImpact.serial !== this.seenImpactSerial) {
      const impact = model.lastImpact;
      this.seenImpactSerial = impact.serial;
      const flightDelay =
        impact.weaponFamily === 'pulse_laser'
          ? 0.42
          : impact.weaponFamily === 'front_repeater'
            ? 0.045
          : impact.weaponFamily === 'ion_laser'
            ? 0.1
            : impact.weaponFamily === 'ion_cannon'
              ? 0.075
              : impact.weaponFamily === 'railgun'
                ? 0.045
                : 0;
      this.visibleImpacts.push({ impact, startedAt: model.elapsedSeconds + flightDelay });
    }
    for (let index = this.visibleImpacts.length - 1; index >= 0; index -= 1) {
      const visible = this.visibleImpacts[index]!;
      if (model.elapsedSeconds - visible.startedAt >= VISION_IMPACT_SECONDS) {
        this.visibleImpacts.splice(index, 1);
      }
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
      (point) => this.screen(point, width, height),
      this.context,
      timeSeconds
    );
    drawTractorThrows(
      this.context,
      this.model.thrownAsteroids,
      this.camera.scale(width, height, this.model.arena.width, this.model.arena.height),
      (point) => this.screen(point, width, height),
      (context, rock, radius) =>
        drawCombatScrap(
          context,
          {
            ...rock,
            rotation3d: {
              x: rock.rotation3d?.x ?? 0.18,
              y: rock.rotation3d?.y ?? 0.27,
              z: (rock.rotation3d?.z ?? 0) + rock.ageSeconds * 4,
            },
          },
          radius,
          timeSeconds
        )
    );
    drawCombatEscapeGate(this.context, this.screen(this.model.exitPoint, width, height));
    this.drawMines(width, height);
    this.drawProjectiles(width, height);
    this.drawAutocannonBursts(width, height);
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
    this.drawHullImpacts(width, height);
  }
  private drawBeams(width: number, height: number): void {
    for (const beam of this.model.beams) this.drawBeam(beam, width, height);
  }
  private drawBeam(beam: CombatBeamSnapshot, width: number, height: number): void {
    // The beam origin is captured at fire time, so it cannot slide with a
    // turning or translating ship while the brief beam effect is visible.
    const start = this.screen(beam.origin, width, height);
    const end = this.screen(beam.end, width, height);
    const ageSeconds = Math.max(0, beam.maxTtlSeconds - beam.ttlSeconds);
    if (beam.family === 'front_repeater') {
      drawVisionFrontRepeater(this.context, start, end, ageSeconds);
      return;
    }
    if (beam.family === 'pulse_laser') {
      drawVisionPulseLaser(this.context, start, end, ageSeconds);
      return;
    }
    if (beam.family === 'ion_laser') {
      drawVisionIonLaser(this.context, start, end, ageSeconds, beam.id);
      return;
    }
    if (beam.family === 'ion_cannon') {
      drawIonCannonArc(this.context, start, end, ageSeconds, beam.id);
      return;
    }
    if (beam.family === 'railgun') {
      drawRailgunLance(this.context, start, end, ageSeconds);
      return;
    }
    drawLegacyCombatBeam(this.context, beam, start, end);
  }
  private drawProjectiles(width: number, height: number): void {
    for (const projectile of this.model.projectiles) {
      if (projectile.kind === 'autocannon') continue;
      const point = this.screen(projectile.position, width, height);
      const target = this.screen(projectile.target, width, height);
      this.drawProjectile(projectile, point, target);
    }
  }
  private drawAutocannonBursts(width: number, height: number): void {
    for (const burst of this.autocannonBursts.values()) {
      drawVisionAutocannon(
        this.context,
        this.screen(burst.origin, width, height),
        this.screen(burst.target, width, height),
        this.model.elapsedSeconds - burst.spawnedAt,
        burst.flightSeconds
      );
    }
  }
  private drawProjectile(projectile: CombatProjectileSnapshot, point: Point, target: Point): void {
    if (
      drawVisionProjectile(
        this.context,
        projectile.family,
        point,
        projectile.direction,
        this.model.elapsedSeconds,
        projectile.id
      )
    ) {
      return;
    }
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
      drawCombatMineMarker(this.context, mine, point);
    }
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
    drawCombatShipBody(
      this.context,
      geometry,
      hullRatio,
      this.image(combatant.shipId),
      hardpoints,
      this.lighting
    );
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
    drawCombatShipCaption(this.context, combatant.name, hullRatio, geometry);
    if (combatant.combatIntent) {
      this.context.font = 'bold 10px ui-monospace, monospace';
      this.context.textAlign = 'center';
      this.context.fillStyle = combatant.combatIntent === 'FLIEHEN' ? '#ffd18b' : '#95d9f2';
      this.context.fillText(
        combatant.combatIntent,
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
  private drawHullImpacts(width: number, height: number): void {
    for (const visible of this.visibleImpacts) {
      const impact = visible.impact;
      const age = this.model.elapsedSeconds - visible.startedAt;
      if (age < 0) continue;
      const point = this.screen(impact.position, width, height);
      if (impact.weaponFamily && impact.layer !== 'miss') {
        drawVisionWeaponImpact(
          this.context,
          impact.weaponFamily,
          point,
          age,
          impact.serial,
          impact.layer === 'shield'
        );
      } else {
        drawStrategicHullImpact(this.context, impact, clamp01(age / 0.7), point);
      }
    }
  }
}
