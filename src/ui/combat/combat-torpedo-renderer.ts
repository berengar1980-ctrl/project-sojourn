/** Narrow, finless torpedo silhouette; the nose points along the actual velocity. */
export function drawCombatTorpedo(context: CanvasRenderingContext2D): void {
  context.save();
  context.shadowColor = 'rgba(103, 184, 228, 0.55)';
  context.shadowBlur = 3;
  context.fillStyle = '#899ba8';
  context.beginPath();
  context.moveTo(13, 0);
  context.lineTo(8, -1.1);
  context.lineTo(-10, -1.1);
  context.lineTo(-12, -0.65);
  context.lineTo(-12, 0.65);
  context.lineTo(-10, 1.1);
  context.lineTo(8, 1.1);
  context.closePath();
  context.fill();
  context.shadowBlur = 0;
  context.fillStyle = '#d8e7ed';
  context.fillRect(-5, -0.6, 9, 1.2);
  context.fillStyle = '#f2c28a';
  context.fillRect(-15, -0.55, 3, 1.1);
  context.restore();
}
