'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { settleNpcCombatPirateLoot } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/npc-combatant-setup.ts'
);

function ship(job, pirate, cargo) {
  return {
    job,
    pirate,
    cargo: { ...cargo },
    cargoCapacity: 20,
    name: job,
    hullHp: 0,
    combatMovement: { mode: 'engaged' },
    combatRecoverySeconds: 0,
  };
}

{
  const pirate = ship('pirate', true, {});
  const victim = ship('freighter', false, { steel: 7, ferrite: 8 });
  assert.equal(settleNpcCombatPirateLoot(pirate, victim, 'attacker'), 10);
  assert.deepEqual(pirate.cargo, { ferrite: 8, steel: 2 });
  assert.deepEqual(victim.cargo, { steel: 5 });
  assert.equal(
    Object.values(pirate.cargo).reduce((sum, n) => sum + n, 0) +
      Object.values(victim.cargo).reduce((sum, n) => sum + n, 0),
    15,
    'combat loot cannot create or destroy cargo'
  );
}

{
  const victim = ship('miner', false, { ferrite: 6 });
  const pirate = ship('pirate', true, {});
  assert.equal(settleNpcCombatPirateLoot(victim, pirate, 'defender'), 6);
  assert.equal(pirate.cargo.ferrite, 6);
}

{
  const pirate = ship('pirate', true, {});
  const freighter = ship('freighter', false, { steel: 5 });
  assert.equal(settleNpcCombatPirateLoot(pirate, freighter, 'defender'), 0);
  assert.deepEqual(pirate.cargo, {});
  assert.deepEqual(freighter.cargo, { steel: 5 });
}

{
  const pirate = ship('pirate', true, {});
  const patrol = ship('patrol', false, { steel: 5 });
  assert.equal(settleNpcCombatPirateLoot(pirate, patrol, 'attacker'), 0);
  assert.deepEqual(patrol.cargo, { steel: 5 });
}

{
  const pirate = ship('pirate', true, { steel: 7 });
  pirate.cargoCapacity = 10;
  const victim = ship('salvager', false, { ferrite: 8 });
  assert.equal(settleNpcCombatPirateLoot(pirate, victim, 'attacker'), 3);
  assert.deepEqual(pirate.cargo, { steel: 7, ferrite: 3 });
  assert.deepEqual(victim.cargo, { ferrite: 5 });
  assert.equal(settleNpcCombatPirateLoot(pirate, victim, 'attacker'), 0);
}

console.log('PASS pirate combat victory transfers disabled civilian cargo only');
