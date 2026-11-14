'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { AsteroidClaimRegistry } = load('src/systems/operations/asteroid-claim-registry.ts');
const { SectorLegalRegistry } = load('src/systems/operations/sector-legal-registry.ts');
const { AsteroidFieldWorld } = load('src/systems/operations/asteroid-field-world.ts');
const {
  captureCareerLegalAndClaims, stageCareerLegalAndClaims,
} = load('src/systems/persistence/career-operational-registries.ts');
const { createControllerEconomy } = load('src/app/game-controller-economy.ts');
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');

const location = {
  id: 'checkpoint-belt',
  activities: { mine: true },
  minedResourceIds: ['ferrite'],
};
const mineStub = () => ({
  ships: [],
  tick: () => {},
  syncCombatPose: () => {},
});
const claims = new AsteroidClaimRegistry();
const legal = new SectorLegalRegistry();
const world = new AsteroidFieldWorld([location], claims, mineStub);
const field = world.field(location.id);
assert(field);
const asteroid = field.instance.asteroids.find(
  (a) => a.kind === 'resource' && a.deposits.some((d) => d.oreRemaining >= 20)
);
assert(asteroid);
asteroid.scanLevel = 'analyzed';
assert(claims.register(location.id, asteroid, 'player', 2, 150000).ok);
asteroid.deposits[0].oreRemaining -= 12;
claims.recordUnauthorizedExtraction(location.id, asteroid.id, 'miner-x', 12, 45);
const shipId = 'miner-hull:miner-x';
legal.registerShip(shipId, 'miner-x');
assert(legal.reportOffense(shipId, 'player', 'Konzessionsraub', 810, 2, 'incident:1'));
assert(legal.declareWanted(shipId));
legal.forgeTransponder(shipId, 'FALSE-CALLSIGN');
assert(legal.reportSighting(shipId, location.id, 2, 'distress'));
assert.equal(legal.settle(shipId, 110).paid, 110);
assert(legal.beginCustody(shipId));

const saved = captureCareerLegalAndClaims(claims, legal, world);
assert.notStrictEqual(saved.claims, claims.exportState());
const restored = stageCareerLegalAndClaims(JSON.parse(JSON.stringify(saved)));
const newWorld = new AsteroidFieldWorld([location], restored.claims, mineStub);
const copy = newWorld.field(location.id).instance.asteroids.find((a) => a.id === asteroid.id);
assert(copy);
assert.equal(copy.deposits[0].oreRemaining, asteroid.deposits[0].oreRemaining);
assert.equal(copy.scanLevel, 'analyzed');
assert.equal(restored.claims.claim(location.id, copy).ownerId, 'player');
assert.equal(restored.legal.debt(shipId), 700);
assert.equal(restored.legal.status(shipId), 'custody');
assert.equal(restored.legal.registration(shipId).transponder, 'FALSE-CALLSIGN');
assert.equal(restored.legal.latestSighting(shipId).kind, 'distress');
assert.equal(
  restored.claims.unbilledExtraction(location.id, asteroid.id, 'miner-x').value,
  540
);
assert.equal(
  restored.legal.reportOffense(shipId, 'player', 'Konzessionsraub', 810, 2, 'incident:1'),
  null, 'Reload must not bill the same incident twice'
);
assert.equal(restored.legal.settle(shipId, 700).paid, 700);
assert.equal(restored.legal.settle(shipId, 700).paid, 0, 'No repeat creditor transfer');
assert.equal(restored.legal.status(shipId), 'clear');

const corrupted = JSON.parse(JSON.stringify(saved));
corrupted.legal.charges[0].paid = -1;
assert.throws(() => stageCareerLegalAndClaims(corrupted), /Forderung/);
assert.equal(legal.debt(shipId), 700, 'Failed staging must not change live legal authority');
corrupted.legal.charges[0].paid = 110;
corrupted.claims.extraction[0].billedTons = 1000000;
assert.throws(() => stageCareerLegalAndClaims(corrupted), /Erzvorfall/);
assert.equal(asteroid.deposits[0].oreRemaining, copy.deposits[0].oreRemaining);
const nav = { getSnapshot: () => ({ currentPosition: narrowsSector.star.position }) };
const economy = createControllerEconomy(nav, () => {}, stageCareerLegalAndClaims(saved));
assert.equal(economy.legal.debt(shipId), 700, 'New game economy can stage legal record before initialization');
console.log('PASS career operational registry staging: ore, claims, identity, wanted/custody and idempotent settlement');
