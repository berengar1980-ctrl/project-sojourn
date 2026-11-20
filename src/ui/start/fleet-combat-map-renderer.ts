import { getShipDefinition } from '../../systems/ships';
import { WEAPON_VISUALS } from '../../core/weapon-visual-profiles';
import type { FleetCombatSnapshot, FleetCombatShipSnapshot } from '../../systems/combat/fleet-combat-service';
import { CombatCamera } from '../combat/combat-camera';
import { CombatAsteroidBackdrop } from '../combat/combat-asteroid-backdrop';
import { drawCombatAsteroids } from '../combat/combat-asteroid-renderer';
import { drawCombatBackground } from '../combat/combat-background-renderer';
import { drawCombatShipBody, drawCombatShipCaption, drawCombatMineMarker } from '../combat/combat-ship-detail-renderer';
import { drawCombatShipStatus } from '../combat/combat-status-renderer';
import { drawCombatBeamVisual } from '../combat/combat-beam-visual';
import { drawVisionProjectile, drawVisionWeaponImpact } from '../combat/combat-weapon-vision-renderer';
import { drawTractorThrows } from '../combat/combat-tractor-throw-renderer';
import { drawCombatScrap } from '../combat/combat-scrap-renderer';
import { drawCombatDamageParticles } from '../combat/combat-damage-visual';
import { drawCombatBoostMeter } from '../combat/combat-boost-meter-renderer';
import { drawCombatRamEffect } from '../combat/combat-ram-effect-renderer';
import { drawDroneShield, drawDroneShieldHits, DRONE_DIAMETER_PX } from '../local-space/local-security-drone-visual';
import { ProceduralSpaceBodyRenderer } from '../space/procedural-space-body-renderer';
import { ShipLightingRenderer } from '../ships/ship-lighting-renderer';
import { ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { ShipManeuverEffectsRenderer } from '../ships/ship-maneuver-effects-renderer';
import { ShieldImpactRenderer } from '../ships/shield-impact-renderer';
import type { ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import type { DistressDamageParticles } from '../salvage/distress-damage-particles';
import type { CombatPoint } from '../../systems/combat/strategic-combat-types';
import type { ShipWeaponFamily } from '../../core/ship-types';

interface FleetVisualImpact {
  readonly position: CombatPoint;
  readonly startedAt: number;
  readonly id: number;
  readonly shield: boolean;
  readonly family: ShipWeaponFamily;
}

/** Same world-map art pipeline as the normal strategic-combat scene.
 * Rendering only: the FleetCombat service remains the sole gameplay owner.
 */
export class FleetCombatMapRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly camera = new CombatCamera();
  private readonly bodies: ProceduralSpaceBodyRenderer;
  private readonly backdrop: CombatAsteroidBackdrop;
  private readonly lighting = new ShipLightingRenderer();
  private readonly engines = new ShipEngineEffectsRenderer();
  private readonly maneuver = new ShipManeuverEffectsRenderer();
  private readonly shields = new ShieldImpactRenderer();
  private readonly sprites = new Map<string, HTMLImageElement>();
  private readonly damage = new Map<string, DistressDamageParticles>();
  private readonly impacts: FleetVisualImpact[] = [];
  private impactSerial = 0;
  private model: FleetCombatSnapshot;
  private destroyed = false;

  constructor(private readonly canvas: HTMLCanvasElement, model: FleetCombatSnapshot) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('FleetCombat map requires a Canvas 2D context');
    this.ctx = context;
    this.model = model;
    this.bodies = new ProceduralSpaceBodyRenderer(context);
    this.backdrop = new CombatAsteroidBackdrop(context, model.arena);
    this.resize();
  }

  update(model: FleetCombatSnapshot): void {
    this.model = model;
    for (const shot of model.shots) {
      if (shot.shieldDamage + shot.hullDamage <= 0) continue;
      const source = model.ships.find((entry) => entry.ship.id === shot.sourceId);
      const weapon = source?.ship.weaponTelemetry.find((item) => item.weaponId === shot.weaponId);
      const definition = source ? getShipDefinition(source.ship.shipId) : null;
      const family = definition?.sprite && weapon
        ? this.weaponFamily(source, weapon.slotIndex)
        : 'autocannon';
      this.impacts.push({
        position: { ...shot.destination },
        startedAt: model.elapsedSeconds,
        id: ++this.impactSerial,
        shield: shot.shieldDamage > 0,
        family,
      });
    }
    for (let index = this.impacts.length - 1; index >= 0; index--) {
      if (model.elapsedSeconds - this.impacts[index]!.startedAt > 0.8)
        this.impacts.splice(index, 1);
    }
    this.draw();
  }

  private weaponFamily(_source: FleetCombatShipSnapshot, _slot: number): ShipWeaponFamily {
    // Projectile/beam snapshots supply their own weapon family. The impacts
    // have no family field yet, so use the native generic kinetic effect.
    return 'autocannon';
  }

  resize(): void {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }

  zoomAt(factor: number, x: number, y: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.zoomAt(factor, x, y, rect.width, rect.height);
    this.draw();
  }

  pan(dx: number, dy: number): void {
    this.camera.pan(dx, dy);
    this.draw();
  }

  resetCamera(): void {
    this.camera.restorePose({ zoom: 1, offsetX: 0, offsetY: 0 });
    this.draw();
  }

  destroy(): void {
    this.destroyed = true;
    for (const sprite of this.sprites.values()) sprite.onload = null;
    this.sprites.clear();
    this.damage.clear();
  }

  private project(point: CombatPoint, width: number, height: number): CombatPoint {
    return this.camera.project(
      point, width, height, this.model.arena.width, this.model.arena.height
    );
  }

  private sprite(ship: FleetCombatShipSnapshot): HTMLImageElement | null {
    const drone = ship.factionId === 'security';
    const definition = getShipDefinition(ship.ship.shipId);
    const url = drone ? '/drones/security-drone-gc87r8.webp' : definition?.sprite.assetUrl;
    if (!url) return null;
    const cached = this.sprites.get(url);
    if (cached) return cached;
    const image = new Image();
    image.onload = () => this.draw();
    image.src = url;
    this.sprites.set(url, image);
    return image;
  }

  private geometry(
    entry: FleetCombatShipSnapshot, width: number, height: number
  ): ShipScreenGeometry {
    const definition = getShipDefinition(entry.ship.shipId);
    const image = this.sprite(entry);
    const scale = this.camera.scale(width, height, this.model.arena.width, this.model.arena.height);
    const nominal = definition?.nominalLengthMeters ?? 60;
    const shipWidth = entry.factionId === 'security'
      ? DRONE_DIAMETER_PX * this.camera.zoom : nominal * scale;
    const aspect = entry.factionId === 'security' ? 1
      : image?.complete && image.naturalWidth > 0
        ? image.naturalWidth / Math.max(1, image.naturalHeight)
        : definition ? definition.sprite.widthPx / definition.sprite.heightPx : 2.2;
    return {
      center: this.project(entry.ship.position, width, height),
      width: shipWidth,
      height: shipWidth / Math.max(0.35, aspect),
      angle: entry.ship.headingRadians,
    };
  }

  private drawShip(
    entry: FleetCombatShipSnapshot, width: number, height: number, now: number
  ): void {
    const ship = entry.ship;
    const geometry = this.geometry(entry, width, height);
    const definition = getShipDefinition(ship.shipId);
    const drone = entry.factionId === 'security';
    const hardpoints = drone ? undefined : definition?.sprite.hardpoints;
    const hullRatio = Math.max(0, ship.hullHp / Math.max(1, ship.hullMaxHp));
    const intensity = ship.subsystems.engine > 0
      ? Math.min(1, ship.speed / 120) : 0;
    const demand = {
      turnRateRadiansPerSecond: ship.turnRateRadiansPerSecond,
      angularThrust: ship.angularThrust,
      lateralThrust: ship.lateralThrust ?? 0,
      longitudinalThrust: ship.longitudinalThrust ?? 0,
    };
    if (hardpoints) {
      this.engines.drawExhaust(this.ctx, hardpoints, geometry, intensity, now, 'below', ship.boostActive);
      this.maneuver.drawExhaust(this.ctx, hardpoints, geometry, demand, now, 'below');
    }
    drawCombatShipBody(
      this.ctx, geometry, hullRatio, this.sprite(entry), hardpoints, this.lighting
    );
    if (drone) {
      drawDroneShield(this.ctx, geometry.center.x, geometry.center.y,
        geometry.width * 0.62, ship.shieldHp / Math.max(1, ship.shieldMaxHp));
      drawDroneShieldHits(this.ctx, geometry.center.x, geometry.center.y,
        geometry.width * 0.62, ship.shieldImpacts);
    }
    if (hardpoints) {
      this.engines.drawGlow(this.ctx, hardpoints, geometry, intensity, now, 'above');
      this.maneuver.drawGlow(this.ctx, hardpoints, geometry, demand, now, 'above');
      this.shields.draw(this.ctx, ship.shieldImpacts, hardpoints, geometry);
    }
    drawCombatRamEffect(this.ctx, ship, geometry, this.model.elapsedSeconds);
    drawCombatDamageParticles(this.ctx, ship, geometry, this.damage, now, width, height);
    drawCombatShipCaption(this.ctx, ship.name, hullRatio, geometry);
    drawCombatShipStatus(this.ctx, ship, geometry);
    drawCombatBoostMeter(this.ctx, geometry.center, geometry.height,
      ship.boostSeconds, ship.boostActive);
  }

  private drawWeapons(width: number, height: number): void {
    for (const projectile of this.model.projectiles) {
      const p = this.project(projectile.position, width, height);
      if (drawVisionProjectile(this.ctx, projectile.family, p, projectile.direction,
        this.model.elapsedSeconds, projectile.id)) continue;
      const angle = Math.atan2(projectile.direction.y, projectile.direction.x);
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(angle);
      this.ctx.fillStyle = '#ffe7bd';
      this.ctx.fillRect(-5, -1, 10, 2);
      this.ctx.restore();
    }
    for (const beam of this.model.beams) {
      const duration = WEAPON_VISUALS[beam.family].beamSeconds ??
        (beam.kind === 'laser' ? 0.16 : 0.09);
      drawCombatBeamVisual(this.ctx, {
        id: beam.id, owner: 'attacker', kind: beam.kind, family: beam.family,
        origin: beam.origin, end: beam.end, ttlSeconds: beam.ttlSeconds,
        maxTtlSeconds: duration, weaponIndex: 0,
      }, this.project(beam.origin, width, height), this.project(beam.end, width, height));
    }
    for (const impact of this.impacts) {
      drawVisionWeaponImpact(
        this.ctx, impact.family,
        this.project(impact.position, width, height),
        this.model.elapsedSeconds - impact.startedAt, impact.id, impact.shield
      );
    }
  }

  private drawObjects(width: number, height: number, now: number): void {
    const scale = this.camera.scale(width, height, this.model.arena.width, this.model.arena.height);
    drawCombatAsteroids(this.bodies, this.model.arena.asteroids ?? [],
      scale, (point) => this.project(point, width, height), this.ctx, now);
    for (const mine of this.model.mines) {
      drawCombatMineMarker(this.ctx, {
        ...mine, owner: 'attacker', mineId: String(mine.id), name: mine.kind,
        tier: 1, detection: 'identified',
      }, this.project(mine.position, width, height));
    }
    drawTractorThrows(this.ctx, this.model.thrownAsteroids.map((rock) => ({
      ...rock, owner: 'attacker' as const,
      origin: rock.origin, ageSeconds: rock.ageSeconds,
      radius: rock.radius, velocity: rock.velocity,
    })), scale, (point) => this.project(point, width, height),
    (context, rock, radius) => drawCombatScrap(context, rock, radius, now));
  }

  draw(): void {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) return;
    const now = performance.now() / 1000;
    this.ctx.clearRect(0, 0, width, height);
    drawCombatBackground(this.ctx, width, height, 'fleet', String(this.model.arena.backdropSeed ?? 0));
    this.backdrop.draw(width, height, this.camera);
    this.drawObjects(width, height, now);
    this.drawWeapons(width, height);
    for (const entry of this.model.ships) this.drawShip(entry, width, height, now);
  }
}
