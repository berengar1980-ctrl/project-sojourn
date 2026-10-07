import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-service';
import { getShipDefinition } from '../../systems/ships';

interface Point {
  readonly x: number;
  readonly y: number;
}

interface CombatShipVisual {
  readonly id: string;
  readonly name: string;
  readonly shipId: string;
  readonly shieldHp: number;
  readonly shieldMaxHp: number;
  readonly hullHp: number;
  readonly hullMaxHp: number;
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
  private lastEvent = '';
  private eventFlash = 0;

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
    if (model.lastEvent !== this.lastEvent) {
      this.lastEvent = model.lastEvent;
      this.eventFlash = 1;
    } else {
      this.eventFlash = Math.max(0, this.eventFlash - 0.08);
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

  private draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const time = this.model.elapsedSeconds;
    this.context.clearRect(0, 0, width, height);
    this.drawBackground(width, height);

    const verticalMotion = Math.min(56, height * 0.08);
    const attackerPoint = {
      x: width * 0.32 + Math.sin(time * 0.31) * 24,
      y: height * 0.5 + Math.sin(time * 0.54) * verticalMotion,
    };
    const defenderPoint = {
      x: width * 0.68 + Math.cos(time * 0.27) * 24,
      y: height * 0.5 + Math.cos(time * 0.49) * verticalMotion,
    };

    this.drawEngagementLine(attackerPoint, defenderPoint);
    this.drawWeaponEvent(attackerPoint, defenderPoint);

    const attackerAngle = Math.atan2(
      defenderPoint.y - attackerPoint.y,
      defenderPoint.x - attackerPoint.x
    );
    const defenderAngle =
      Math.atan2(attackerPoint.y - defenderPoint.y, attackerPoint.x - defenderPoint.x) -
      Math.PI;

    this.drawShip(this.model.attacker, attackerPoint, attackerAngle, 1);
    this.drawShip(this.model.defender, defenderPoint, defenderAngle, -1);
  }

  private drawBackground(width: number, height: number): void {
    const gradient = this.context.createRadialGradient(
      width * 0.5,
      height * 0.45,
      0,
      width * 0.5,
      height * 0.45,
      Math.max(width, height) * 0.75
    );
    gradient.addColorStop(0, '#111c26');
    gradient.addColorStop(0.5, '#071018');
    gradient.addColorStop(1, '#020508');
    this.context.fillStyle = gradient;
    this.context.fillRect(0, 0, width, height);

    const seed = hash(this.model.attacker.id + ':' + this.model.defender.id);
    this.context.fillStyle = 'rgba(205, 225, 236, .62)';
    for (let index = 0; index < 90; index += 1) {
      const x = ((seed + index * 2654435761) >>> 0) % 10000;
      const y = ((seed ^ (index * 2246822519)) >>> 0) % 10000;
      const px = (x / 10000) * width;
      const py = (y / 10000) * height;
      const radius = index % 9 === 0 ? 1.2 : 0.65;
      this.context.globalAlpha = 0.3 + ((index * 37) % 50) / 100;
      this.context.beginPath();
      this.context.arc(px, py, radius, 0, Math.PI * 2);
      this.context.fill();
    }
    this.context.globalAlpha = 1;
  }

  private drawEngagementLine(attacker: Point, defender: Point): void {
    this.context.save();
    this.context.strokeStyle = 'rgba(120, 151, 166, .16)';
    this.context.lineWidth = 1;
    this.context.setLineDash([7, 9]);
    this.context.beginPath();
    this.context.moveTo(attacker.x, attacker.y);
    this.context.lineTo(defender.x, defender.y);
    this.context.stroke();
    this.context.restore();
  }

  private drawWeaponEvent(attackerPoint: Point, defenderPoint: Point): void {
    if (this.eventFlash <= 0) return;
    const event = this.model.lastEvent;
    const attackerFired = event.startsWith(this.model.attacker.name + ':');
    const defenderFired = event.startsWith(this.model.defender.name + ':');
    if (!attackerFired && !defenderFired) return;

    const from = attackerFired ? attackerPoint : defenderPoint;
    const to = attackerFired ? defenderPoint : attackerPoint;
    const missed = event.includes('verfehlt');

    this.context.save();
    this.context.globalAlpha = Math.max(0.15, this.eventFlash);
    this.context.strokeStyle = missed ? 'rgba(236, 190, 110, .72)' : 'rgba(236, 92, 76, .92)';
    this.context.lineWidth = missed ? 1.4 : 2.4;
    this.context.setLineDash(missed ? [8, 6] : []);
    this.context.beginPath();
    this.context.moveTo(from.x, from.y);
    const offset = missed ? 42 : 0;
    this.context.lineTo(to.x, to.y + offset);
    this.context.stroke();

    if (!missed) {
      this.context.fillStyle = 'rgba(255, 211, 157, .8)';
      this.context.beginPath();
      this.context.arc(to.x, to.y, 5 + this.eventFlash * 7, 0, Math.PI * 2);
      this.context.fill();
    }
    this.context.restore();
  }

  private drawShip(
    combatant: CombatShipVisual,
    point: Point,
    angle: number,
    facing: 1 | -1
  ): void {
    const image = this.image(combatant.shipId);
    const definition = getShipDefinition(combatant.shipId);
    const nominalLength = definition?.nominalLengthMeters ?? 60;
    const width = Math.max(54, Math.min(126, nominalLength * 1.25));
    const aspect =
      image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : definition
          ? definition.sprite.widthPx / definition.sprite.heightPx
          : 2.2;
    const height = width / Math.max(0.35, aspect);
    const shieldRatio = clamp01(combatant.shieldHp / Math.max(1, combatant.shieldMaxHp));
    const hullRatio = clamp01(combatant.hullHp / Math.max(1, combatant.hullMaxHp));

    this.context.save();
    this.context.translate(point.x, point.y);
    this.context.rotate(angle + (facing < 0 ? Math.PI : 0));
    this.context.globalAlpha = hullRatio <= 0 ? 0.32 : 1;

    if (image && image.complete && image.naturalWidth > 0) {
      this.context.drawImage(image, -width / 2, -height / 2, width, height);
    } else {
      this.context.fillStyle = '#a4b2ba';
      this.context.beginPath();
      this.context.moveTo(width * 0.5, 0);
      this.context.lineTo(-width * 0.45, -height * 0.45);
      this.context.lineTo(-width * 0.32, height * 0.45);
      this.context.closePath();
      this.context.fill();
    }
    this.context.restore();

    if (shieldRatio > 0) {
      this.context.save();
      this.context.strokeStyle = `rgba(103, 191, 227, ${0.22 + shieldRatio * 0.55})`;
      this.context.lineWidth = 1.5 + shieldRatio;
      this.context.beginPath();
      this.context.ellipse(point.x, point.y, width * 0.62, height * 0.78, angle, 0, Math.PI * 2);
      this.context.stroke();
      this.context.restore();
    }

    this.context.fillStyle = hullRatio > 0.35 ? 'rgba(220, 232, 238, .84)' : '#d88673';
    this.context.font = '10px ui-monospace, monospace';
    this.context.textAlign = 'center';
    this.context.fillText(combatant.name.toUpperCase(), point.x, point.y + height * 0.75 + 20);
  }
}
