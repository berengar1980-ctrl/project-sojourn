'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { SectorLegalRegistry } = load('src/systems/operations/sector-legal-registry.ts');
const { settleLegalDebt } = load('src/app/game-controller-legal-ledger.ts');
const { AsteroidClaimRegistry } = load('src/systems/operations/asteroid-claim-registry.ts');

function paymentFixture() {
  const legal = new SectorLegalRegistry();
  legal.registerShip('player-hull', 'player');
  legal.registerShip('miner-hull:miner', 'miner');
  const player = { credits: 1000 };
  const miner = { id: 'miner', credits: 800 };
  const logs = [];
  return {
    legal, player, miner, logs,
    context: {
      economy: {
        legal,
        trade: { player },
        sectorNpcs: { npcs: [miner] },
      },
      systemLog: { write: (message) => logs.push(message) },
    },
  };
}

function sameLedgerForPlayerAndNpc() {
  const f = paymentFixture();
  f.legal.reportOffense('player-hull', 'miner', 'Raubbau', 450, 2, 'claim:player:1');
  f.legal.reportOffense('miner-hull:miner', 'player', 'Raubbau', 350, 2, 'claim:miner:1');
  assert.equal(f.legal.status('player-hull'), 'demand');
  assert.equal(f.legal.status('miner-hull:miner'), 'demand');
  assert.deepEqual(settleLegalDebt(f.context, 'player-hull', f.player), {
    paid: 450, remainingDebt: 0,
  });
  assert.equal(f.player.credits, 550);
  assert.equal(f.miner.credits, 1250, 'Player payments reach the rightful NPC creditor');
  assert.deepEqual(settleLegalDebt(f.context, 'miner-hull:miner', f.miner), {
    paid: 350, remainingDebt: 0,
  });
  assert.equal(f.miner.credits, 900);
  assert.equal(f.player.credits, 900, 'NPC payments reach the player creditor');
  assert.equal(settleLegalDebt(f.context, 'miner-hull:miner', f.miner).paid, 0);
  assert.equal(f.player.credits, 900, 'Repeated settlement cannot transfer twice');
}

function recordedOreAndIdempotentBilling() {
  const claims = new AsteroidClaimRegistry();
  const rock = {
    id: 'rock-1', kind: 'resource', scanLevel: 'analyzed',
    deposits: [{ resourceId: 'ferrite', oreRemaining: 100 }],
  };
  assert(claims.register('field', rock, 'player', 1, 3000).ok);
  claims.recordUnauthorizedExtraction('field', rock.id, 'miner', 4, 80);
  const one = claims.unbilledExtraction('field', rock.id, 'miner');
  assert.equal(one.value, 320);
  assert.equal(one.tons, 4);
  const f = paymentFixture();
  assert(f.legal.reportOffense('miner-hull:miner', 'player', 'Raubbau',
    Math.ceil(one.value * 1.5), 2, one.incidentId));
  assert.equal(f.legal.reportOffense('miner-hull:miner', 'player', 'Raubbau',
    480, 2, one.incidentId), null, 'Incident ID blocks duplicate charge');
  claims.markExtractionBilled('field', rock.id, 'miner');
  assert.equal(claims.unbilledExtraction('field', rock.id, 'miner'), null);
  claims.recordUnauthorizedExtraction('field', rock.id, 'miner', 2, 80);
  const two = claims.unbilledExtraction('field', rock.id, 'miner');
  assert.equal(two.value, 160);
  assert.notEqual(two.incidentId, one.incidentId);
  assert.equal(f.legal.debt('miner-hull:miner'), 480);
  f.legal.reportOffense('miner-hull:miner', 'player', 'Raubbau',
    Math.ceil(two.value * 1.5), 2, two.incidentId);
  assert.equal(f.legal.debt('miner-hull:miner'), 720);
  const snapshot = JSON.parse(JSON.stringify(claims.exportState()));
  const restored = new AsteroidClaimRegistry();
  assert(restored.restoreState(snapshot));
  assert.equal(restored.unbilledExtraction('field', rock.id, 'miner').value, 160);
}

sameLedgerForPlayerAndNpc();
recordedOreAndIdempotentBilling();
console.log('PASS legal claims: player and NPC accounting, proportional theft, repeat-safe evidence');
