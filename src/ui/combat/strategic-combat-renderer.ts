import type {
  CombatImpactSnapshot,
  CombatMineSnapshot,
  CombatProjectileSnapshot,
  StrategicCombatSnapshot,
} from '../../systems/combat/strategic-combat-service';
import { getShipDefinition } from '../../systems/ships';

interface Point {
  readonly x: number;
  readonly y: number;
}

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export class StrategicCombatRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly images = new Map<string, HTMLImageElement>();
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

  private draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    this.context.clearRect(0, 0, width, height);
    this.drawBackground(width, height);

    const attacker = this.screen(this.model.attacker.position, width, height);
    const defender = this.screen(this.model.defender.position, width, height);

    this.drawMines(width, height);
    this.drawProjectiles(width, height);
    this.drawShip(this.model.attacker, attacker, width, height);
    this.drawShip(this.model.defender, defender, width, height);
    this.drawImpact(this.model.lastImpact, width, height);
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
      const px = (x / 10000) * width;
      const py = (y / 10000) * height;
      const radius = index % 11 === 0 ? 1.2 : 0.55;
      this.context.globalAlpha = 0.26 + ((index * 37) % 48) / 100;
      this.context.beginPath();
      this.context.arc(px, py, radius, 0, Math.PI * 2);
      this.context.fill();
    }
    this.context.globalAlpha = 1;
  }

  private drawProjectiles(width: number, height: number): void {
    for (const projectile of this.model.projectiles) {
      const point = this.screen(projectile.position, width, height);
      const target = this.screen(projectile.target, width, height);
      this.drawProjectile(projectile, point, target);
    }
  }

  private drawProjectile(
    projectile: CombatProjectileSnapshot,
    point: Point,
    target: Point
  ): void {
    const angle = Math.atan2(target.y - point.y, target.x - point.x);
    this.context.save();
    this.context.translate(point.x, point.y);
    this.context.rotate(angle);

    if (projectile.kind === 'laser') {
      this.context.strokeStyle = 'rgba(102, 207, 255, .95)';
      this.context.lineWidth = 2;
      this.context.shadowColor = 'rgba(75, 181, 255, .9)';
      this.context.shadowBlur = 8;
      this.context.beginPath();
      this.context.moveTo(-34, 0);
      this.context.lineTo(34, 0);
      this.context.stroke();
    } else if (projectile.kind === 'plasma') {
      this.context.fillStyle = 'rgba(118, 225, 255, .92)';
      this.context.shadowColor = 'rgba(81, 194, 255, .95)';
      this.context.shadowBlur = 12;
      this.context.beginPath();
      this.context.arc(0, 0, 5, 0, Math.PI * 2);
      this.context.fill();
    } else if (projectile.kind === 'missile') {
      this.context.fillStyle = '#e7d7b0';
      this.context.fillRect(-7, -2, 12, 4);
      this.context.strokeStyle = 'rgba(230, 133, 73, .72)';
      this.context.lineWidth = 3;
      this.context.beginPath();
      this.context.moveTo(-8, 0);
      this.context.lineTo(-22, 0);
      this.context.stroke();
    } else if (projectile.kind === 'rail') {
      this.context.strokeStyle = 'rgba(244, 224, 188, .95)';
      this.context.lineWidth = 1.4;
      this.context.beginPath();
      this.context.moveTo(-24, 0);
      this.context.lineTo(24, 0);
      this.context.stroke();
    } else {
      this.context.fillStyle = 'rgba(245, 211, 156, .95)';
      this.context.fillRect(-2, -1, 5, 2);
    }
    this.context.restore();
  }

  private drawMines(width: number, height: number): void {
    for (const mine of this.model.mines) {
      const point = this.screen(mine.position, width, height);
      this.drawMine(mine, point);
    }
  }

  private drawMine(mine: CombatMineSnapshot, point: Point): void {
    this.context.save();
    this.context.translate(point.x, point.y);
    this.context.strokeStyle = mine.armed
      ? 'rgba(226, 108, 82, .76)'
      : 'rgba(175, 177, 151, .48)';
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

  private drawShip(
    combatant: StrategicCombatSnapshot['attacker'],
    point: Point,
    width: number,
    height: number
  ): void {
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
    const shipHeight = shipWidth / Math.max(0.35, aspect);
    const shieldRatio = clamp01(combatant.shieldHp / Math.max(1, combatant.shieldMaxHp));
    const hullRatio = clamp01(combatant.hullHp / Math.max(1, combatant.hullMaxHp));

    this.context.save();
    this.context.translate(point.x, point.y);
    this.context.rotate(combatant.headingRadians);
    this.context.globalAlpha = hullRatio <= 0 ? 0.28 : 1;

    if (combatant.speed > 8) {
      this.context.strokeStyle = 'rgba(111, 184, 224, .38)';
      this.context.lineWidth = Math.max(2, shipHeight * 0.08);
      this.context.beginPath();
      this.context.moveTo(-shipWidth * 0.45, 0);
      this.context.lineTo(-shipWidth * 0.72, 0);
      this.context.stroke();
    }

    if (image && image.complete && image.naturalWidth > 0) {
      this.context.drawImage(
        image,
        -shipWidth / 2,
        -shipHeight / 2,
        shipWidth,
        shipHeight
      );
    } else {
      this.context.fillStyle = '#a4b2ba';
      this.context.beginPath();
      this.context.moveTo(shipWidth * 0.5, 0);
      this.context.lineTo(-shipWidth * 0.45, -shipHeight * 0.45);
      this.context.lineTo(-shipWidth * 0.32, shipHeight * 0.45);
      this.context.closePath();
      this.context.fill();
    }
    this.context.restore();

    if (shieldRatio > 0) {
      this.context.save();
      this.context.strokeStyle = `rgba(103, 191, 227, ${0.18 + shieldRatio * 0.45})`;
      this.context.lineWidth = 1.3 + shieldRatio;
      this.context.beginPath();
      this.context.ellipse(
        point.x,
        point.y,
        shipWidth * 0.62,
        shipHeight * 0.82,
        combatant.headingRadians,
        0,
        Math.PI * 2
      );
      this.context.stroke();
      this.context.restore();
    }

    this.context.fillStyle = hullRatio > 0.35 ? 'rgba(220, 232, 238, .78)' : '#d88673';
    this.context.font = '10px ui-monospace, monospace';
    this.context.textAlign = 'center';
    this.context.fillText(
      combatant.name.toUpperCase(),
      point.x,
      point.y + shipHeight * 0.8 + 18
    );
  }

  private drawImpact(
    impact: CombatImpactSnapshot | null,
    width: number,
    height: number
  ): void {
    if (!impact || this.impactAge >= 1) return;
    const point = this.screen(impact.position, width, height);
    const progress = this.impactAge;
    const radius = 8 + progress * (impact.layer === 'shield' ? 38 : 24);
    const alpha = 1 - progress;

    this.context.save();
    if (impact.layer === 'shield') {
      this.context.strokeStyle = `rgba(123, 211, 255, ${alpha * 0.9})`;
      this.context.lineWidth = 2.2;
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius, -0.9, 0.9);
      this.context.stroke();
      this.context.fillStyle = `rgba(191, 235, 255, ${alpha * 0.22})`;
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius * 0.55, 0, Math.PI * 2);
      this.context.fill();
    } else if (impact.layer === 'hull') {
      this.context.fillStyle = `rgba(255, 147, 72, ${alpha * 0.85})`;
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius * 0.55, 0, Math.PI * 2);
      this.context.fill();
      this.context.strokeStyle = `rgba(255, 218, 154, ${alpha * 0.8})`;
      this.context.lineWidth = 1.4;
      for (let index = 0; index < 5; index += 1) {
        const angle = index * 1.37 + impact.serial;
        this.context.beginPath();
        this.context.moveTo(point.x, point.y);
        this.context.lineTo(
          point.x + Math.cos(angle) * radius,
          point.y + Math.sin(angle) * radius
        );
        this.context.stroke();
      }
    }
    this.context.restore();
  }
}
