export function drawCombatBoostMeter(
  context: CanvasRenderingContext2D,
  center: { x: number; y: number },
  shipHeight: number,
  remainingSeconds: number,
  active: boolean
): void {
  const barWidth = 48;
  const barY = center.y + shipHeight * 0.8 + 23;
  context.fillStyle = 'rgba(28, 40, 54, 0.9)';
  context.fillRect(center.x - barWidth / 2, barY, barWidth, 4);
  context.fillStyle = active ? '#99e9ff' : '#579ac6';
  context.fillRect(
    center.x - barWidth / 2,
    barY,
    barWidth * Math.max(0, Math.min(1, remainingSeconds / 3.5)),
    4
  );
}
