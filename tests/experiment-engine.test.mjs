import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CREATION_PAYLOAD_LENGTH, EMPTY_HISTORY, EXPERIENCE_TYPES, INTENTIONS, STEMS, CARES,
  createExperiment, developCreation, contributeRhythm, encodeCreation, decodeCreation,
  completeExperience, validateHistory, availableRecipes,
} from '../src/experiment-engine.js';

const rhythm = [1, 0, 1, 0, 0, 1, 0, 0];
const finished = (intention = 'wander', branch = 'movement') => developCreation(createExperiment(intention), branch);
const pack = value => Buffer.from(JSON.stringify(value), 'ascii').toString('base64url');
const unpack = encoded => JSON.parse(Buffer.from(encoded, 'base64url').toString('ascii'));
const copy = value => JSON.parse(JSON.stringify(value));
const encodeRaw = raw => Buffer.from(raw, 'utf8').toString('base64url');
function checksum(value) {
  let hash = 0xcbf29ce484222325n;
  for (const char of JSON.stringify(value)) hash = BigInt.asUintN(64, (hash ^ BigInt(char.charCodeAt(0))) * 0x100000001b3n);
  return hash.toString(16).padStart(16, '0');
}
function reseal(value) {
  value.id = value.stage === 'walking' ? value.rootId : checksum({ ...value, id: '' });
  return value;
}

// Core single-player collaboration and material player choices.
test('identical bounded input is deterministic and deeply immutable', () => {
  const options = { stem: 'straight', care: 'rain' };
  const one = createExperiment('wander', EMPTY_HISTORY, options);
  const two = createExperiment('wander', EMPTY_HISTORY, options);
  assert.deepEqual(one, two);
  assert.equal(one.stage, 'walking');
  assert.equal(one.branch, 'none');
  assert.equal(one.gait, 'sway');
  assert.equal(one.rootId, one.id);
  assert.equal(one.parentId, null);
  for (const value of [one, one.traits, one.rhythm]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { one.rhythm[0] = 1; }, TypeError);
  assert.throws(() => { one.traits.speed = 99; }, TypeError);
  options.care = 'sun';
  assert.equal(one.care, 'rain');
});

test('maker stem, Gardener care and intention materially change artwork', () => {
  const base = createExperiment('wander');
  assert.notEqual(createExperiment('delight').traits.petals, base.traits.petals);
  assert.notEqual(createExperiment('wander', EMPTY_HISTORY, { stem: 'straight' }).traits.stride, base.traits.stride);
  const rainy = createExperiment('wander', EMPTY_HISTORY, { care: 'rain' });
  assert.notEqual(rainy.traits.hue, base.traits.hue);
  assert.notEqual(rainy.gait, base.gait);
});

test('movement and music make different finished creations without changing original', () => {
  const original = createExperiment('delight');
  const before = copy(original);
  const hopping = developCreation(original, 'movement', { gait: 'hop' });
  const gliding = developCreation(original, 'movement', { gait: 'glide' });
  const musical = developCreation(original, 'music', { rhythm });
  assert.equal(hopping.gait, 'hop');
  assert.equal(gliding.gait, 'glide');
  assert.notEqual(hopping.traits.bounce, gliding.traits.bounce);
  assert.notEqual(hopping.traits.stride, gliding.traits.stride);
  assert.deepEqual(musical.rhythm, rhythm);
  assert.notDeepEqual(musical.rhythm, hopping.rhythm);
  assert.equal(musical.parentId, original.id);
  assert.equal(musical.rootId, original.rootId);
  assert.equal(musical.stage, 'finished');
  assert.deepEqual(original, before);
  assert.notEqual(musical.id, hopping.id);
  assert.throws(() => developCreation(hopping, 'music'));
  assert.throws(() => developCreation(decodeCreation(encodeCreation(hopping)), 'music'));
  assert.throws(() => encodeCreation(original));
});

test('music defensively copies caller steps', () => {
  const steps = [...rhythm];
  const song = developCreation(createExperiment('wander'), 'music', { rhythm: steps });
  steps[0] = 0;
  assert.equal(song.rhythm[0], 1);
});

