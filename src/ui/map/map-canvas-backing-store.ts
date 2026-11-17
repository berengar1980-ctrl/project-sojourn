/** Resizes an actual canvas pixel buffer only when its dimensions change. */
export function resizeMapCanvasBackingStore(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  ratio: number
): void {
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width === pixelWidth && canvas.height === pixelHeight) return;
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}
