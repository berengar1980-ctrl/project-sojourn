import type { ThrownAsteroidSnapshot } from '../../systems/combat/strategic-combat-types';

interface Point { readonly x: number; readonly y: number }

export function drawTractorThrows(
  ctx: CanvasRenderingContext2D,
  rocks: readonly ThrownAsteroidSnapshot[],
  scale: number,
  project: (point: Point) => Point
): void {
  for (const rock of rocks) {
    const center = project(rock.position);
    const radius = Math.max(3, rock.radius * scale);
    const pulse = Math.sin(rock.ageSeconds * 22) * 0.18;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rock.ageSeconds * 6);
    ctx.shadowColor = '#64ecd7';
    ctx.shadowBlur = 13;
    ctx.strokeStyle = 'rgba(109, 243, 217, 0.78)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * (1.35 + pulse), radius * 0.62, 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#746d65';
    ctx.beginPath();
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2;
      const extent = radius * (0.81 + Math.sin(i * 9.17) * 0.19);
      const x = Math.cos(angle) * extent;
      const y = Math.sin(angle) * extent;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#b9d8cd';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}
