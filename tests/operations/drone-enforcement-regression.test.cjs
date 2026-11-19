'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { reportUnauthorizedWreckSalvage } = load(
  'src/app/game-controller-salvage-legal-response.ts'
);
const { detectedSecurityPirate, securityPirateApproach } = load(
  'src/app/game-controller-drone-pirate-response.ts'
);

const offenses = [];
const registry = {
  claim: (_fieldId, _wreckId, _day) => ({ ownerId: 'salvager-9' }),
};
const context = {
  economy: {
    wreckClaims: registry,
    situations: { currentDay: 18 },
    legal: {
      reportOffense(shipId, ownerId, charge, credits, day, incident) {
        offenses.push({ shipId, ownerId, charge, credits, day, incident });
        return offenses.length === 1 ? {} : null;
      },
      reportSighting() {
        return null;
      },
    },
  },
  state: { activeShip: { id: 'player-hull' } },
  systemLog: { write() {} },
};
const field = { id: 'wreck-44', sourceLocationId: 'wreck-44' };
reportUnauthorizedWreckSalvage(context, field, 'foreign-wreck');
assert.equal(offenses[0].ownerId, 'salvager-9');
assert.equal(offenses[0].credits, 500);
assert.equal(offenses[0].incident, 'illegal-wreck-salvage:wreck-44:foreign-wreck:18');

const drone = {
  position: { x: 100, y: 100 },
  snapshot() {
    return { operational: true, position: this.position };
  },
  detect(position) {
    return position.x < 400;
  },
};
const npcs = [
  { id: 'pirate-1', pirate: true, hullHp: 100 },
  { id: 'pirate-2', pirate: true, hullHp: 100, combatMovement: {} },
];
const security = {
  economy: { sectorNpcs: { npcs } },
};
const mining = {
  drone,
  pirates: {
    snapshot() {
      return [
        { npcId: 'pirate-2', position: { x: 180, y: 100 } },
        { npcId: 'pirate-1', position: { x: 300, y: 100 } },
      ];
    },
  },
  instance: { asteroids: [] },
};
assert.equal(
  detectedSecurityPirate(security, mining).id,
  'pirate-1',
  'Free pirates are pursued even if a different pirate is already fighting'
);
const point = securityPirateApproach(drone.position, { x: 300, y: 100 });
assert.deepEqual(point, { x: 175, y: 100 });
console.log('PASS illegal wreck attempt reporting and free hostile pirate detection');
