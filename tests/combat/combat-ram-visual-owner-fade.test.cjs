'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (module) => loadStandaloneTypeScriptModule(root, module);
const { applyCombatRamImpact } = load('src/systems/combat/combat-ram-impact.ts');
const { shipContact } = load('src/systems/combat/combat-ship-contact-geometry.ts');
const { drawCombatRamEffect, ramCameraImpulse } = load(
  'src/ui/combat/combat-ram-effect-renderer.ts'
);
const { CombatEffectClock } = load('src/ui/combat/combat-effect-clock.ts');
const { drawCombatImpactBatch } = load('src/ui/combat/combat-impact-visual-batch.ts');

const vessel = (x, vx, heading) => ({
  position: { x, y: 500 },
  velocity: { x: vx, y: 0 },
  headingRadians: heading,
  setup: { shipId: 'patrol-60m-variant-01' },
  shieldHp: 100,
  hullHp: 200,
  subsystems: { engine: 200 },
});
const collide = (attacker, defender) => {
  const runtime = {
    attacker,
    defender,
    elapsedSeconds: 2,
    impactSerial: 0,
    recentImpacts: [],
    lastImpact: null,
    combatLog: [],
  };
  const contact = shipContact(attacker, defender);
  assert(contact.distance <= contact.required, 'the ram fixture starts in physical contact');
  assert(applyCombatRamImpact(runtime) > 0);
  assert.equal(runtime.recentImpacts.length, 1, 'one local contact spark per collision');
  assert.equal(runtime.lastImpact, null, 'contact spark does not replace real weapon impact');
  assert.equal(runtime.combatLog.length, 1, 'no duplicate damage report');
  return runtime;
};

const attacker = vessel(200, 160, 0);
const defender = vessel(240, -20, Math.PI / 2);
attacker.ramApproach = { side: 1, phase: 'impact' };
const contact = collide(attacker, defender);
assert.equal(attacker.ramImpactAt, 2, 'only the attacking bow owns the white ram flash');
assert.equal(defender.ramImpactAt, undefined, 'ram victim never inherits ram flash');
assert.equal(contact.recentImpacts[0].target, 'defender');
assert.equal(contact.recentImpacts[0].layer, 'shield');
assert.equal(contact.recentImpacts[0].serial, 1);
assert(contact.recentImpacts[0].position.x > 200);
assert(contact.recentImpacts[0].position.x < 240);

const reverseAttacker = vessel(200, 20, 0);
const reverseDefender = vessel(240, -160, Math.PI);
reverseDefender.ramApproach = { side: -1, phase: 'impact' };
const reverse = collide(reverseAttacker, reverseDefender);
assert.equal(reverseAttacker.ramImpactAt, undefined);
assert.equal(reverseDefender.ramImpactAt, 2);
assert.equal(reverse.recentImpacts[0].target, 'attacker');

const accidentalAttacker = vessel(200, 160, 0);
const accidentalDefender = vessel(240, -20, Math.PI);
collide(accidentalAttacker, accidentalDefender);
assert.equal(accidentalAttacker.ramImpactAt, undefined, 'incidental bumps have no special flash');
assert.equal(accidentalDefender.ramImpactAt, undefined);

const geometry = { center: { x: 150, y: 170 }, width: 60, height: 30, angle: 0 };
const canvas = {
  arcs: 0,
  strokes: 0,
  save() {},
  restore() {},
  translate() {},
  rotate() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  arc() {
    this.arcs += 1;
  },
  stroke() {
    this.strokes += 1;
  },
};
drawCombatRamEffect(canvas, { ramImpactAt: 2 }, geometry, 2.1);
assert(canvas.arcs > 0, 'own bow still shows its brief flash');
const count = canvas.strokes;
drawCombatRamEffect(canvas, { ramImpactAt: undefined }, geometry, 2.1);
assert.equal(canvas.strokes, count, 'hit victim cannot render the same white flash');
drawCombatRamEffect(canvas, { ramImpactAt: 2 }, geometry, 2.6);
assert.equal(canvas.strokes, count, 'ram flash fades away after 320 milliseconds');

const clock = new CombatEffectClock();
clock.update(4, false, 10);
assert.equal(clock.elapsed(10.5), 4, 'in combat effects follow simulation time');
clock.update(4.08, true, 11);
assert.equal(clock.elapsed(11), 4.08);
assert(Math.abs(clock.elapsed(11.5) - 4.58) < 0.000001);
assert.deepEqual(
  ramCameraImpulse({ ramImpactAt: 4.08 }, {}, clock.elapsed(11.5)),
  { x: 0, y: 0 },
  'camera flash also fades after victory'
);
const previous = canvas.strokes;
drawCombatRamEffect(canvas, { ramImpactAt: 4.08 }, geometry, clock.elapsed(11.5));
assert.equal(canvas.strokes, previous, 'ram flash never stays frozen after combat');
clock.update(4.08, true, 11.7);
assert(Math.abs(clock.elapsed(12) - 5.08) < 0.000001);
clock.update(5, false, 12.1);
assert.equal(clock.elapsed(20), 5, 'a new live combat resets the visual clock');

const impact = {
  serial: 1,
  target: 'defender',
  layer: 'hull',
  position: { x: 120, y: 140 },
  damage: 12,
};
drawCombatImpactBatch(
  canvas,
  [{ impact, startedAt: 4.08 }],
  5.08,
  (position) => position,
  () => 40
);
assert.equal(canvas.strokes, previous, 'normal contact also fades after combat ends');
console.log('PASS visual ram ownership, ordinary collision spark and post-win effect timeout');
