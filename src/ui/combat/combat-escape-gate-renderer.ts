export function drawCombatEscapeGate(
  context: CanvasRenderingContext2D,
  gate: { x: number; y: number }
): void {
  context.save();
  context.lineWidth = 3;
  context.strokeStyle = '#77e0ff';
  context.fillStyle = 'rgba(65, 184, 235, 0.16)';
  context.beginPath();
  context.arc(gate.x, gate.y, 26, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.font = 'bold 12px sans-serif';
  context.textAlign = 'center';
  context.fillStyle = '#b5efff';
  context.fillText('FLUCHTPUNKT', gate.x, gate.y - 36);
  context.restore();
}
