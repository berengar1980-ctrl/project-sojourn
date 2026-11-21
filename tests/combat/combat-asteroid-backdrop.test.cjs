'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { CombatAsteroidBackdrop } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/combat/combat-asteroid-backdrop.ts'
);
const { CombatCamera } = loadStandaloneTypeScriptModule(root, 'src/ui/combat/combat-camera.ts');
const { AsteroidBackdropRenderer } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/space/asteroid-backdrop-renderer.ts'
);

function makeContext() {
  return {
    canvas: { clientWidth: 1200, clientHeight: 800 },
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

const generated = [];
const previousDocument = global.document;
global.document = {
  createElement(name) {
    assert.equal(name, 'canvas');
    const context = makeContext();
    const canvas = { width: 0, height: 0, getContext: () => context };
    generated.push({ canvas, context });
    return canvas;
  },
};

try {
  const width = 3000;
  const height = 1900;
  const rock = {
    id: 'real-ore',
    kind: 'resource',
    position: { x: 500, y: 600 },
    radius: 48,
  };
  const screen = makeContext();
  const empty = new CombatAsteroidBackdrop(screen, { width, height, asteroids: [] });
  const scrap = new CombatAsteroidBackdrop(screen, {
    width,
    height,
    asteroids: [{ ...rock, sectionVariant: 'heavy-hull' }],
  });
  const camera = new CombatCamera();
  empty.draw(1200, 800, camera);
  scrap.draw(1200, 800, camera);
  assert.equal(generated.length, 0, 'empty space and scrap maps never generate rock textures');
  assert.equal(screen.images.length, 0, 'empty space and scrap maps never draw rock textures');

  const arena = { width, height, asteroids: [rock], backdropSeed: 917 };
  const field = new CombatAsteroidBackdrop(screen, arena);
  assert.equal(generated.length, 1, 'real rock field prepares exactly one cached canvas');
  field.draw(1200, 800, camera);
  camera.pan(110, 0);
  field.draw(1200, 800, camera);
  assert.equal(screen.images.length, 2, 'draw one background image per combat frame');
  assert.equal(screen.images[0][0], screen.images[1][0], 'pan must reuse cached texture');
  assert.ok(
    screen.images[1][1] < screen.images[0][1],
    'camera pan right must move backdrop right more slowly than the real rocks'
  );
  assert.ok(
    screen.images.every((args) => args[7] <= 1200),
    'clip source to viewport width'
  );
  assert.ok(
    screen.images.every((args) => args[8] <= 800),
    'clip source to viewport height'
  );
  camera.zoomAt(1.4, 600, 400, 1200, 800);
  field.draw(1200, 800, camera);
  assert.equal(generated.length, 1, 'zoom must never rebuild the texture');

  const reference = new AsteroidBackdropRenderer(makeContext(), arena.backdropSeed, width, height);
  assert.ok(reference, 'same reusable renderer is available to local mining');
  assert.deepEqual(
    generated[0].context.points,
    generated[1].context.points,
    'campaign mining and its combat use exactly the same seeded rock silhouettes'
  );
} finally {
  global.document = previousDocument;
}

const combat = read('src/ui/combat/strategic-combat-renderer.ts');
const background = read('src/ui/combat/combat-asteroid-backdrop.ts');
const controller = read('src/app/game-controller-combat.ts');
const fieldAdapter = read('src/systems/combat/field-combat-arena.ts');
const service = read('src/systems/combat/strategic-combat-service.ts');
const snapshot = read('src/systems/combat/strategic-combat-runtime-snapshot.ts');
const arena = read('src/systems/combat/strategic-combat-arena.ts');
const pvp = read('src/systems/combat/duel-arena-presets.ts');
const rockPainter = read('src/ui/combat/combat-asteroid-renderer.ts');

assert.ok(
  combat.indexOf('this.asteroidBackdrop.draw(') < combat.indexOf('drawCombatAsteroids('),
  'background must render behind physical combat asteroids'
);
assert.ok(
  combat.includes('Math.min(2, Math.max(1, window.devicePixelRatio || 1))'),
  'both campaign and PvP combat cap high-DPI canvas resolution'
);
assert.ok(background.includes('cameraZoomY: zoomY'), 'account for combat X/Y camera scaling');
assert.ok(
  controller.includes('field-combat-arena') && fieldAdapter.includes('backdropSeed: instance.seed'),
  'mining combat keeps the native field seed through the shared adapter'
);
assert.ok(service.includes("from './strategic-combat-runtime-snapshot'"), 'combat service uses the shared native snapshot');
assert.ok(snapshot.includes('runtime.arena.backdropSeed'), 'snapshot carries field seed');
assert.ok(arena.includes('arenaOptions.backdropSeed'), 'arena preserves field seed');
assert.ok(
  pvp.includes('generateMiningSpace') && pvp.includes('miningFieldCombatArena(field'),
  'PvP must pass the campaign field and its original seed to the same adapter'
);
assert.ok(
  rockPainter.includes('const viewportWidth = context?.canvas.clientWidth') &&
    rockPainter.indexOf('center.x < -radius * 2') < rockPainter.indexOf('renderer.drawAsteroid('),
  'all combat asteroids are culled offscreen before expensive procedural drawing'
);

console.log('PASS combat asteroid depth for campaign and PvP, excluding empty/scrap maps');
