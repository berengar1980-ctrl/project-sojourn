'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { SectorLegalRegistry } = load('src/systems/operations/sector-legal-registry.ts');
const { captureCareerCustody, stageCareerCustody } = load(
  'src/systems/persistence/career-custody-checkpoint.ts'
);
const legal = new SectorLegalRegistry();
const npc = { id: 'criminal', shipId: 'raider-1' };
const npcShipId = npc.shipId + ':' + npc.id;
for (const [shipId, owner] of [['player-ship', 'player'], [npcShipId, npc.id]]) {
  legal.registerShip(shipId, owner);
  assert(legal.reportOffense(shipId, 'directorate', 'unpaid fine', 3500, 4, shipId + '-incident'));
  assert(legal.declareWanted(shipId));
  assert(legal.beginCustody(shipId));
}
const saved = captureCareerCustody(new Set([npc.id]), {
  shipId: 'player-ship',
  days: 2,
  laborCredits: 700,
  accumulator: 0.5,
});
const restored = stageCareerCustody(
  JSON.parse(JSON.stringify(saved)),
  legal,
  [npc],
  'player-ship'
);
assert.deepEqual([...restored.prisoners], ['criminal']);
assert.equal(restored.player.days, 2);
assert.equal(restored.player.laborCredits, 700);
assert.equal(legal.debt('player-ship'), 3500, 'restore must not reapply labor payments');
const missing = { ...saved, prisoners: ['unknown'] };
assert.throws(() => stageCareerCustody(missing, legal, [npc], 'player-ship'), /custody/);
const wrong = { ...saved, player: { ...saved.player, shipId: 'unknown' } };
assert.throws(() => stageCareerCustody(wrong, legal, [npc], 'player-ship'), /custody/);
assert.deepEqual(captureCareerCustody(new Set([npc.id]), saved.player), saved);
console.log('PASS career custody: prisoner identities, accrued labor and no duplicate charges');
