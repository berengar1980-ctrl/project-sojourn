/** The same sensor visualization is used across every local operation map. */
export function drawWideAreaScan(
  context: CanvasRenderingContext2D,
  center: { readonly x: number; readonly y: number },
  progress: number,
  timeSeconds: number,
  width: number,
  height: number
): void {
  const radius = Math.max(8, Math.max(width, height) * 0.68 * (0.08 + progress * 0.92));
  const pulse = 0.72 + Math.sin(timeSeconds * 9) * 0.18;
  context.save();
  context.strokeStyle = `rgba(97, 222, 242, ${0.48 * (1 - progress * 0.42)})`;
  context.lineWidth = 1.4;
  context.shadowColor = 'rgba(84, 207, 238, .55)';
  context.shadowBlur = 5;
  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = pulse * 0.45;
  context.beginPath();
  context.arc(center.x, center.y, radius * 0.72, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

export function drawTargetDetailScan(
  context: CanvasRenderingContext2D,
  point: { readonly x: number; readonly y: number },
  radius: number,
  progress: number,
  timeSeconds: number
): void {
  const sweepY = point.y - radius + radius * 2 * progress;
  const pulse = 0.72 + Math.sin(timeSeconds * 18) * 0.2;
  context.save();
  context.strokeStyle = `rgba(116, 235, 248, ${0.68 + pulse * 0.2})`;
  context.lineWidth = 1.4;
  context.shadowColor = 'rgba(91, 223, 244, .78)';
  context.shadowBlur = 7;
  context.beginPath();
  context.arc(point.x, point.y, radius + 5, timeSeconds * 1.8, timeSeconds * 1.8 + Math.PI * 1.35);
  context.stroke();
  context.beginPath();
  context.arc(point.x, point.y, radius + 10, -timeSeconds * 1.25, -timeSeconds * 1.25 + Math.PI * 0.72);
  context.stroke();
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.clip();
  const scannedHeight = Math.max(0, sweepY - (point.y - radius));
  context.fillStyle = 'rgba(79, 211, 233, .075)';
  context.fillRect(point.x - radius, point.y - radius, radius * 2, scannedHeight);
  context.strokeStyle = 'rgba(205, 253, 255, .96)';
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(point.x - radius, sweepY);
  context.lineTo(point.x + radius, sweepY);
  context.stroke();
  context.strokeStyle = 'rgba(93, 224, 244, .26)';
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(point.x - radius, sweepY - 3);
  context.lineTo(point.x + radius, sweepY - 3);
  context.stroke();
  context.restore();
}
