'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const effects = loadStandaloneTypeScriptModule(root, 'src/ui/combat/combat-weapon-fx-renderer.ts');
const { AUTOCANNON_ROUNDS, AUTOCANNON_ROUND_INTERVAL, RAIL_LANCE_SECONDS } =
  loadStandaloneTypeScriptModule(root, 'src/core/combat-visual-timings.ts');

const start = { x: 30, y: 50 };
const end = { x: 730, y: 50 };
const arc = effects.ionArcVertices(start, end, 7, 3);
assert.equal(arc.length, 15, 'ion bolt consists of fourteen lightning segments');
assert.deepEqual(arc[0], start, 'ion bolt starts at the hardpoint');
assert.deepEqual(arc.at(-1), end, 'ion bolt ends exactly at the impact');
assert.deepEqual(arc, effects.ionArcVertices(start, end, 7, 3), 'fixed seed is deterministic');
assert.notDeepEqual(
  arc,
  effects.ionArcVertices(start, end, 7, 4),
  'ion bolt should flicker between animation frames'
);

for (const age of [0, 0.2, 0.7, 1.2]) {
  for (let index = 1; index <= 32; index += 1) {
    const point = effects.railLanceParticle(start, end, index, age);
    assert(point.x >= start.x && point.x <= end.x, 'micro particle stays along the rail lane');
    assert(Math.abs(point.y - 50) < 3.5, 'micro particle must orbit tightly, not fly away');
  }
}

const volley = [];
const flightSeconds = 0.7;
for (let index = 0; index < AUTOCANNON_ROUNDS; index += 1) {
  const spawn = index * AUTOCANNON_ROUND_INTERVAL + 0.001;
  const positions = effects.autocannonTracers(spawn, flightSeconds);
  assert(
    positions.some((tracer) => tracer.index === index && tracer.progress > 0),
    'every round in the seven-shot burst has its own emission'
  );
  volley.push(index);
}
assert.equal(volley.length, 7, 'autocannon always fires seven *visual* streaks');
assert.equal(effects.autocannonTracers(-0.1, 0.7).length, 0);
assert.equal(effects.autocannonTracers(3, 0.7).length, 0);

function mockContext() {
  const strokes = [];
  const fills = [];
  const context = {
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    ellipse() {},
    arc() {},
    stroke() {
      strokes.push({ opacity: this.globalAlpha, width: this.lineWidth });
    },
    fill() {
      fills.push({ opacity: this.globalAlpha });
    },
  };
  return { context, strokes, fills };
}

const initial = mockContext();
effects.drawRailgunLance(initial.context, start, end, 0.15);
assert(initial.strokes.length >= 3, 'railgun renders multiple glow layers');
assert(initial.fills.length >= 40, 'railgun renders both vapor and fine particles');
const late = mockContext();
effects.drawRailgunLance(late.context, start, end, 1.15);
assert(late.strokes.length >= 3, 'white rail trail lingers past the first second');
assert(
  late.strokes[2].opacity < initial.strokes[2].opacity,
  'the entire luminous lance fades smoothly'
);
assert.equal(RAIL_LANCE_SECONDS, 1.35);
const flechettes = mockContext();
effects.drawVisionFrontRepeater(flechettes.context, start, end, 0.075);
assert(
  flechettes.strokes.length >= 8,
  'one repeater fire event renders overlapping prismatic flechettes'
);
const shattered = mockContext();
effects.drawVisionRepeaterImpact(shattered.context, end, 0.1, 13, false);
assert(shattered.strokes.length >= 8, 'hull strike fractures into violet shards');

const burst = mockContext();
effects.drawAutocannonBurst(burst.context, start, end, 0.25, 0.7);
assert(burst.strokes.length >= 4, 'overlapping tracer rounds are actually rendered');
const empty = mockContext();
effects.drawAutocannonBurst(empty.context, start, end, 3, 0.7);
assert.equal(empty.strokes.length, 0, 'completed autocannon bursts leave no ghost tracers');

const gameplay = fs.readFileSync(
  path.join(root, 'src/systems/combat/strategic-combat-weapons.ts'),
  'utf8'
);
const snapshot = fs.readFileSync(
  path.join(root, 'src/systems/combat/strategic-combat-service.ts'),
  'utf8'
);
const renderer = fs.readFileSync(
  path.join(root, 'src/ui/combat/strategic-combat-renderer.ts'),
  'utf8'
);
const nativeBeam = fs.readFileSync(
  path.join(root, 'src/ui/combat/combat-beam-visual.ts'),
  'utf8'
);
assert(gameplay.includes('origin: { ...muzzle }'), 'projectiles remember actual weapon muzzles');
assert(snapshot.includes('origin: { ...projectile.origin }'), 'origin is detached in snapshots');
assert(renderer.includes('drawCombatBeamVisual(') && nativeBeam.includes('drawIonCannonArc('), 'game renderer dispatches ion cannon lightning');
assert(renderer.includes('drawCombatBeamVisual(') && nativeBeam.includes('drawRailgunLance('), 'game renderer dispatches railgun lance');
assert(
  renderer.includes('drawVisionAutocannon('),
  'game renderer dispatches upgraded seven-round autocannon salvo'
);
assert(
  !gameplay.includes('AUTOCANNON_ROUNDS'),
  'seven visual rounds must never multiply physical damage or ammunition usage'
);

console.log('PASS weapon FX flight, particles, fade, seven-shot cadence and renderer integration');
