'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { SectorLegalRegistry } = load('src/systems/operations/sector-legal-registry.ts');
const { AsteroidClaimRegistry } = load('src/systems/operations/asteroid-claim-registry.ts');
const { AsteroidFieldWorld } = load('src/systems/operations/asteroid-field-world.ts');
const { captureCareerLegalAndClaims, stageCareerLegalAndClaims } = load(
  'src/systems/persistence/career-operational-registries.ts'
);
const { captureCareerCustody, stageCareerCustody } = load(
  'src/systems/persistence/career-custody-checkpoint.ts'
);

const npc = { id: 'raider', shipId: 'raider-hull' };
const npcHull = npc.shipId + ':' + npc.id;
const playerHull = 'player-hull';
const fields = new AsteroidFieldWorld([], new AsteroidClaimRegistry(), () => ({
  ships: [],
  tick: () => {},
  syncCombatPose: () => {},
}));
let legal = new SectorLegalRegistry();
const claims = new AsteroidClaimRegistry();
legal.registerShip(playerHull, 'player');
legal.registerShip(npcHull, npc.id);

function reload(prisoners = new Set(), detention = null) {
  const savedLegal = captureCareerLegalAndClaims(claims, legal, fields);
  const savedCustody = captureCareerCustody(prisoners, detention);
  const restored = stageCareerLegalAndClaims(JSON.parse(JSON.stringify(savedLegal)));
  const custody = stageCareerCustody(
    JSON.parse(JSON.stringify(savedCustody)),
    restored.legal,
    [npc],
    playerHull
  );
  assert.deepEqual(restored.legal.exportState(), savedLegal.legal);
  assert.deepEqual(captureCareerCustody(custody.prisoners, custody.player), savedCustody);
  legal = restored.legal;
  return custody;
}

// Unpaid demand is not a warrant: loading must not silently escalate it.
assert(legal.reportOffense(playerHull, 'claim-owner', 'ore theft', 950, 8, 'ore:8'));
assert.equal(legal.status(playerHull), 'demand');
reload();
assert.equal(legal.isWanted(playerHull), false);
assert.deepEqual(legal.settle(playerHull, 200), {
  paid: 200,
  transfers: [{ creditorId: 'claim-owner', amount: 200 }],
});
reload();
assert.equal(legal.debt(playerHull), 750);
assert.equal(legal.status(playerHull), 'demand');
assert.equal(legal.reportOffense(playerHull, 'claim-owner', 'ore theft', 950, 8, 'ore:8'), null);

// Warrant, disguised identity and sighting must survive repeated restarts.
assert(legal.declareWanted(playerHull));
assert(legal.forgeTransponder(playerHull, 'FALSE-ID'));
assert.equal(legal.isRecognizedWanted(playerHull), false);
assert(legal.reportSighting(playerHull, 'outer-belt', 9, 'distress'));
reload();
assert.equal(legal.status(playerHull), 'wanted');
assert.equal(legal.isRecognizedWanted(playerHull, true), true);
assert.equal(legal.reportSighting(playerHull, 'outer-belt', 9, 'distress'), null);

// Multiple owners and partial receipts: already transferred credits never recur.
assert(legal.reportOffense(npcHull, 'directorate', 'piracy', 700, 9, 'raid:9'));
assert(legal.declareWanted(npcHull));
assert(legal.beginCustody(npcHull));
assert(legal.beginCustody(playerHull));
const detention = { shipId: playerHull, days: 2, laborCredits: 350, accumulator: 0.5 };
const custody = reload(new Set([npc.id]), detention);
assert.equal(legal.status(playerHull), 'custody');
assert.equal(legal.status(npcHull), 'custody');
assert.equal(custody.player.days, 2);
assert.equal(custody.player.laborCredits, 350);
assert.equal(legal.debt(playerHull), 750);
assert.deepEqual(legal.settle(npcHull, 350).transfers, [
  { creditorId: 'directorate', amount: 350 },
]);
reload(new Set([npc.id]), detention);
assert.equal(legal.debt(npcHull), 350);
assert.deepEqual(legal.settle(npcHull, 350).transfers, [
  { creditorId: 'directorate', amount: 350 },
]);
assert.equal(legal.status(npcHull), 'clear');
assert.deepEqual(legal.settle(npcHull, 350).transfers, []);

// A released NPC cannot remain a prisoner in a corrupt checkpoint.
assert.throws(
  () => stageCareerCustody(captureCareerCustody(new Set([npc.id]), detention), legal, [npc], playerHull),
  /custody/
);
assert.equal(legal.settle(playerHull, 750).paid, 750);
assert.equal(legal.status(playerHull), 'clear');
reload();
assert.equal(legal.debt(playerHull), 0);
assert.equal(legal.debt(npcHull), 0);
assert.equal(legal.reportOffense(npcHull, 'directorate', 'piracy', 700, 9, 'raid:9'), null);
console.log('PASS advanced legal reload: demand, partial receipts, warrant, custody, release');
