'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { DistressDamageParticles } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/salvage/distress-damage-particles.ts'
);
const camera = { worldToScreen: (p) => p, scale: (n) => n };

function simulate(hullFraction) {
  const system = new DistressDamageParticles();
  let smoke = 0;
  let fire = 0;
  const context = {
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    set globalAlpha(_) {},
    set fillStyle(value) {
      this.color = value;
    },
    fill() {
      if (this.color === '#6b7172') smoke += 1;
      if (this.color === '#ff7b2e') fire += 1;
    },
  };
  for (let i = 1; i <= 100; i += 1) {
    system.update(i * 0.05, { x: i * 2, y: 300 }, 0, 80, camera, context, 800, 600, hullFraction);
  }
  return { smoke, fire };
}
const healthy = simulate(0.86);
const slight = simulate(0.85);
const substantial = simulate(0.65);
const burning = simulate(0.45);
const critical = simulate(0.25);
assert.equal(healthy.smoke, 0, 'no smoke above 85% hull');
assert(slight.smoke > 0, 'first small source starts at 85%');
assert(substantial.smoke > slight.smoke, 'large smoke source starts at 65%');
assert.equal(substantial.fire, 0, 'no fire above 45%');
assert(burning.fire > 0, 'the large source burns from 45% hull');
assert(critical.smoke > burning.smoke, 'third small smoke source starts at 25%');

const render = fs.readFileSync(
  path.join(root, 'src/ui/combat/strategic-combat-renderer.ts'),
  'utf8'
);
assert(render.includes('drawCombatDamagePair('), 'combat renderer must use the shared damage helper');
assert(
  render.includes('[this.model.attacker, this.model.defender]'),
  'player and NPC combatants must both receive hull damage effects'
);
const helper = fs.readFileSync(path.join(root, 'src/ui/combat/combat-damage-visual.ts'), 'utf8');
assert(helper.includes('for (const combatant of combatants)'), 'both sides must render damage');
assert(helper.includes('particles.update('), 'damage helper must advance real particles');
console.log('PASS staged hull damage smoke at 85/65/25%, flames at 45%, player and NPC rendering');
