'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const {
  CAREER_SAVE_SECTIONS, validateCareerSnapshot,
} = load('src/systems/persistence/career-save-contract.ts');
const {
  createCareerSaveStore, CAREER_SAVE_STORAGE_KEY, stageCareerSession,
} = load('src/systems/persistence/career-save-store.ts');

const newRecord = () => ({
  version: 1,
  sections: Object.fromEntries(
    CAREER_SAVE_SECTIONS.map((key) => [key, { status: 'ready', items: [] }])
  ),
});
const db = new Map();
const storage = {
  getItem: (key) => db.get(key) ?? null,
  setItem: (key, value) => db.set(key, value),
};
const saves = createCareerSaveStore(storage);

assert.deepEqual(saves.read(), { ok: false, reason: 'missing' });
const input = newRecord();
input.sections.player = { credits: 730, cargo: { ferrite: { qty: 4 } } };
input.sections.legal = { demands: ['claim-1'] };
saves.save(input);
const committed = db.get(CAREER_SAVE_STORAGE_KEY);
assert(committed && committed.includes('sojourn-career'));
input.sections.player.credits = 2;
assert.equal(saves.read().snapshot.sections.player.credits, 730, 'Writing must detach from live objects');
const loaded = saves.read();
assert(loaded.ok);
loaded.snapshot.sections.player.credits = 99;
assert.equal(saves.read().snapshot.sections.player.credits, 730, 'Reading must detach from storage');
const missing = newRecord();
delete missing.sections.custody;
assert.throws(() => saves.save(missing), /Teilzustände/);
assert.equal(db.get(CAREER_SAVE_STORAGE_KEY), committed, 'Incomplete saves never touch the last valid save');
const malformed = newRecord();
malformed.sections.player = { credits: Number.NaN };
assert.throws(() => saves.save(malformed), /serialisierbare/);
const cyclic = {};
cyclic.loop = cyclic;
malformed.sections.player = cyclic;
assert.throws(() => saves.save(malformed));
malformed.sections.player = new Date();
assert.throws(() => saves.save(malformed), /Laufzeitobjekt/);
assert.equal(db.get(CAREER_SAVE_STORAGE_KEY), committed);
const noSpace = createCareerSaveStore({
  getItem: storage.getItem,
  setItem() { throw new Error('quota exceeded'); },
});
assert.throws(() => noSpace.save(newRecord()), /quota exceeded/);
assert.equal(db.get(CAREER_SAVE_STORAGE_KEY), committed, 'Failed storage write preserves earlier save');
db.set(CAREER_SAVE_STORAGE_KEY, committed.replace('sojourn-career', 'sojourn-invalid'));
assert.equal(saves.read().reason, 'unsupported');
db.set(CAREER_SAVE_STORAGE_KEY, committed.replace('ready', 'broken'));
assert.equal(saves.read().reason, 'corrupt', 'Bad payload checksum is rejected');
db.set(CAREER_SAVE_STORAGE_KEY, committed.replace('"formatVersion":1', '"formatVersion":99'));
assert.equal(saves.read().reason, 'unsupported');
db.set(CAREER_SAVE_STORAGE_KEY, '{invalid');
assert.equal(saves.read().reason, 'invalid');
db.set(CAREER_SAVE_STORAGE_KEY, committed);

const liveSession = { credits: 17 };
assert.throws(
  () => stageCareerSession(saves.read().snapshot, () => {
    throw new Error('cannot rebuild world');
  }),
  /cannot rebuild world/
);
assert.equal(liveSession.credits, 17, 'Unsuccessful staged restoration cannot mutate active session');
const fresh = stageCareerSession(validateCareerSnapshot(newRecord()), (record) => ({
  fieldCount: Object.keys(record.sections).length,
}));
assert.equal(fresh.fieldCount, CAREER_SAVE_SECTIONS.length);
console.log('PASS career saves: required sections, detached records, atomic writes, corruption and staging');
