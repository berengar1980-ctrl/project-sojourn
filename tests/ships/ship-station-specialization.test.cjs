'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const registry = load('src/systems/ships/ship-registry.ts');
const stats = load('src/systems/ships/ship-stats.ts');
const runtime = load('src/systems/ships/ship-runtime.ts');
const station = load('src/systems/ships/station-performance.ts');

const specialties = [
  { role: 'mining', stationId: 'mining_station', skill: 'mining', bonus: 12 },
  { role: 'salvage', stationId: 'salvage_control', skill: 'salvage', bonus: 12 },
  { role: 'freighter', stationId: 'cargo_control', skill: 'logistics', bonus: 12 },
  { role: 'patrol', stationId: 'weapon_station', skill: 'weapons', bonus: 10 },
];

function staffedOptions(stationId, skill) {
  return {
    assignments: { [stationId]: 'specialist' },
    crew: [
      { id: 'specialist', skills: { [skill]: 70 } },
      { id: 'support', skills: { [skill]: 50 } },
    ],
    manningFactor: 1,
  };
}

function withoutBonus(ship, stationId) {
  return {
    ...ship,
    gameplayOverrides: {
      ...ship.gameplayOverrides,
      stationBonuses: { ...ship.gameplayOverrides?.stationBonuses, [stationId]: 0 },
    },
  };
}

for (const { role, stationId, skill, bonus } of specialties) {
  const ships = registry.getShipsByRole(role);
  assert(ships.length >= 2, role + ' needs both normal and specialist variants');
  const normal = ships[0];
  const specialist = ships[1];
  const regularStation = stats.resolveShipGameplayStats(normal).stations.find(
    (entry) => entry.id === stationId
  );
  assert.equal(regularStation?.bonus, bonus, role + ' station bonus');

  const crew = staffedOptions(stationId, skill);
  const regular = runtime.resolveShipRuntimeSetup(normal, crew);
  const base = runtime.resolveShipRuntimeSetup(withoutBonus(normal, stationId), crew);
  assert.equal(
    regular.stationSkills[skill] - base.stationSkills[skill],
    bonus,
    role + ' specialization must change effective station output'
  );

  const unstaffed = runtime.resolveShipRuntimeSetup(normal);
  const automated = runtime.resolveShipRuntimeSetup(withoutBonus(normal, stationId));
  assert.equal(unstaffed.stationSkills[skill], automated.stationSkills[skill]);

  const missingCrew = { ...crew, assignments: { [stationId]: 'unknown' } };
  assert.equal(
    runtime.resolveShipRuntimeSetup(normal, missingCrew).stationSkills[skill],
    runtime.resolveShipRuntimeSetup(withoutBonus(normal, stationId), missingCrew).stationSkills[
      skill
    ]
  );

  const incapacitated = {
    ...crew,
    crew: crew.crew.map((member) =>
      member.id === 'specialist' ? { ...member, injuryState: 'incapacitated' } : member
    ),
  };
  assert.equal(
    runtime.resolveShipRuntimeSetup(normal, incapacitated).stationSkills[skill],
    runtime.resolveShipRuntimeSetup(withoutBonus(normal, stationId), incapacitated).stationSkills[
      skill
    ],
    'incapacitated crew cannot activate hull bonuses'
  );
  assert(
    stats.resolveShipGameplayStats(specialist).stations.some(
      (entry) => entry.bonus > 0 && entry.skill !== skill
    ),
    role + ' alternate hull must offer a second specialization'
  );
}

const miner = registry.getShipsByRole('mining')[0];
const miningCrew = staffedOptions('mining_station', 'mining');
const miningBoost = runtime.resolveShipRuntimeSetup(miner, miningCrew);
const miningBase = runtime.resolveShipRuntimeSetup(withoutBonus(miner, 'mining_station'), miningCrew);
assert(miningBoost.crewEffects.mining.yieldMultiplier > miningBase.crewEffects.mining.yieldMultiplier);

const freighter = registry.getShipsByRole('freighter')[0];
const freightCrew = staffedOptions('cargo_control', 'logistics');
const freightBoost = runtime.resolveShipRuntimeSetup(freighter, freightCrew);
const freightBase = runtime.resolveShipRuntimeSetup(
  withoutBonus(freighter, 'cargo_control'),
  freightCrew
);
assert(freightBoost.crewEffects.logistics.saleFeeRate < freightBase.crewEffects.logistics.saleFeeRate);

const patrol = registry.getShipsByRole('patrol')[0];
const patrolCrew = staffedOptions('weapon_station', 'weapons');
assert(
  runtime.resolveShipRuntimeSetup(patrol, patrolCrew).crewEffects.weapons.damageMultiplier >
    runtime.resolveShipRuntimeSetup(withoutBonus(patrol, 'weapon_station'), patrolCrew)
      .crewEffects.weapons.damageMultiplier
);

const stations = [{ id: 'helm', skill: 'piloting', bonus: 99 }];
const crew = [{ id: 'pilot', skills: { piloting: 50 } }];
assert.equal(station.calculateStationSkill(stations, { helm: 'pilot' }, crew, 'piloting'), 50);
assert.equal(
  station.calculateStationSkill(stations, { helm: 'pilot' }, crew, 'piloting') -
    station.calculateStationSkill([{ id: 'helm', skill: 'piloting' }], { helm: 'pilot' }, crew, 'piloting'),
  20,
  'hull specialization must have a bounded effect'
);

const view = fs.readFileSync(path.join(root, 'src/features/port/port-view-model.ts'), 'utf8');
const markup = fs.readFileSync(path.join(root, 'src/ui/port/port-secondary-panes.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller-port.ts'), 'utf8');
assert(view.includes('bonusActive'));
assert(markup.includes('SCHIFF +'));
assert(markup.includes('CREW-STATIONSBONI'));
assert(controller.includes('stationBonuses: resolveShipGameplayStats(offer)'));

console.log('PASS staffed hull station bonuses, alternate variants, runtime effects and dock display');