test('no-login shared artifact accepts different performed rhythm as separate dancing copy', () => {
  const owner = finished('delight', 'music');
  const ownerBefore = encodeCreation(owner);
  const imported = decodeCreation(ownerBefore);
  const importedBefore = copy(imported);
  const guestCopy = contributeRhythm(imported, rhythm);
  assert.equal(guestCopy.source, 'remix');
  assert.equal(guestCopy.stage, 'remix');
  assert.equal(guestCopy.gait, 'dance');
  assert.equal(guestCopy.rootId, owner.rootId);
  assert.equal(guestCopy.parentId, owner.id);
  assert.notEqual(guestCopy.id, owner.id);
  assert.deepEqual(imported, importedBefore);
  assert.equal(encodeCreation(owner), ownerBefore);
  assert.equal(encodeCreation(imported), ownerBefore);
  assert.ok(Object.isFrozen(guestCopy));
  const second = contributeRhythm(guestCopy, [0, 1, 0, 1, 0, 1, 0, 1]);
  assert.equal(second.parentId, guestCopy.id);
  assert.equal(second.rootId, owner.rootId);
  assert.deepEqual(decodeCreation(encodeCreation(second)).rhythm, second.rhythm);
});

test('no-op rhythm, silent pattern, premature contribution and malformed rhythms fail', () => {
  const original = finished('wander', 'music');
  assert.throws(() => contributeRhythm(original, original.rhythm));
  assert.throws(() => contributeRhythm(createExperiment('wander'), rhythm));
  const extras = [...rhythm]; extras.url = 'https://example.invalid';
  const sparse = new Array(8); sparse[0] = 1;
  const malicious = [...rhythm]; Object.defineProperty(malicious, '0', { get() { throw new Error('Getter executed'); }, enumerable: true });
  for (const value of [[], [1], [...rhythm, 1], Array(8).fill(0), Array(8).fill(true), Array(8).fill('1'), Array(8).fill(2), [1, 0, 0, 0, 0, 0, 0, -0], sparse, extras, malicious, null, '10100100']) {
    assert.throws(() => contributeRhythm(original, value), TypeError);
  }
});

// Local history and fixed fictional Gardener relationship, never real identity.
test('progress is deduped by completed experience TYPE, not changing art IDs or intentions', () => {
  let history = completeExperience(EMPTY_HISTORY, createExperiment('wander'));
  assert.deepEqual(history.completed, ['grow-walk']);
  const before = copy(history);
  const duplicate = createExperiment('delight', history, { care: 'rain', stem: 'straight' });
  history = completeExperience(history, duplicate);
  assert.deepEqual(history, before);
  assert.deepEqual(EMPTY_HISTORY.completed, []);
  history = completeExperience(history, developCreation(duplicate, 'movement'));
  assert.deepEqual(history.completed, ['grow-walk', 'teach-step']);
  const replay = developCreation(createExperiment('wander', history), 'movement', { gait: 'hop' });
  assert.deepEqual(completeExperience(history, replay), history);
  assert.ok(Object.isFrozen(history));
  assert.ok(Object.isFrozen(history.completed));
});

test('two Gardener experience types unlock a genuinely different optional recipe', () => {
  assert.deepEqual(availableRecipes(), ['walking-flower']);
  assert.throws(() => createExperiment('wander', EMPTY_HISTORY, { recipe: 'counterstep-flower' }));
  const walking = createExperiment('wander');
  let history = completeExperience(EMPTY_HISTORY, walking);
  assert.deepEqual(availableRecipes(history), ['walking-flower']);
  history = completeExperience(history, developCreation(walking, 'movement'));
  assert.deepEqual(availableRecipes(history), ['walking-flower', 'counterstep-flower']);
  const duet = createExperiment('wander', history, { recipe: 'counterstep-flower' });
  assert.equal(duet.gait, 'counterstep');
  assert.equal(duet.traits.petals, 8);
  assert.equal(duet.adaptation, 2);
  assert.notEqual(duet.traits.tempo, walking.traits.tempo);
  assert.notEqual(duet.id, walking.id);
  assert.equal(decodeCreation(encodeCreation(developCreation(duet, 'music'))).recipe, 'counterstep-flower');
});

