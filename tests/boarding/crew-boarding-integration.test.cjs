'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const boarding = loadStandaloneTypeScriptModule(
  root,
  'src/systems/boarding/crew-boarding-adapter.ts'
);
const rosterModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/crew/crew-roster-service.ts'
);
const ships = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');
const weapons = loadStandaloneTypeScriptModule(root, 'src/data/boarding/boarding-weapons.ts');

const miner = ships.getShipsByRole('mining')[0];
assert(miner);

{
  const roster = rosterModule.createCrewRosterService();
  const tiber = roster.hire('tiber_krane', miner);
  assert(tiber);

  const unit = boarding.crewMemberToBoardingUnit(tiber);
  assert(unit);
  assert.equal(unit.id, 'tiber_krane');
  assert.equal(unit.rangedSkill, 100, 'elite ranged skill must include equipped preysense bonus');
  assert.equal(unit.meleeSkill, 96);
  assert.equal(unit.weapon.id, 'melta_gun');
  assert.equal(unit.meleeWeapon.id, 'power_sword');
  assert.equal(unit.armor, 5);
  assert.equal(unit.hp, 10);
  assert.equal(unit.maxHp, 10);

  roster.setInjuryState('tiber_krane', 'severe_wound');
  const wounded = boarding.crewMemberToBoardingUnit(roster.member('tiber_krane'));
  assert(wounded);
  assert.equal(wounded.hp, 7);
  assert.equal(wounded.maxHp, 10, 'pre-existing wounds must survive encounter setup');

  const woundedEncounter = boarding.createCrewBoardingEncounter({
    roster,
    seed: 17,
    enemyUnits: [],
  });
  woundedEncounter.settle();
  assert.equal(
    roster.member('tiber_krane').injuryState,
    'severe_wound',
    'boarding settlement must not heal pre-existing severe wounds'
  );

  roster.setInjuryState('tiber_krane', 'incapacitated');
  assert.equal(
    boarding.crewMemberToBoardingUnit(roster.member('tiber_krane')),
    null,
    'incapacitated crew must not enter boarding combat'
  );
}

{
  const roster = rosterModule.createCrewRosterService();
  assert(roster.hire('tiber_krane', miner));
  assert(roster.hire('dagan_rhel', miner));
  roster.setInjuryState('dagan_rhel', 'dead');

  const units = boarding.crewBoardingUnits(roster);
  assert.deepEqual(
    units.map((unit) => unit.id),
    ['tiber_krane'],
    'dead crew must never become player boarding units'
  );
}

{
  const roster = rosterModule.createCrewRosterService();
  assert(roster.hire('tiber_krane', miner));

  const encounter = boarding.createCrewBoardingEncounter({
    roster,
    seed: 101,
    mapId: 'long-corridor',
    enemyUnits: [
      {
        id: 'hostile',
        name: 'Hostile',
        team: 'enemy',
        hp: 30,
        armor: 5,
        rangedSkill: 10,
        meleeSkill: 10,
        weapon: weapons.boardingRangedWeapons.sidearm,
        meleeWeapon: weapons.boardingMeleeWeapons.baton,
      },
    ],
  });

  assert.equal(encounter.tactical.move('tiber_krane', { q: 2, r: 1 }), true);
  encounter.tactical.endTurn();
  encounter.tactical.endTurn();
  assert.equal(encounter.tactical.move('tiber_krane', { q: 5, r: 1 }), true);
  encounter.tactical.endTurn();
  encounter.tactical.endTurn();
  assert.equal(
    encounter.tactical.move('tiber_krane', { q: 6, r: 1 }),
    true,
    'Melter need to close within its explicit two-hex range'
  );

  const shot = encounter.tactical.shoot('tiber_krane', 'hostile');
  assert(shot, 'real crew must be able to perform tactical attacks');
  assert.equal(encounter.tactical.retreat().outcome, 'retreat');
  encounter.settle();

  const member = roster.member('tiber_krane');
  assert(member);
  assert.equal(member.combatTraining.ranged, 1, 'boarding attacks must feed crew combat training');
  assert.equal(member.injuryState, 'healthy');

  encounter.settle();
  assert.equal(
    roster.member('tiber_krane').combatTraining.ranged,
    1,
    'settling the same encounter twice must be idempotent'
  );
}

console.log('PASS persistent crew maps into boarding combat, equipment, injuries and training');
