'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createAsteroidTexture, hashSeed } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/space/procedural-surface-textures.ts'
);

// Reference implementation from before the raster reuse optimization.
function smooth(value) {
  return value * value * (3 - 2 * value);
}

function lattice(seed, x, y) {
  let value = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(seed, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = lattice(seed, x0, y0);
  const b = lattice(seed, x0 + 1, y0);
  const c = lattice(seed, x0, y0 + 1);
  const d = lattice(seed, x0 + 1, y0 + 1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function fbm(seed, x, y, octaves) {
  let value = 0;
  let amplitude = 0.58;
  let frequency = 1;
  let normalization = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    value += valueNoise(seed + octave * 1013, x * frequency, y * frequency) * amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
    frequency *= 2.07;
  }

  return value / normalization;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mixChannel(a, b, amount) {
  return a + (b - a) * amount;
}

function paintPixel(data, index, first, second, mix, brightness, alpha = 255) {
  data[index] = clampByte(mixChannel(first[0] ?? 0, second[0] ?? 0, mix) * brightness);
  data[index + 1] = clampByte(mixChannel(first[1] ?? 0, second[1] ?? 0, mix) * brightness);
  data[index + 2] = clampByte(mixChannel(first[2] ?? 0, second[2] ?? 0, mix) * brightness);
  data[index + 3] = alpha;
}

function asteroidTextureSize(kind, detail) {
  if (detail === 'far') return kind === 'debris' ? 48 : 64;
  if (detail === 'near') return kind === 'debris' ? 160 : 320;
  return kind === 'debris' ? 64 : 160;
}

function legacyTexture(id, kind, detail = 'normal') {
  const size = asteroidTextureSize(kind, detail);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Asteroid texture canvas unavailable.');

  const image = context.createImageData(size, size);
  const seed = hashSeed(id + ':stone');
  const dark = kind === 'debris' ? [46, 44, 42] : [54, 51, 48];
  const light = kind === 'debris' ? [116, 109, 101] : [137, 129, 119];
  const coarseOctaves = detail === 'near' ? 6 : detail === 'far' ? 4 : 5;
  const fineFrequency = detail === 'near' ? 10.5 : detail === 'far' ? 5.4 : 7.5;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x / (size - 1)) * 2 - 1;
      const ny = (y / (size - 1)) * 2 - 1;
      const index = (y * size + x) * 4;
      const coarse = fbm(seed, nx * 2.4 + 11, ny * 2.4 - 7, coarseOctaves);
      const fine = fbm(seed + 701, nx * fineFrequency, ny * fineFrequency, 3);
      const micro = detail === 'near' ? fbm(seed + 1301, nx * 22, ny * 22, 2) : 0.5;
      const ridge = Math.abs(fine - 0.5) * 2;
      const material = Math.max(0, Math.min(1, coarse * 0.72 + fine * 0.22 + micro * 0.06));
      const brightness = 0.79 + ridge * 0.17 + (micro - 0.5) * 0.12;
      paintPixel(image.data, index, dark, light, material, brightness);
    }
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

global.document = {
  createElement() {
    const canvas = {
      getContext() {
        return {
          createImageData(width, height) {
            return { data: new Uint8ClampedArray(width * height * 4) };
          },
          putImageData(image) {
            canvas.pixels = image.data;
          },
        };
      },
    };
    return canvas;
  },
};
for (const kind of ['resource', 'debris']) {
  for (const detail of ['far', 'normal', 'near']) {
    const id = 'texture-parity-' + kind;
    assert.deepEqual(
      createAsteroidTexture(id, kind, detail).pixels,
      legacyTexture(id, kind, detail).pixels,
      kind + ' ' + detail + ' must preserve every RGBA byte'
    );
  }
}
delete global.document;
console.log('PASS asteroid raster reuse preserves all texture detail levels byte for byte');
