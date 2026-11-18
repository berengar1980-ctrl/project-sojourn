import { drawFieldNpcThrusters } from '../combat/embedded-combat-thrusters';
import { drawCombatBeamVisual } from '../combat/combat-beam-visual';
import { drawEmbeddedCombatShipTelemetry } from '../combat/embedded-combat-ship-telemetry';
import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';
import { type MapCamera, type ScreenPoint } from '../map/map-camera';
import { type ShieldImpactRenderer } from '../ships/shield-impact-renderer';
import { type ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { spriteDrawOffset, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { type ShipLightingRenderer } from '../ships/ship-lighting-renderer';
export interface AsteroidHitArea {
  readonly id: string;
  readonly point: ScreenPoint;
  readonly radius: number;
}
export interface NpcHitArea {
  readonly id: string;
  readonly point: ScreenPoint;
  readonly radius: number;
}
export function hashId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
export abstract class LocalSpaceSceneLayers {
  protected abstract context: CanvasRenderingContext2D;
  protected abstract model: LocalSpaceViewModel;
  protected abstract camera: MapCamera;
  protected abstract ensureNpcImage(url: string): HTMLImageElement;
  protected abstract engineEffects: ShipEngineEffectsRenderer;
  protected abstract shipLighting: ShipLightingRenderer;
  protected abstract shieldImpacts: ShieldImpactRenderer;
  protected abstract shipGeometry(width: number, height: number): ShipScreenGeometry;
  protected abstract combatImpactAge: number;
  protected drawNpcSelection(point: ScreenPoint, geometry: ShipScreenGeometry): void {
    this.context.save();
    this.context.strokeStyle = 'rgba(235, 91, 76, .95)';
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.arc(
      point.x,
      point.y,
      Math.max(geometry.width, geometry.height) * 0.65 + 7,
      0,
      Math.PI * 2
    );
    this.context.stroke();
    this.context.restore();
  }
  protected drawPirateMarker(point: ScreenPoint, geometry: ShipScreenGeometry): void {
    // Always identify corsairs, even below the regular NPC-name zoom threshold.
    this.context.save();
    this.context.fillStyle = '#e6a36a';
    this.context.font = 'bold 10px ui-monospace, monospace';
    this.context.textAlign = 'center';
    this.context.fillText(
      'KORSAR',
      point.x,
      point.y - Math.max(geometry.width, geometry.height) * 0.5 - 10
    );
    this.context.restore();
  }
  protected drawNpcShips(width: number, height: number, timeSeconds: number): NpcHitArea[] {
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
      const combatDefender =
        this.model.combat?.defender.id === npc.id ? this.model.combat.defender : null;
      drawFieldNpcThrusters(
        this.context,
        npc.hardpoints,
        geometry,
        npc.speed,
        combatDefender,
        timeSeconds,
        'below',
        this.engineEffects,
        'mining'
      );
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

      drawFieldNpcThrusters(
        this.context,
        npc.hardpoints,
        geometry,
        npc.speed,
        combatDefender,
        timeSeconds,
        'above',
        this.engineEffects,
        'mining'
      );
      if (combatDefender) {
        this.shieldImpacts.draw(
          this.context,
          combatDefender.shieldImpacts,
          npc.hardpoints,
          geometry
        );
      }
      if (combatDefender) drawEmbeddedCombatShipTelemetry(this.context, combatDefender, geometry);

      hits.push({
        id: npc.id,
        point,
        radius: Math.max(18, Math.max(geometry.width, geometry.height) * 0.6),
      });
      if (npc.isSelected) this.drawNpcSelection(point, geometry);
      if (npc.isPirate) this.drawPirateMarker(point, geometry);

      // A ship in battle cannot continue painting its former mining beam.
      if (npc.targetAsteroidId && !combatDefender) {
        const target = this.model.asteroids.find(
          (asteroid) => asteroid.id === npc.targetAsteroidId
        );
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
  protected drawCombatBeams(width: number, height: number): void {
    const combat = this.model.combat;
    if (!combat) return;
    for (const beam of combat.beams) {
      // Capture the muzzle at fire time, as the standalone renderer does.
      // A moving ship must not drag a retired shot across the screen.
      drawCombatBeamVisual(
        this.context,
        beam,
        this.camera.worldToScreen(beam.origin, width, height),
        this.camera.worldToScreen(beam.end, width, height)
      );
    }
  }
  protected drawCombat(width: number, height: number): void {
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

    this.drawCombatBeams(width, height);

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
  protected drawNpcMinerScan(
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
  protected drawNpcMiningBeam(
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
  protected drawChunks(width: number, height: number): void {
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
