/** Compact dark-grey torpedo, with a restrained exhaust and no fins. */
export function drawCombatTorpedo(context: CanvasRenderingContext2D): void {
  context.save();
  context.fillStyle = '#343a40';
  context.strokeStyle = '#77818a';
  context.lineWidth = 0.7;
  context.beginPath();
  context.moveTo(8, 0);
  context.lineTo(4.5, -1.65);
  context.lineTo(-6.5, -1.65);
  context.lineTo(-8, -1);
  context.lineTo(-8, 1);
  context.lineTo(-6.5, 1.65);
  context.lineTo(4.5, 1.65);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = '#555e67';
  context.fillRect(-3.5, -0.85, 5.5, 1.7);
  context.fillStyle = 'rgba(122, 170, 191, .8)';
  context.fillRect(-10, -0.65, 2, 1.3);
  context.restore();
}
