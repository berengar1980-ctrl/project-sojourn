'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { tickFieldSecurity } = load('src/app/game-controller-security.ts');
const { AsteroidSecurityDrone } = load('src/systems/operations/asteroid-security-drone.ts');
const { AsteroidClaimRegistry } = load('src/systems/operations/asteroid-claim-registry.ts');
const { SectorLegalRegistry } = load('src/systems/operations/sector-legal-registry.ts');

const locationId = 'test-field';
const asteroid = {
  id: 'claimed-rock',
  kind: 'resource',
  position: { x: 450, y: 100 },
  radius: 30,
  routeBlocking: true,
  scanLevel: 'analyzed',
  deposits: [{ resourceId: 'ferrite', oreRemaining: 100, oreCapacity: 100, identified: true }],
};
const claims = new AsteroidClaimRegistry();
assert(claims.register(locationId, asteroid, 'player', 1, 10000).ok);
const legal = new SectorLegalRegistry();
legal.registerShip('miner-hull:miner', 'miner');
const npc = { id: 'miner', shipId: 'miner-hull', name: 'Test Miner', credits: 0, aggression: 90 };
const runtime = {
  locationId,
  instance: { asteroids: [asteroid] },
  drone: new AsteroidSecurityDrone(900, 600, [asteroid], 600),
  miners: {
    ships: [
      {
        npcId: npc.id,
        laserActive: true,
        targetAsteroidId: asteroid.id,
        position: { x: 600, y: 160 },
      },
    ],
  },
};
const logs = [];
const context = {
  state: { localSpace: null, activeShip: { id: 'player-hull' } },
  economy: {
    asteroidClaims: claims,
    legal,
    sectorNpcs: { npcs: [npc] },
    trade: { player: { credits: 0 } },
    situations: { currentDay: 3 },
  },
  world: { world: () => ({ locations: [{ id: locationId, position: { x: 0, y: 0 } }] }) },
  systemLog: { write: (message) => logs.push(message) },
};
tickFieldSecurity(context, 0.08, runtime);
assert.equal(legal.debt('miner-hull:miner'), 1500, 'Offscreen drone detects the real miner');
assert.equal(legal.latestSighting('miner-hull:miner').kind, 'distress');
tickFieldSecurity(context, 0.08, runtime);
assert.equal(legal.debt('miner-hull:miner'), 1500, 'Continuous extraction must not double-charge');
assert(logs.some((message) => message.includes('NOTRUF')));
console.log('PASS offline security: sensor reports NPC claim theft without a player scene');
