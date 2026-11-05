'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const read = (filename) => fs.readFileSync(path.join(root, filename), 'utf8');
const backdropSource = read('src/ui/local-space/asteroid-backdrop-renderer.ts');
const localSpaceSource = read('src/ui/local-space/local-space-renderer.ts');
const spaceBackgroundSource = read('src/ui/space/space-background-renderer.ts');
const surfaceSource = read('src/ui/space/procedural-space-body-renderer.ts');

function createContext() {
  return {
    images: [],
    points: [],
    scale() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    beginPath() {},
    moveTo(x, y) {
      if (this.points.length < 8) this.points.push([x, y]);
    },
    lineTo() {},
    closePath() {},
    fill() {},
    drawImage(...args) {
      this.images.push(args);
    },
  };
}

const generatedCanvases = [];
const fakeDocument = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    const ctx = createContext();
    const canvas = { width: 0, height: 0, getContext: () => ctx };
    generatedCanvases.push({ canvas, ctx });
    return canvas;
  },
};

const compiled = ts.transpileModule(backdropSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleInstance = { exports: {} };
vm.runInNewContext(compiled, {
  module: moduleInstance,
  exports: moduleInstance.exports,
  document: fakeDocument,
});
const { AsteroidBackdropRenderer } = moduleInstance.exports;

const display = createContext();
const backdrop = new AsteroidBackdropRenderer(display, 12345, 4400, 2570);
assert.equal(generatedCanvases.length, 1, 'build one persistent background texture');
assert.equal(generatedCanvases[0].canvas.width, 2048, 'keep backdrop texture bounded');
assert.ok(generatedCanvases[0].ctx.points.length > 0, 'generate rock silhouettes');

const centered = {
  width: 1200,
  height: 800,
  cameraCenter: { x: 2200, y: 1285 },
  cameraZoom: 0.6,
};
backdrop.draw(centered);
backdrop.draw({
  ...centered,
  cameraCenter: { x: 2300, y: 1285 },
});
assert.equal(display.images.length, 2, 'draw only one cached image each frame');
assert.equal(generatedCanvases.length, 1, 'panning must not regenerate the texture');
assert.equal(display.images[0][0], display.images[1][0], 'reuse the same canvas');
assert.ok(display.images.every((image) => image[7] <= centered.width), 'crop to viewport width');
assert.ok(display.images.every((image) => image[8] <= centered.height), 'crop to viewport height');

const horizontalShift = display.images[1][1] - display.images[0][1];
const expectedShift = (100 * 0.72 * 2048) / (4400 * 1.64);
assert.ok(
  Math.abs(horizontalShift - expectedShift) < 0.001,
  'camera movement must use 0.72 parallax rather than world-layer motion'
);

backdrop.draw({ ...centered, cameraZoom: 0 });
assert.equal(display.images.length, 2, 'invalid zoom should not render');

const otherBackdrop = new AsteroidBackdropRenderer(createContext(), 12345, 4400, 2570);
assert.ok(otherBackdrop, 'constructor succeeds with the same deterministic seed');
assert.deepEqual(
  generatedCanvases[0].ctx.points,
  generatedCanvases[1].ctx.points,
  'matching seeds must generate the same rock geometry'
);

assert.ok(localSpaceSource.includes('AsteroidBackdropRenderer'));
assert.ok(
  localSpaceSource.indexOf('this.backgroundRenderer.draw(') <
    localSpaceSource.indexOf('this.asteroidBackdrop.draw(') &&
    localSpaceSource.indexOf('this.asteroidBackdrop.draw(') <
      localSpaceSource.indexOf('const hitAreas: AsteroidHitArea[]'),
  'draw backdrop after stars and before simulated asteroids'
);
assert.ok(
  localSpaceSource.includes('Math.min(2, Math.max(1, window.devicePixelRatio || 1))'),
  'cap the local-space canvas DPR'
);
assert.ok(
  spaceBackgroundSource.includes('this.context.drawImage(cloud.sprite') &&
    spaceBackgroundSource.includes('this.drawNebulaLobe(\n          spriteContext'),
  'nebula gradients must be rendered to reusable sprites'
);
assert.ok(
  surfaceSource.includes('if (options.radius < 5) return;'),
  'small asteroids must skip dynamic gradient lighting'
);
assert.ok(!backdropSource.includes('Math.random'));
assert.ok(!/setInterval|requestAnimationFrame/.test(backdropSource));
assert.ok(!/routeBlocking|applyImpulse|scanLevel/.test(backdropSource));

console.log('PASS cached parallax asteroid backdrop and rendering fast paths');