test('importing cannot earn history; guest copies do not inflate Gardener relationship', () => {
  const owner = finished();
  const imported = decodeCreation(encodeCreation(owner));
  assert.deepEqual(completeExperience(EMPTY_HISTORY, imported), EMPTY_HISTORY);
  assert.deepEqual(completeExperience(EMPTY_HISTORY, { ...imported, source: 'local' }), EMPTY_HISTORY);
  const remix = contributeRhythm(imported, rhythm);
  const guestHistory = completeExperience(EMPTY_HISTORY, remix);
  assert.deepEqual(guestHistory.completed, ['rhythm-duet']);
  assert.deepEqual(availableRecipes(guestHistory), ['walking-flower']);
  assert.equal(createExperiment('wander', guestHistory).adaptation, 0);
  const oneGardenerExperience = completeExperience(guestHistory, createExperiment('wander'));
  assert.deepEqual(availableRecipes(oneGardenerExperience), ['walking-flower']);
  assert.equal(createExperiment('wander', oneGardenerExperience).adaptation, 1);
  assert.deepEqual(completeExperience(guestHistory, contributeRhythm(imported, [0, 1, 0, 0, 0, 0, 0, 0])), guestHistory);
});

test('history is exact bounded enum-only storage and cannot contain flags or claimed events', () => {
  assert.deepEqual(validateHistory({ v: 1, completed: ['compose-beat', 'grow-walk'] }).completed, ['grow-walk', 'compose-beat']);
  for (const value of [null, [], {}, { v: 2, completed: [] }, { v: 1, completed: ['grow-walk', 'grow-walk'] }, { v: 1, completed: ['unlocked'] }, { v: 1, completed: [], unlocked: true }, { v: 1, completed: [...EXPERIENCE_TYPES, 'grow-walk'] }, { v: 1, completed: ['https://example.invalid'] }, JSON.parse('{"v":1,"completed":[],"__proto__":{"polluted":true}}')]) assert.throws(() => validateHistory(value), TypeError);
  const inherited = Object.create({ v: 1 }); inherited.completed = [];
  assert.throws(() => validateHistory(inherited));
  const all = validateHistory({ v: 1, completed: [...EXPERIENCE_TYPES] });
  assert.equal(createExperiment('delight', all).adaptation, 3);
});

// Shares carry bounded public artwork and lineage, not untrusted completion flags.
test('share round-trip is canonical, bounded, ASCII and excludes runtime/progress data', () => {
  const original = finished();
  const encoded = encodeCreation(original);
  assert.ok(encoded.length <= MAX_CREATION_PAYLOAD_LENGTH);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  const raw = unpack(encoded);
  assert.deepEqual(Object.keys(raw), ['v', 'id', 'rootId', 'parentId', 'intention', 'stem', 'care', 'recipe', 'stage', 'branch', 'gait', 'adaptation', 'rhythm']);
  for (const field of ['source', 'traits', 'history', 'completed', 'unlocked', 'owner', 'name', 'url', 'code']) assert.equal(Object.hasOwn(raw, field), false);
  const imported = decodeCreation(encoded);
  assert.equal(imported.source, 'shared');
  assert.equal(encodeCreation(imported), encoded);
  assert.deepEqual(imported.traits, original.traits);
  assert.ok(Object.isFrozen(imported.rhythm));
});

test('oversized, invalid base64, padding, URLs, raw JSON and noncanonical encodings fail', () => {
  const encoded = encodeCreation(finished());
  const raw = Buffer.from(encoded, 'base64url').toString('ascii');
  for (const value of [null, {}, '', 'A', 'A'.repeat(2049), encoded + '=', encoded + '\n', '#' + encoded, '#flower=' + encoded, 'https://example.invalid/#' + encoded, raw, 'not-valid-json', encodeRaw('\n' + raw), encodeRaw(raw.replace('{', '{ ')), encodeRaw(raw.replace('"v":1', '"v":1,"v":1')), encodeRaw(raw.replace('"wander"', '"w\\u0061nder"')), encodeRaw('"🌻"'), encodeRaw('null'), encodeRaw('[]')]) assert.throws(() => decodeCreation(value), TypeError);
  assert.throws(() => decodeCreation(pack(Object.fromEntries(Object.entries(unpack(encoded)).reverse()))));
});

