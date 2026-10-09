'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const grapple = loadStandaloneTypeScriptModule(
  root, 'src/systems/combat/combat-grapple-service.ts'
);
assert.equal(grapple.grappleChance(100, 100), 0.3);
assert.equal(grapple.grappleChance(15, 100), 0.6);
assert.equal(grapple.grappleChance(0, 100), 0.6);
assert(grapple.grappleChance(50, 100) > 0.3);
assert(grapple.grappleChance(50, 100) < 0.6);

const origin = { x: 300, y: 400 };
const target = { x: 650, y: 400 };
assert.equal(grapple.fireCombatGrapple('attacker', origin, target, 1, 100, 100, false, () => 0), null);
assert.equal(grapple.fireCombatGrapple('attacker', origin, target, 0, 100, 100, true, () => 0), null);
const success = grapple.fireCombatGrapple('attacker', origin, target, 0, 100, 100, false, () => 0.29);
assert.equal(success.success, true);
const miss = grapple.fireCombatGrapple('attacker', origin, target, 0, 100, 100, false, () => 0.31);
assert.equal(miss.success, false);
assert(grapple.advanceCombatGrapple(success, origin, target, 0.65).resolved);

const combat = loadStandaloneTypeScriptModule(
  root, 'src/systems/combat/strategic-combat-service.ts'
);
const ship = (id, aiControlled = false) => ({
  id, name: id, shipId: 'patrol-60m-variant-01', shieldHp: 0, hullHp: 100,
  weapons: [], hitChance: 0.6, dodgeChance: 0.1,
  damageMultiplier: 1, criticalChance: 0, cycleTimeMultiplier: 1,
  aiControlled, combatSpeed: 10,
});
const arena = {
  width: 1200, height: 800,
  attackerPosition: { x: 450, y: 400 },
  defenderPosition: { x: 650, y: 400 },
};
let victorious = false;
for (let seed = 1; seed <= 20 && !victorious; seed += 1) {
  const fight = combat.createStrategicCombatService(ship('player'), ship('npc'), seed, arena);
  assert.equal(fight.fireGrapple('attacker'), true);
  assert.equal(fight.fireGrapple('attacker'), false, 'only one shot permitted');
  if (!fight.getSnapshot().grapple.success) continue;
  for (let i = 0; i < 250 && !fight.getSnapshot().winner; i += 1) fight.tick(0.08);
  assert.equal(fight.getSnapshot().boardingInitiator, 'attacker');
  victorious = true;
}
assert(victorious, 'successful grapple must lead to boarding');

const npcFight = combat.createStrategicCombatService(
  ship('player'), ship('npc', true), 5, arena
);
npcFight.tick(0.08);
assert.equal(npcFight.getSnapshot().grappleUsed.defender, true, 'NPC must also launch a grapple');

const roster = loadStandaloneTypeScriptModule(
  root, 'src/systems/crew/crew-roster-service.ts'
).createCrewRosterService();
assert.deepEqual(roster.boardingEquipment(), []);
roster.grantBoardingEquipment('off_autopistol');
assert.deepEqual(roster.boardingEquipment(), ['off_autopistol']);

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
assert(read('src/ui/combat/strategic-combat-panel.ts').includes("combat.fireGrapple('attacker')"));
assert(read('src/ui/combat/combat-grapple-renderer.ts').includes('bounce'));
assert(read('src/app/game-controller.ts').includes('startCombatBoarding(context, snapshot'));
assert(read('src/app/game-controller-combat-boarding.ts').includes('grantBoardingEquipment('));
assert(read('src/app/game-controller-combat-boarding.ts').includes("id: 'off_autopistol'"));
assert(!read('src/systems/combat/star-map-engagement-service.ts').includes('grantBoardingEquipment('));
console.log('PASS once-only combat hooks, 30–60% chance, NPC attack, boarding and gear-only-on-boarding');
