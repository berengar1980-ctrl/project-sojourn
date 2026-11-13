'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { SectorLegalRegistry, PENAL_LABOR_CREDITS_PER_DAY } =
  loadStandaloneTypeScriptModule(root, 'src/systems/operations/sector-legal-registry.ts');

function registrationAndFraudTest() {
  const law = new SectorLegalRegistry();
  const player = law.registerShip('ship-player', 'player');
  const rival = law.registerShip('ship-rival', 'npc-rival');
  assert(player.transponder.startsWith('TD-'));
  assert.notEqual(player.transponder, rival.transponder);
  assert.deepEqual(law.registerShip('ship-player', 'player'), player);
  assert(law.forgeTransponder('ship-player', 'FAL-100'));
  assert.equal(law.registration('ship-player').originalTransponder, player.transponder);
  assert.equal(law.registration('ship-player').shipId, 'ship-player');
  assert.equal(law.forgeTransponder('ship-rival', 'FAL-100'), false);
}

function detentionDaysAndCreditorsTest() {
  const law = new SectorLegalRegistry();
  law.registerShip('ship-player', 'player');
  law.reportOffense('ship-player', 'miner-1', 'Konzessionsdiebstahl', 1200, 4);
  law.reportOffense('ship-player', 'directorate', 'Widerstand', 300, 4);
  let days = 0;
  const ledger = new Map();
  const result = law.detain('ship-player', 100,
    () => { days += 1; },
    (ownerId, credits) => ledger.set(ownerId, (ledger.get(ownerId) || 0) + credits),
    PENAL_LABOR_CREDITS_PER_DAY
  );
  assert.equal(result.detained, true);
  assert.equal(days, 4);
  assert.equal(result.days, 4);
  assert.equal(result.confiscated, 100);
  assert.equal(result.laborCredits, 1400);
  assert.equal(result.released, true);
  assert.equal(law.debt('ship-player'), 0);
  assert.equal(law.isWanted('ship-player'), false);
  assert.equal(ledger.get('miner-1'), 1200);
  assert.equal(ledger.get('directorate'), 300);
  const again = law.detain('ship-player', 100,
    () => { throw new Error('Already settled'); },
    () => { throw new Error('Double payout'); }
  );
  assert.equal(again.detained, false);
}

function sightingsRequireOutstandingDebtTest() {
  const law = new SectorLegalRegistry();
  law.registerShip('player-ship', 'player');
  assert.equal(law.reportSighting('player-ship', 'haven', 1, 'arrival'), null);
  law.reportOffense('player-ship', 'miner', 'Raubbau', 900, 2);
  const report = law.reportSighting('player-ship', 'meridian-exchange', 3, 'arrival');
  assert.equal(report.locationId, 'meridian-exchange');
  assert.equal(report.destinationId, null);
  const departure = law.reportSighting('player-ship', 'meridian-exchange', 3, 'departure', 'niveus');
  assert.equal(departure.destinationId, 'niveus');
  const snapshot = law.snapshot();
  snapshot.charges[0].paid = 900;
  assert.equal(law.debt('player-ship'), 900, 'Snapshot must be detached');
  law.settle('player-ship', 900);
  assert.equal(law.reportSighting('player-ship', 'niveus', 4, 'arrival'), null);
}
function serializationTest() {
  const legal = new SectorLegalRegistry();
  legal.registerShip('ship-1', 'npc-1');
  legal.reportOffense('ship-1', 'player', 'Raubbau', 500, 7);
  legal.settle('ship-1', 120);
  legal.reportSighting('ship-1', 'haven', 8, 'arrival');
  const saved = JSON.parse(JSON.stringify(legal.exportState()));
  const loaded = new SectorLegalRegistry();
  assert(loaded.restoreState(saved));
  assert.equal(loaded.registration('ship-1').ownerId, 'npc-1');
  assert.equal(loaded.debt('ship-1'), 380);
  assert.equal(loaded.latestSighting('ship-1').locationId, 'haven');
  loaded.reportOffense('ship-1', 'directorate', 'Flucht', 100, 9);
  assert.equal(loaded.snapshot().charges[1].id, 'charge-2',
    'Restored sequence must not collide with existing charges');
}
registrationAndFraudTest();
serializationTest();
detentionDaysAndCreditorsTest();
sightingsRequireOutstandingDebtTest();
