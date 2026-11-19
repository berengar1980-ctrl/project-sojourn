/** Deterministic multi-stage vacuum breakup, shared by native and embedded combat. */
export function drawShipDestruction(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  seconds: number,
  seed = 0
): void {
  if (seconds < 0 || seconds > 2.8) return;
  const size = Math.max(10, radius);
  ctx.save();
  // A short energetic flash followed by expanding hot gas, not a persistent fireball.
  const flash = Math.max(0, 1 - seconds / 0.22);
  if (flash > 0) {
    ctx.globalAlpha = flash * 0.92;
    ctx.shadowColor = '#ffb25d';
    ctx.shadowBlur = size * 0.8;
    ctx.fillStyle = '#fff2cf';
    ctx.beginPath();
    ctx.arc(x, y, size * (0.24 + seconds * 1.8), 0, Math.PI * 2);
    ctx.fill();
  }
  // Several delayed ruptures along the hull.
  for (let i = 0; i < 4; i++) {
    const start = i * 0.105;
    const age = seconds - start;
    if (age < 0 || age > 0.95) continue;
    const phase = age / 0.95;
    const angle = i * 2.39996 + seed;
    const offset = size * 0.25;
    const px = x + Math.cos(angle) * offset;
    const py = y + Math.sin(angle) * offset;
    const glow = ctx.createRadialGradient(px, py, 0, px, py, size * (0.25 + phase * 1.35));
    glow.addColorStop(0, 'rgba(255,210,130,' + (0.65 * (1 - phase)) + ')');
    glow.addColorStop(0.28, 'rgba(246,100,39,' + (0.5 * (1 - phase)) + ')');
    glow.addColorStop(1, 'rgba(83,79,77,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, size * (0.25 + phase * 1.35), 0, Math.PI * 2);
    ctx.fill();
  }
  // Debris keeps moving outwards after the bright flash has died.
  for (let i = 0; i < 30; i++) {
    const angle = i * 2.399963 + seed;
    const speed = 0.55 + (i % 7) * 0.14;
    const distance = size * (0.15 + seconds * speed);
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance;
    const fade = Math.max(0, 1 - seconds / (1.3 + (i % 5) * 0.35));
    if (fade <= 0) continue;
    ctx.globalAlpha = fade * (i % 3 === 0 ? 0.8 : 0.65);
    ctx.fillStyle = i % 4 === 0 ? '#ffb46c' : '#737c80';
    const fragment = Math.max(1, size * (0.015 + (i % 4) * 0.009));
    ctx.fillRect(px - fragment / 2, py - fragment / 2, fragment, fragment * 1.8);
  }
  ctx.restore();
}
