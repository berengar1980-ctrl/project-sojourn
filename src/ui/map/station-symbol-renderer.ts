import type { StationType, WorldPoint } from '../../core/world-types';

export class StationSymbolRenderer {
  constructor(private readonly context: CanvasRenderingContext2D) {}

  draw(type: StationType, point: WorldPoint, radius: number): void {
    const context = this.context;
    context.save();
    context.translate(point.x, point.y);
    context.lineWidth = 1.8;
    context.strokeStyle = type === 'pirate' ? '#d8a27b' : '#b8c8d8';
    context.fillStyle = type === 'pirate' ? '#765b52' : '#71869a';

    if (type === 'trade') this.drawTrade(radius);
    else if (type === 'shipyard') this.drawShipyard(radius);
    else if (type === 'military') this.drawMilitary(radius);
    else if (type === 'refinery') this.drawRefinery(radius);
    else if (type === 'research') this.drawResearch(radius);
    else if (type === 'pirate') this.drawPirate(radius);
    else this.drawUtility(radius);

    context.restore();
  }

  private drawTrade(radius: number): void {
    const context = this.context;
    context.beginPath();
    context.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(0, 0, radius * 0.26, 0, Math.PI * 2);
    context.fill();
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2;
      context.beginPath();
      context.moveTo(Math.cos(angle) * radius * 0.3, Math.sin(angle) * radius * 0.3);
      context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      context.stroke();
    }
  }

  private drawShipyard(radius: number): void {
    const context = this.context;
    context.lineWidth = 2.4;
    context.beginPath();
    context.moveTo(-radius, -radius * 0.72);
    context.lineTo(-radius, radius * 0.72);
    context.lineTo(-radius * 0.35, radius * 0.72);
    context.moveTo(radius, -radius * 0.72);
    context.lineTo(radius, radius * 0.72);
    context.lineTo(radius * 0.35, radius * 0.72);
    context.stroke();
    context.fillRect(-radius * 0.22, -radius * 0.65, radius * 0.44, radius * 0.9);
  }

  private drawMilitary(radius: number): void {
    const context = this.context;
    context.rotate(Math.PI / 4);
    context.fillRect(-radius * 0.28, -radius, radius * 0.56, radius * 2);
    context.fillRect(-radius, -radius * 0.28, radius * 2, radius * 0.56);
    context.strokeRect(-radius * 0.42, -radius * 0.42, radius * 0.84, radius * 0.84);
  }

  private drawRefinery(radius: number): void {
    const context = this.context;
    for (const x of [-0.48, 0.48]) {
      context.beginPath();
      context.arc(x * radius, 0, radius * 0.34, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    context.fillRect(-radius * 0.15, -radius * 0.82, radius * 0.3, radius * 1.64);
  }

  private drawResearch(radius: number): void {
    const context = this.context;
    context.beginPath();
    context.moveTo(0, -radius);
    context.lineTo(radius * 0.86, radius * 0.65);
    context.lineTo(-radius * 0.86, radius * 0.65);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
    context.fill();
  }

  private drawPirate(radius: number): void {
    const context = this.context;
    context.beginPath();
    context.moveTo(-radius, -radius * 0.1);
    context.lineTo(-radius * 0.25, -radius * 0.8);
    context.lineTo(radius * 0.3, -radius * 0.45);
    context.lineTo(radius, -radius * 0.72);
    context.lineTo(radius * 0.55, radius * 0.15);
    context.lineTo(radius * 0.82, radius * 0.78);
    context.lineTo(-radius * 0.12, radius * 0.52);
    context.lineTo(-radius * 0.72, radius);
    context.closePath();
    context.fill();
    context.stroke();
  }

  private drawUtility(radius: number): void {
    const context = this.context;
    context.rotate(Math.PI / 4);
    context.fillRect(-radius * 0.62, -radius * 0.62, radius * 1.24, radius * 1.24);
    context.strokeRect(-radius * 0.62, -radius * 0.62, radius * 1.24, radius * 1.24);
  }
}
