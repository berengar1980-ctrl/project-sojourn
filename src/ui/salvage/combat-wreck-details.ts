import type { ContainerMesh } from './salvage-container-mesh';
import { C, fragment, shell, strut } from './combat-wreck-geometry';

/**
 * Fixed, deterministic close-up detail for destroyed ships. Faces are built
 * once with the ship mesh; no random number generation or per-frame allocation.
 * These are physical-looking plates, exposed conduits and fractured girders,
 * not textures enlarged from a distant sprite.
 */
export function addCombatWreckDetail(m: ContainerMesh, variant: number): void {
  const regions: readonly (readonly [number, number, number, number])[][] = [
    [[-2.48, -0.15, 1.75, 0.56]],
    [[-1.82, 0.08, 1.5, 0.37]],
    [[-2.25, -0.1, 2.05, 0.57]],
    [[-2.58, 0.01, 0.67, 0.47], [1.64, 0.08, 0.66, 0.42]],
    [[-1.35, 0, 1.12, 0.39]],
  ];
  const areas = regions[variant] ?? regions[0]!;
  for (const [centerX, centerY, length, halfWidth] of areas) {
    for (let i = 0; i < 17; i += 1) {
      const t = i / 17;
      const x = centerX - length / 2 + t * length;
      const y = centerY + Math.sin(i * 2.12 + variant) * halfWidth * 0.42;
      const side = i % 2 ? 1 : -1;
      const z = 0.59 + (i % 3) * 0.012;
      m.box(x, y, z, 0.08 + (i % 4) * 0.047, 0.12 + (i % 3) * 0.08, 0.018,
        i % 7 === 0 ? C.steel : i % 3 === 0 ? C.dark : C.iron);
      if (i % 2 === 0) {
        strut(m, x, centerY, x + 0.11, centerY + side * halfWidth * 0.61, z + 0.025,
          0.011, i % 4 === 0 ? C.steel : C.dark);
      }
      if (i % 4 === 0) {
        m.box(x, y + side * 0.1, z + 0.035, 0.022, 0.045, 0.017, C.steel);
      }
    }
    for (let j = 0; j < 3; j += 1) {
      const y = centerY + (j - 1) * halfWidth * 0.54;
      strut(m, centerX - length * 0.47, y,
        centerX + length * 0.44, y + (j - 1) * 0.05, 0.66,
        0.018, j === 1 ? C.char : C.steel);
    }
  }

  // Exposed broken spars project beyond the body and vary per silhouette.
  for (let i = 0; i < 8; i += 1) {
    const angle = i * 2.399963 + variant * 0.47;
    const x = Math.cos(angle) * (0.58 + (i % 4) * 0.15);
    const y = Math.sin(angle) * (0.48 + (i % 3) * 0.18);
    strut(m, x, y, x + Math.cos(angle + 0.4) * 0.72,
      y + Math.sin(angle + 0.4) * 0.65, 0.24, 0.025, i % 3 ? C.dark : C.steel);
  }
  // Jagged raised hull tears and layers of soot, never orange-painted rust.
  for (let i = 0; i < 6; i += 1) {
    const x = -0.7 + i * 0.26 + variant * 0.055;
    const y = (i % 2 ? -1 : 1) * (0.14 + (i % 3) * 0.13);
    shell(m, [
      [x - 0.18, y - 0.13], [x + 0.09, y - 0.1],
      [x + 0.2, y + 0.07], [x - 0.08, y + 0.16]
    ], 0.39, 0.48, i % 2 ? C.char : C.iron);
  }
}

