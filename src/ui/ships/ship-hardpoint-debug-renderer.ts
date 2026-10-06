import type { ShipHardpoints } from '../../core/ship-types';
import {
  projectHardpoint,
  projectShieldGeometry,
  projectShipPoint,
  type ShipScreenGeometry,
} from './ship-hardpoint-projector';

interface DebugStyle {
  readonly fill: string;
  readonly label: string;
}

function drawMarker(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  style: DebugStyle
): void {
  context.save();
  context.fillStyle = style.fill;
  context.strokeStyle = '#0a0d12';
  context.lineWidth = 1;
  context.beginPath();
  context.arc(x, y, 4, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.font = '600 9px monospace';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(style.label, x + 6, y);
  context.restore();
}

export class ShipHardpointDebugRenderer {
  draw(
    context: CanvasRenderingContext2D,
    source: ShipHardpoints,
    geometry: ShipScreenGeometry
  ): void {
    const pivot = projectShipPoint(source.pivot, source, geometry);
    drawMarker(context, pivot.x, pivot.y, { fill: '#ffd75e', label: 'PIVOT' });

    for (const engine of source.engines) {
      const point = projectHardpoint(engine, source, geometry);
      drawMarker(context, point.x, point.y, { fill: '#4da3ff', label: engine.id });
    }

    for (const laser of source.weaponLasers ?? []) {
      const point = projectHardpoint(laser, source, geometry);
      drawMarker(context, point.x, point.y, {
        fill: '#ffb347',
        label: `${laser.id} [${laser.layer ?? 'above'}]`,
      });
    }

    for (const laser of source.miningLasers) {
      const point = projectHardpoint(laser, source, geometry);
      drawMarker(context, point.x, point.y, {
        fill: '#ff4d4d',
        label: `${laser.id} [${laser.layer ?? 'above'}]`,
      });
    }

    for (const tractor of source.tractorBeams ?? []) {
      const point = projectHardpoint(tractor, source, geometry);
      drawMarker(context, point.x, point.y, {
        fill: '#54ef8d',
        label: `${tractor.id} [${tractor.layer ?? 'above'}]`,
      });
    }

    for (const thruster of source.maneuverThrusters) {
      const point = projectHardpoint(thruster, source, geometry);
      drawMarker(context, point.x, point.y, {
        fill: '#f4f7fb',
        label: `${thruster.id} [${thruster.layer ?? 'above'}]`,
      });
    }

    const shield = projectShieldGeometry(source.shield, source, geometry);
    context.save();
    context.translate(shield.center.x, shield.center.y);
    context.rotate(shield.angle);
    context.strokeStyle = 'rgba(63, 224, 255, .8)';
    context.lineWidth = 1;
    context.setLineDash([4, 4]);
    context.beginPath();
    context.ellipse(0, 0, shield.radiusX, shield.radiusY, 0, 0, Math.PI * 2);
    context.stroke();
    context.restore();

    drawMarker(context, shield.center.x, shield.center.y, {
      fill: '#44e5ff',
      label: 'SHIELD',
    });
  }
}
