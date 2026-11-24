'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { LocalPirateTraffic } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-local-pirate-service.ts'
);
const { stageLocalPirateCheckpoint } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-local-pirate-checkpoint.ts'
);

const field = new LocalPirateTraffic(4000, 2600, 932);
const pirate = {
  id: 'corsair-background',
  name: 'Corsair',
  shipId: 'ship-raider',
  pirate: true,
  travel: null,
  combatMovement: null,
  hullHp: 100,
  combatRecoverySeconds: 0,
};
field.reconcile([pirate]);
const original = field.snapshot([pirate])[0];
assert(original, 'pirate is initially in the field');

pirate.combatMovement = { targetType: 'npc', targetId: 'miner-other' };
field.reconcile([pirate]);
field.tick(0.1, [pirate], { x: 1700, y: 1300 }, [], [], () => false);
const engaged = field.snapshot([pirate])[0];
assert(engaged, 'background combat must not make a local pirate invisible');
assert.deepEqual(engaged.position, original.position, 'duelling pirate is not AI-moved');
assert.doesNotThrow(() =>
  stageLocalPirateCheckpoint(field.exportState(), 4000, 2600, 932, [pirate])
);

pirate.combatMovement = null;
pirate.combatRecoverySeconds = 6;
field.reconcile([pirate]);
field.tick(0.1, [pirate], { x: 1700, y: 1300 }, [], [], () => false);
assert(field.snapshot([pirate])[0], 'recovery does not remove the local contact');

pirate.combatRecoverySeconds = 0;
field.reconcile([pirate]);
assert(field.snapshot([pirate])[0], 'recovered pirate resumes existing local contact');
assert.equal(field.exportState().ships.length, 1, 'no new ship spawned on recovery');

const model = read('src/app/game-controller-models.ts');
const render = read('src/ui/local-space/local-space-scene-layers.ts');
assert(model.includes('isPirate: contact.pirate'), 'pirates must be tagged in the view-model');
assert(render.includes('this.context.fillText(') && render.includes("'KORSAR'"));
console.log('PASS pirate contact persists through NPC combat and is identified on local map');

const escort = {
  ...pirate,
  id: 'security-drone:field:escort-2',
  job: 'patrol',
  pirate: false,
};
const contacts = [pirate, escort];
field.reconcile(contacts);
field.syncCombatPose(pirate.id, { x: 1800, y: 1100 }, 0);
field.syncCombatPose(escort.id, { x: 1800, y: 1400 }, 0);
pirate.combatMovement = { mode: 'engaged' };
let newDuels = 0;
for (let i = 0; i < 30; i++) {
  field.tick(0.08, contacts, null, [], [], () => {
    newDuels++;
    return true;
  });
}
const escortPosition = field.body(escort.id).position;
const gap = Math.hypot(escortPosition.x - 1800, escortPosition.y - 1100);
assert(gap <= 145, 'escort approaches the active hostile from within sensor range');
assert(gap > 125, 'escort stops within join range without flying into the pirate');
assert.equal(newDuels, 0, 'the already engaged pirate is left to the fleet coordinator');
