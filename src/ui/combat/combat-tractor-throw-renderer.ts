import type { ThrownAsteroidSnapshot } from '../../systems/combat/strategic-combat-types';

interface Point {
  readonly x: number;
  readonly y: number;
}

function drawTractorLink(
  ctx: CanvasRenderingContext2D,
  rock: ThrownAsteroidSnapshot,
  center: Point,
  project: (point: Point) => Point
): void {
  const start = project(rock.origin);
  const charge = rock.phase === 'charge';
  const energy = charge ? Math.min(1, Math.max(0, (rock.ageSeconds - 0.65) / 0.85)) : 0.2;
  ctx.strokeStyle = 'rgba(93, 237, 215, 0.65)';
  ctx.shadowColor = '#67ffe4';
  ctx.shadowBlur = 9 + energy * 15;
  ctx.lineWidth = 1.5 + energy * 2;
  ctx.setLineDash([7, 5]);
  ctx.lineDashOffset = -rock.ageSeconds * 55;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(center.x, center.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawRock(ctx: CanvasRenderingContext2D, radius: number, age: number): void {
  ctx.rotate(age * 7);
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
}

export function drawTractorThrows(
  ctx: CanvasRenderingContext2D,
  rocks: readonly ThrownAsteroidSnapshot[],
  scale: number,
  project: (point: Point) => Point,
  renderScrap?: (context: CanvasRenderingContext2D, rock: ThrownAsteroidSnapshot, radius: number) => boolean
): void {
  for (const rock of rocks) {
    const center = project(rock.position);
    const radius = Math.max(3, rock.radius * scale);
    const charging = rock.phase === 'charge';
    const flying = rock.phase === 'flight';
    const charge = charging ? Math.min(1, Math.max(0, (rock.ageSeconds - 0.65) / 0.85)) : 0;
    ctx.save();
    if (!flying) drawTractorLink(ctx, rock, center, project);
    if (flying) {
      const tail = Math.max(radius * 4, 18);
      const velocity = Math.hypot(rock.velocity.x, rock.velocity.y) || 1;
      const back = {
        x: center.x - (rock.velocity.x / velocity) * tail,
        y: center.y - (rock.velocity.y / velocity) * tail,
      };
      const trail = ctx.createLinearGradient(back.x, back.y, center.x, center.y);
      trail.addColorStop(0, 'rgba(85, 236, 215, 0)');
      trail.addColorStop(1, 'rgba(135, 255, 229, .85)');
      ctx.strokeStyle = trail;
      ctx.lineWidth = Math.max(2, radius * 0.95);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(back.x, back.y);
      ctx.lineTo(center.x, center.y);
      ctx.stroke();
    }
    ctx.translate(center.x, center.y);
    ctx.shadowColor = '#64ecd7';
    ctx.shadowBlur = 13 + charge * 22;
    ctx.strokeStyle = 'rgba(109, 243, 217, 0.78)';
    ctx.lineWidth = 1.8 + charge * 2;
    ctx.beginPath();
    ctx.ellipse(
      0,
      0,
      radius * (1.35 + charge * 0.65 + Math.sin(rock.ageSeconds * 22) * 0.1),
      radius * (0.62 + charge * 0.45),
      rock.ageSeconds * 2,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    if (charging) {
      ctx.beginPath();
      ctx.arc(0, 0, radius * (1.6 + charge), 0, Math.PI * 2 * charge);
      ctx.stroke();
    }
    if (rock.mineDefinition) {
      ctx.rotate(rock.ageSeconds * 5);
      ctx.fillStyle = '#c7b9a2';
      ctx.strokeStyle = '#ee987a';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (!renderScrap?.(ctx, rock, radius)) {
      drawRock(ctx, radius, rock.ageSeconds);
    }
    ctx.restore();
  }
}
