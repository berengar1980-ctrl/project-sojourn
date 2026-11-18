import { drawFieldNpcThrusters } from '../combat/embedded-combat-thrusters';
import { drawCombatBeamVisual } from '../combat/combat-beam-visual';
import { drawEmbeddedCombatShipTelemetry } from '../combat/embedded-combat-ship-telemetry';
import type { SalvageSpaceViewModel } from '../../features/salvage/salvage-space-view-model';
import { drawTractorThrows } from '../combat/combat-tractor-throw-renderer';
import { drawSalvageDebris3d } from './salvage-debris-mesh';
import { type MapCamera, type ScreenPoint } from '../map/map-camera';
import { drawLocalSpaceExitGate } from '../map/local-space-exit-gate';
import { type ShieldImpactRenderer } from '../ships/shield-impact-renderer';
import { type ShipEngineEffectsRenderer } from '../ships/ship-engine-effects-renderer';
import { spriteDrawOffset, type ShipScreenGeometry } from '../ships/ship-hardpoint-projector';
import { type ShipLightingRenderer } from '../ships/ship-lighting-renderer';
export interface WreckHitArea {
  readonly id: string;
  readonly point: ScreenPoint;
  readonly radius: number;
}
export interface NpcHitArea {
  readonly id: string;
  readonly point: ScreenPoint;
  readonly radius: number;
}
export function fractional(value: number): number {
  return value - Math.floor(value);
}
export function hashId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
export abstract class SalvageSceneLayers {
  protected abstract model: SalvageSpaceViewModel;
  protected abstract camera: MapCamera;
  protected abstract ensureNpcImage(url: string): HTMLImageElement;
  protected abstract engineEffects: ShipEngineEffectsRenderer;
  protected abstract context: CanvasRenderingContext2D;
  protected abstract shipLighting: ShipLightingRenderer;
  protected abstract shieldImpacts: ShieldImpactRenderer;
  protected abstract shipGeometry(width: number, height: number): ShipScreenGeometry;
  protected abstract combatImpactAge: number;
  protected drawExitGate(width: number, height: number): void {
    drawLocalSpaceExitGate(
      this.context,
      this.camera,
      width,
      height,
      this.model.width,
      this.model.height,
      this.model.backgroundSeed
    );
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
        'salvage'
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
        this.context.fillStyle = '#8e999f';
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
        'salvage'
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
      if (npc.isSelected) {
        this.context.save();
        this.context.strokeStyle = 'rgba(235, 91, 76, 0.95)';
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

      const wreck = npc.targetWreckId
        ? this.model.wrecks.find((entry) => entry.id === npc.targetWreckId)
        : null;
      if (wreck && npc.phase === 'scanning') {
        this.drawNpcScan(point, wreck.position, width, height, npc.scanProgress, timeSeconds);
      } else if (wreck && npc.salvageActive) {
        this.drawNpcSalvageTether(point, wreck.position, width, height, timeSeconds);
      }

      if (this.camera.getRelativeZoom() >= 1.55) {
        this.context.fillStyle = 'rgba(215, 202, 168, 0.8)';
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
        ? 'rgba(226, 108, 82, 0.82)'
        : 'rgba(166, 175, 177, 0.55)';
      this.context.fillStyle = 'rgba(42, 47, 50, 0.92)';
      this.context.beginPath();
      this.context.arc(point.x, point.y, 6, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
      this.context.restore();
    }

    this.drawCombatBeams(width, height);
    drawTractorThrows(
      this.context,
      combat.thrownAsteroids,
      this.camera.scale(1),
      (point) => this.camera.worldToScreen(point, width, height),
      (context, rock, radius) => {
        const scrap = this.model.debris.find((part) => part.id === rock.asteroidId);
        if (!scrap) return false;
        drawSalvageDebris3d(
          context,
          {
            ...scrap,
            rotation3d: { ...scrap.rotation3d, z: scrap.rotation3d.z + rock.ageSeconds * 4 },
          },
          radius,
          rock.ageSeconds
        );
        return true;
      }
    );

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
        this.context.strokeStyle = 'rgba(230, 133, 73, 0.72)';
        this.context.lineWidth = 3;
        this.context.beginPath();
        this.context.moveTo(-8, 0);
        this.context.lineTo(-22, 0);
        this.context.stroke();
      } else if (projectile.kind === 'plasma') {
        this.context.fillStyle = 'rgba(118, 225, 255, 0.95)';
        this.context.shadowColor = 'rgba(81, 194, 255, 0.95)';
        this.context.shadowBlur = 10;
        this.context.beginPath();
        this.context.arc(0, 0, 5, 0, Math.PI * 2);
        this.context.fill();
      } else {
        this.context.fillStyle = 'rgba(245, 211, 156, 0.95)';
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
  protected drawNpcScan(
    shipPoint: ScreenPoint,
    targetWorld: { readonly x: number; readonly y: number },
    width: number,
    height: number,
    progress: number,
    timeSeconds: number
  ): void {
    const target = this.camera.worldToScreen(targetWorld, width, height);
    const radius = 12 + progress * 24;
    this.context.save();
    this.context.strokeStyle = `rgba(119, 226, 240, ${0.5 + Math.sin(timeSeconds * 10) * 0.18})`;
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
  protected drawNpcSalvageTether(
    shipPoint: ScreenPoint,
    targetWorld: { readonly x: number; readonly y: number },
    width: number,
    height: number,
    timeSeconds: number
  ): void {
    const target = this.camera.worldToScreen(targetWorld, width, height);
    const pulse = 0.62 + Math.sin(timeSeconds * 8) * 0.18;
    this.context.save();
    this.context.strokeStyle = `rgba(228, 181, 93, ${pulse})`;
    this.context.lineWidth = 1.4;
    this.context.setLineDash([5, 4]);
    this.context.beginPath();
    this.context.moveTo(shipPoint.x, shipPoint.y);
    this.context.lineTo(target.x, target.y);
    this.context.stroke();
    this.context.strokeStyle = `rgba(245, 214, 147, ${pulse * 0.26})`;
    this.context.lineWidth = 7;
    this.context.setLineDash([]);
    this.context.beginPath();
    this.context.moveTo(shipPoint.x, shipPoint.y);
    this.context.lineTo(target.x, target.y);
    this.context.stroke();
    this.context.restore();
  }
}