test('unknown fields, prototype keys, invented enums and invalid numbers fail closed', () => {
  const base = unpack(encodeCreation(finished()));
  const changes = [
    { v: 2 }, { v: '1' }, { intention: 'exploit' }, { intention: 'https://evil.invalid/' },
    { stem: '__proto__' }, { care: 'constructor' }, { recipe: 'unlocked-flower' },
    { stage: 'performed' }, { branch: 'dance' }, { gait: 'run' },
    { adaptation: -1 }, { adaptation: 4 }, { adaptation: 1.5 }, { adaptation: null },
    { rhythm: [1, 2, 0, 0, 0, 0, 0, 0] }, { rhythm: { length: 8 } },
    { id: '0'.repeat(16) }, { rootId: 'f'.repeat(16) }, { parentId: 'https://evil.invalid' },
    { source: 'local' }, { unlocked: true }, { completed: ['grow-walk', 'teach-step'] }, { code: 'alert(1)' },
  ];
  for (const change of changes) assert.throws(() => decodeCreation(pack({ ...base, ...change })), TypeError);
  for (const key of Object.keys(base)) { const missing = { ...base }; delete missing[key]; assert.throws(() => decodeCreation(pack(missing))); }
  assert.throws(() => decodeCreation(encodeRaw(JSON.stringify(base).replace('"v":1', '"v":1,"__proto__":{"polluted":true}'))));
  assert.equal({}.polluted, undefined);
});

test('structurally illegal stage/branch combinations fail even with recomputed public checksum', () => {
  const base = unpack(encodeCreation(finished()));
  for (const change of [
    { branch: 'none' }, { gait: 'dance' }, { branch: 'music' },
    { rhythm }, { parentId: 'f'.repeat(16) },
    { stage: 'remix', gait: 'dance', rhythm },
    { stage: 'remix', gait: 'hop', rhythm, parentId: base.id },
  ]) assert.throws(() => decodeCreation(pack(reseal({ ...base, ...change }))));
  const walking = createExperiment('wander');
  const walkingPayload = Object.fromEntries(Object.keys(base).map(key => [key, walking[key]]));
  assert.throws(() => decodeCreation(pack(walkingPayload)));
});

test('local options and creation arguments cannot smuggle additional data or accessors', () => {
  for (const value of [null, [], { stem: 'long' }, { care: 'magic' }, { url: 'https://evil.invalid' }, { stem: undefined }, { recipe: 'counterstep-flower' }]) assert.throws(() => createExperiment('wander', EMPTY_HISTORY, value));
  assert.throws(() => developCreation(createExperiment('wander'), 'movement', { rhythm }));
  assert.throws(() => developCreation(createExperiment('wander'), 'music', { gait: 'hop' }));
  const getter = {}; Object.defineProperty(getter, 'stem', { get() { throw new Error('Getter executed'); }, enumerable: true });
  assert.throws(() => createExperiment('wander', EMPTY_HISTORY, getter), TypeError);
  const forged = { ...finished(), traits: { ...finished().traits, speed: 99 } };
  assert.throws(() => encodeCreation(forged));
  const alteredRhythm = [...rhythm]; Object.defineProperty(alteredRhythm, '0', { get() { throw new Error('Getter executed'); }, enumerable: true });
  assert.throws(() => contributeRhythm({ ...finished(), rhythm: alteredRhythm }, rhythm), TypeError);
});

test('all bounded intentions, stems, care and recipe branches round-trip', () => {
  const history = { v: 1, completed: ['grow-walk', 'teach-step', 'compose-beat'] };
  for (const intention of INTENTIONS) for (const stem of STEMS) for (const care of CARES) for (const recipe of availableRecipes(history)) {
    const walking = createExperiment(intention, history, { stem, care, recipe });
    for (const branch of ['movement', 'music']) {
      const owner = developCreation(walking, branch);
      const encoded = encodeCreation(owner);
      assert.equal(encodeCreation(decodeCreation(encoded)), encoded);
      const remix = contributeRhythm(decodeCreation(encoded), rhythm);
      assert.equal(encodeCreation(decodeCreation(encodeCreation(remix))), encodeCreation(remix));
    }
  }
});

test('bounded adversarial payload mutations do not pollute prototypes or mutate original', () => {
  const original = finished();
  const encoded = encodeCreation(original);
  for (let index = 0; index < encoded.length; index += 7) {
    const replacement = encoded[index] === 'A' ? 'B' : 'A';
    assert.throws(() => decodeCreation(encoded.slice(0, index) + replacement + encoded.slice(index + 1)));
  }
  assert.equal(encodeCreation(original), encoded);
  assert.equal({}.polluted, undefined);
});
