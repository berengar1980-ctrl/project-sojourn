import type { CombatBeamSnapshot } from '../../systems/combat/strategic-combat-service';
import { clamp01 } from './strategic-combat-renderer-math';

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Original tractor/laser/kinetic fallback stroke drawn with its original timings. */
export function drawLegacyCombatBeam(
  context: CanvasRenderingContext2D,
  beam: CombatBeamSnapshot,
  start: Point,
  end: Point
): void {
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
  context.save();
  context.lineCap = 'round';
  if (beam.kind === 'tractor') {
    context.strokeStyle = `rgba(113, 220, 190, ${0.35 + alpha * 0.6})`;
    context.lineWidth = 2.5;
    context.setLineDash([4, 5]);
    context.beginPath();
    context.moveTo(segmentStart.x, segmentStart.y);
    context.lineTo(segmentEnd.x, segmentEnd.y);
    context.stroke();
  } else if (beam.kind === 'laser') {
    context.shadowColor = 'rgba(67, 185, 255, .95)';
    context.shadowBlur = 4;
    context.strokeStyle = `rgba(108, 214, 255, ${0.25 + alpha * 0.5})`;
    context.lineWidth = 1.8;
    context.beginPath();
    context.moveTo(segmentStart.x, segmentStart.y);
    context.lineTo(segmentEnd.x, segmentEnd.y);
    context.stroke();
    context.shadowBlur = 3;
    context.strokeStyle = `rgba(232, 251, 255, ${0.75 + alpha * 0.25})`;
    context.lineWidth = 0.65;
    context.beginPath();
    context.moveTo(segmentStart.x, segmentStart.y);
    context.lineTo(segmentEnd.x, segmentEnd.y);
    context.stroke();
    // Brief muzzle flare anchors each shot visually to the firing hardpoint.
    context.shadowBlur = 5;
    context.fillStyle = `rgba(202, 244, 255, ${alpha * 0.9})`;
    context.beginPath();
    context.arc(start.x, start.y, 1.3 + alpha * 1.1, 0, Math.PI * 2);
    context.fill();
  } else {
    context.strokeStyle = `rgba(250, 229, 190, ${0.55 + alpha * 0.4})`;
    context.lineWidth = 1.3;
    context.setLineDash([18, 5]);
    context.beginPath();
    context.moveTo(segmentStart.x, segmentStart.y);
    context.lineTo(segmentEnd.x, segmentEnd.y);
    context.stroke();
  }
  context.restore();
}
