'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createSectorSalvageEventService } = loadStandaloneTypeScriptModule(
  root, 'src/systems/salvage/sector-salvage-event-service.ts'
);
const { generateSectorSalvageEventField } = loadStandaloneTypeScriptModule(
  root, 'src/systems/salvage/salvage-event-field-generator.ts'
);
const { getShipsByRole } = loadStandaloneTypeScriptModule(
  root, 'src/systems/ships/ship-registry.ts'
);
const { narrowsSector } = loadStandaloneTypeScriptModule(root, 'src/data/maps/narrows-sector.ts');

const unavailable = createSectorSalvageEventService(narrowsSector, 321);
unavailable.advanceDay(0, { x: 3500, y: 3000 }, false);
const event = unavailable.active.find((entry) => entry.type === 'distress-rescue');
assert(event, 'NPC rescue opportunities must still spawn without a player salvage ship');
assert.equal(unavailable.playerVisible.length, 0);
assert.equal(unavailable.acceptForPlayer(event.id), false);
assert.equal(unavailable.claimForNpc(event.id, 'npc-salvager'), true,
  'NPC salvagers may claim immediately, without the three-day grace period');
assert.equal(unavailable.claimForNpc(event.id, 'other-salvager'), false,
  'only one of the competing NPCs may win the claim');

const available = createSectorSalvageEventService(narrowsSector, 321);
available.advanceDay(0, { x: 3500, y: 3000 }, true);
assert(available.playerVisible.some((entry) => entry.type === 'distress-rescue'));
const eligible = available.active.find((entry) => entry.type === 'distress-rescue');
assert.equal(available.claimForNpc(eligible.id, 'npc-salvager'), false);
available.setPlayerSalvageEligible(false);
assert.equal(available.claimForNpc(eligible.id, 'npc-salvager'), true);

const field = generateSectorSalvageEventField(event);
const type = event.wreckKind === 'salvager' ? 'salvage'
  : event.wreckKind === 'miner' ? 'mining'
    : event.wreckKind === 'patrol' ? 'patrol' : 'freighter';
const ships = getShipsByRole(type);
const ship = ships[(event.fieldSeed >>> 0) % ships.length];
assert(Math.abs(field.wrecks[0].radius - ship.nominalLengthMeters * 0.38) < 0.01,
  'distress collision radius must follow physical sprite size');

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
assert(read('src/app/game-controller.ts').includes("state.activeShip.role !== 'salvage'"));
assert(read('src/ui/salvage/salvage-space-renderer.ts').includes(
  "!wreck.id.startsWith('event-wreck-salvage-distress-')"
));
assert(read('src/systems/npcs/npc-salvage-event-service.ts').includes('contenders[0]?.id'));
console.log('PASS salvager-only rescue, immediate NPC contest, real collision size and no false shield');
