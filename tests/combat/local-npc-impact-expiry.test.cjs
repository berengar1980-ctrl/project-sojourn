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
console.log('PASS local NPC impact VFX expire and do not linger as world markers');
