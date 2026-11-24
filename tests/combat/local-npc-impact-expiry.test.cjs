'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { LocalNpcImpactTimeline } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/local-space/local-npc-impact-timeline.ts'
);

const timeline = new LocalNpcImpactTimeline();
const first = {
  attacker: { id: 'corsair' },
  winner: null,
  defender: { id: 'security-drone:field' },
  elapsedSeconds: 10,
  recentImpacts: [
    {
      serial: 1,
      position: { x: 320, y: 180 },
      layer: 'shield',
      target: 'defender',
      damage: 4,
    },
  ],
  lastImpact: null,
};
assert.equal(timeline.visible(first).length, 1);
for (let index = 0; index < 20; index++) {
  const still = { ...first, elapsedSeconds: 10.1 + index * 0.05 };
  assert(
    timeline.visible(still).length <= 1,
    'Old snapshots cannot restart one hit every drawing frame'
  );
}
assert.equal(
  timeline.visible({ ...first, elapsedSeconds: 11.2 }).length,
  0,
  'Hit marks disappear after their actual lifetime'
);
assert.equal(
  timeline.visible({
    ...first,
    elapsedSeconds: 11.3,
    recentImpacts: [],
    lastImpact: first.recentImpacts[0],
  }).length,
  0,
  'Persistent lastImpact must not reappear as a new hit'
);
assert.equal(
  timeline.visible({
    ...first,
    elapsedSeconds: 11.4,
    recentImpacts: [{ ...first.recentImpacts[0], serial: 2 }],
  }).length,
  1,
  'Genuinely new impacts must still appear'
);
timeline.retain([]);
assert.equal(timeline.visible({ ...first, elapsedSeconds: 0 }).length, 1);
const { fleetRenderSources, updateParallelNativeImpacts, updateParallelAutocannonBursts } =
  loadStandaloneTypeScriptModule(root, 'src/ui/combat/parallel-native-duel-overlay.ts');
const { combatEffectSource } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/combat/combat-effect-clock.ts'
);
const impact = first.recentImpacts[0];
const late = {
  ...first,
  elapsedSeconds: 0.08,
  lastImpact: impact,
  projectiles: [
    {
      id: 1,
      kind: 'autocannon',
      origin: { x: 0, y: 0 },
      target: { x: 90, y: 0 },
    },
  ],
};
const lead = {
  ...late,
  attacker: { id: 'primary' },
  recentImpacts: [],
  lastImpact: null,
  projectiles: [],
};
assert.deepEqual(
  fleetRenderSources(late, [lead], [late]),
  {
    additional: [lead],
    supportingFromIndex: 1,
  },
  'a player who joins as support stays the primary view without duplicating a duel'
);
const seen = new Map();
const visible = new Map();
const bursts = new Map();
const key = combatEffectSource(late);
updateParallelNativeImpacts([lead, late], 120, 120, seen, visible);
updateParallelAutocannonBursts([lead, late], bursts, 120);
assert.equal(visible.get(key).length, 1, 'lastImpact and recentImpacts report the same hit once');
assert.equal(visible.get(key)[0].startedAt, 120, 'a reinforcement uses the fleet effect clock');
assert.equal([...bursts.values()][0].spawnedAt, 120, 'its first salvo does not expire immediately');
updateParallelNativeImpacts([late], 120.1, 120.1, seen, visible);
updateParallelAutocannonBursts([late], bursts, 120.1);
assert.equal(visible.get(key).length, 1, 'removing an earlier duel does not restart another hit');
assert.equal(bursts.size, 1, 'moving a duel in the snapshot does not duplicate a burst');
const finished = { ...late, winner: 'defender' };
updateParallelAutocannonBursts([finished], bursts, 123);
assert.equal(bursts.size, 0, 'an existing burst expires after the loss');
updateParallelAutocannonBursts([finished], bursts, 124);
assert.equal(bursts.size, 0, 'the frozen loss snapshot cannot replay the burst');
console.log('PASS local NPC impact VFX expire and do not linger as world markers');
