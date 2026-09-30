import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_GROUP_PARTICIPANTS, MAX_GROUP_CONTRIBUTIONS, MAX_GROUP_PAYLOAD_LENGTH,
  EMPTY_GROUP_HISTORY, GROUP_ROLES, GROUP_EXPERIENCE_TYPES,
  createGroupProject, addParticipant, applyContribution, forkGroupProject, versionAt,
  encodeGroupShare, decodeGroupShare, upgradeV1Project, recordGroupExperience,
  validateGroupHistory, migrateLegacyHistory, relationshipFor, availableGroupGaits,
} from '../src/group-project-engine.js';
import { createExperiment, developCreation, contributeRhythm, encodeCreation, decodeCreation, EMPTY_HISTORY } from '../src/experiment-engine.js';

const beatA = [1, 0, 1, 0, 0, 1, 0, 0];
const beatB = [0, 1, 0, 1, 0, 0, 1, 0];
const beatC = [1, 1, 0, 0, 1, 0, 0, 0];
const copy = value => JSON.parse(JSON.stringify(value));
const make = options => createGroupProject({ seed: 'test-project', ...options });
const pack = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const unpack = value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
function hash(value) {
  let result = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(JSON.stringify(value))) result = BigInt.asUintN(64, (result ^ BigInt(byte)) * 0x100000001b3n);
  return result.toString(16).padStart(16, '0');
}
function reseal(value) { value.id = hash({ ...value, id: '' }); return value; }
function finish(project = make(), options = {}, history = EMPTY_GROUP_HISTORY) {
  let next = applyContribution(project, project.participants.find(p => p.role === 'movement').id, { type: 'movement', gait: options.gait ?? 'glide' }, history);
  next = applyContribution(next, next.participants.find(p => p.role === 'rhythm').id, { type: 'rhythm', rhythm: options.rhythm ?? beatA });
  return applyContribution(next, next.participants.find(p => p.role === 'harmony').id, { type: 'harmony', harmony: options.harmony ?? 'sunrise', timbre: options.timbre ?? 'bell' });
}
function assertDeepFrozen(value) {
  if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) assertDeepFrozen(child); }
}

test('defaults are an extensible three-character ensemble, explicitly unverified', () => {
  const project = make();
  assert.equal(project.v, 2);
  assert.equal(project.participants.length, 3);
  assert.deepEqual(project.participants.map(person => person.role), ['movement', 'rhythm', 'harmony']);
  assert.ok(project.participants.every(person => person.unverified && person.kind === 'npc'));
  assert.equal(project.completed, false);
  assert.equal(project.progress.percent, 0);
  assert.deepEqual(project, make());
  assertDeepFrozen(project);
  assert.notEqual(createGroupProject().rootId, createGroupProject().rootId);
});

test('three complementary contributors materially change movement, rhythm and harmony', () => {
  const base = make(), before = copy(base);
  const moved = applyContribution(base, base.participants[0].id, { type: 'movement', gait: 'hop' });
  assert.notEqual(moved.traits.bounce, base.traits.bounce);
  const composed = applyContribution(moved, moved.participants[1].id, { type: 'rhythm', rhythm: beatA });
  assert.notEqual(composed.traits.tempo, moved.traits.tempo);
  const completed = applyContribution(composed, composed.participants[2].id, { type: 'harmony', harmony: 'moonlight', timbre: 'glass' });
  assert.notEqual(completed.traits.petals, composed.traits.petals);
  assert.notEqual(completed.traits.hue, composed.traits.hue);
  assert.deepEqual(completed.traits.harmonyNotes, [0, 3, 7]);
  assert.equal(completed.traits.timbre, 'glass');
  assert.equal(completed.completed, true);
  assert.deepEqual(completed.progress, { contributions: 3, contributors: 3, roles: ['movement', 'rhythm', 'harmony'], neededRoles: [], percent: 100 });
  assert.equal(moved.parentId, base.id);
  assert.equal(composed.parentId, moved.id);
  assert.equal(completed.parentId, composed.id);
  assert.equal(completed.rootId, base.rootId);
  assert.deepEqual(base, before);
  assertDeepFrozen(completed);
});

test('inputs are defensively copied and no same-role action can impersonate another role', () => {
  const inputs = [{ name: 'Éloise', role: 'movement' }, { name: 'Pip', role: 'rhythm' }, { name: 'Luma', role: 'harmony' }];
  const project = make({ participants: inputs }); inputs[0].name = 'Changed';
  assert.equal(project.participants[0].name, 'Éloise');
  const pattern = [...beatA];
  const changed = applyContribution(project, project.participants[1].id, { type: 'rhythm', rhythm: pattern }); pattern[0] = 0;
  assert.deepEqual(changed.rhythm, beatA);
  assert.throws(() => applyContribution(project, project.participants[0].id, { type: 'rhythm', rhythm: beatA }), /matching role/);
  assert.throws(() => applyContribution(project, 'p0000000000000000', { type: 'movement', gait: 'glide' }), /matching role/);
});

test('guests can choose roles, but one or two characters cannot fake three-member completion', () => {
  let one = make({ participants: [{ name: 'Visitor', role: 'guest', kind: 'shared' }] });
  const id = one.participants[0].id;
  one = applyContribution(one, id, { type: 'movement', gait: 'hop' });
  one = applyContribution(one, id, { type: 'rhythm', rhythm: beatA });
  one = applyContribution(one, id, { type: 'harmony', harmony: 'meadow', timbre: 'wood' });
  assert.equal(one.progress.contributors, 1); assert.equal(one.completed, false);
  assert.deepEqual(recordGroupExperience(EMPTY_GROUP_HISTORY, one), EMPTY_GROUP_HISTORY);
  let three = addParticipant(addParticipant(one, { name: 'Two', role: 'guest' }), { name: 'Three', role: 'guest' });
  three = applyContribution(three, three.participants[1].id, { type: 'rhythm', rhythm: beatB });
  assert.equal(three.completed, false);
  three = applyContribution(three, three.participants[2].id, { type: 'movement', gait: 'glide' });
  assert.equal(three.completed, true);
  assert.equal(recordGroupExperience(EMPTY_GROUP_HISTORY, three).pairs.length, 3);
});

test('identical actions, returning to an earlier pattern, and no-ops never advance progress', () => {
  const project = finish(), before = encodeGroupShare(project);
  assert.throws(() => applyContribution(project, project.participants[0].id, { type: 'movement', gait: 'glide' }), /new contribution/);
  assert.throws(() => applyContribution(project, project.participants[1].id, { type: 'rhythm', rhythm: beatA }), /new contribution/);
  assert.throws(() => applyContribution(project, project.participants[2].id, { type: 'harmony', harmony: 'sunrise', timbre: 'bell' }), /new contribution/);
  const alternate = applyContribution(project, project.participants[1].id, { type: 'rhythm', rhythm: beatB });
  assert.throws(() => applyContribution(alternate, alternate.participants[1].id, { type: 'rhythm', rhythm: beatA }), /new contribution/);
  const guest = addParticipant(project, { name: 'Echo', role: 'guest' });
  assert.throws(() => applyContribution(guest, guest.participants[3].id, { type: 'rhythm', rhythm: beatA }), /new contribution/);
  assert.equal(encodeGroupShare(project), before);
});

test('more than three contributors are represented and pair history excludes idle members', () => {
  let project = addParticipant(finish(), { name: 'Moss', role: 'guest' });
  let history = recordGroupExperience(EMPTY_GROUP_HISTORY, project);
  assert.equal(history.pairs.length, 3);
  assert.equal(relationshipFor(history, project, project.participants[0].id, project.participants[3].id).count, 0);
  project = applyContribution(project, project.participants[3].id, { type: 'rhythm', rhythm: beatB });
  history = recordGroupExperience(history, project);
  assert.equal(project.progress.contributors, 4);
  assert.equal(history.pairs.length, 6);
});

test('16-member snapshot budget can continue in a new linked roster without a permanent community cap', () => {
  let project = make();
  while (project.participants.length < MAX_GROUP_PARTICIPANTS) project = addParticipant(project, { name: `Guest ${project.participants.length}`, role: 'guest' });
  assert.equal(project.participants.length, 16);
  assert.throws(() => addParticipant(project, { name: 'Next guest', role: 'guest' }), /linked project/);
  const next = forkGroupProject(project, { participants: [] });
  assert.equal(next.parentId, project.id); assert.equal(next.rootId, project.rootId);
  assert.equal(next.generation, 1); assert.equal(next.participants.length, 0);
  const joined = addParticipant(next, { name: 'Next guest', role: 'guest' });
  assert.equal(joined.participants.length, 1);
  assert.ok(!project.participants.some(person => person.id === joined.participants[0].id));
  const fresh = forkGroupProject(project, { participants: project.participants.map(({ name, role, kind }) => ({ name, role, kind })) });
  assert.ok(fresh.participants.every(person => !project.participants.some(previous => previous.id === person.id)));
});

test('32-record append budget is enforced and continuation carries artwork with fresh work required', () => {
  let project = make();
  project = applyContribution(project, project.participants[0].id, { type: 'movement', gait: 'glide' });
  project = applyContribution(project, project.participants[2].id, { type: 'harmony', harmony: 'sunrise', timbre: 'bell' });
  for (let bits = 1; bits <= 30; bits++) project = applyContribution(project, project.participants[1].id, { type: 'rhythm', rhythm: Array.from({ length: 8 }, (_, i) => (bits >> i) & 1) });
  assert.equal(project.contributions.length, MAX_GROUP_CONTRIBUTIONS);
  assert.ok(encodeGroupShare(project).length <= MAX_GROUP_PAYLOAD_LENGTH);
  assert.throws(() => applyContribution(project, project.participants[1].id, { type: 'rhythm', rhythm: Array(8).fill(1) }), /linked project/);
  const next = forkGroupProject(project);
  assert.deepEqual(next.traits, project.traits); assert.deepEqual(next.rhythm, project.rhythm);
  assert.equal(next.gait, project.gait); assert.equal(next.completed, false); assert.equal(next.contributions.length, 0);
  assert.throws(() => applyContribution(next, next.participants[0].id, { type: 'movement', gait: next.gait }), /new contribution/);
  assert.equal(applyContribution(next, next.participants[0].id, { type: 'movement', gait: 'hop' }).contributions.length, 1);
});

test('canonical shares roundtrip Unicode labels and every immutable stage', () => {
  const original = finish(make({ title: 'Étoile du jardin', participants: [{ name: 'Éloise', role: 'movement' }, { name: '森', role: 'rhythm' }, { name: 'Luma', role: 'harmony' }] }));
  const before = encodeGroupShare(original);
  for (let count = 0; count <= original.contributions.length; count++) {
    const version = versionAt(original, count);
    assert.equal(version.contributions.length, count);
    const encoded = encodeGroupShare(version), decoded = decodeGroupShare(encoded);
    assert.equal(encodeGroupShare(decoded), encoded);
    assert.equal(decoded.source, 'shared');
    assert.deepEqual(decoded.participants, original.participants);
    assert.deepEqual(recordGroupExperience(EMPTY_GROUP_HISTORY, version), EMPTY_GROUP_HISTORY);
    assertDeepFrozen(decoded);
  }
  assert.equal(encodeGroupShare(original), before);
  assert.throws(() => versionAt(original, -1)); assert.throws(() => versionAt(original, 4));
});

test('a visitor makes a new immutable copy, preserving original owner snapshot and lineage', () => {
  const owner = finish(), ownerShare = encodeGroupShare(owner);
  const imported = decodeGroupShare(ownerShare), before = copy(imported);
  const joined = addParticipant(imported, { name: 'Fern', role: 'guest', kind: 'shared' });
  const copyProject = applyContribution(joined, joined.participants[3].id, { type: 'rhythm', rhythm: beatB });
  assert.equal(copyProject.rootId, owner.rootId);
  assert.equal(joined.parentId, owner.id); assert.equal(copyProject.parentId, joined.id);
  assert.deepEqual(imported, before); assert.equal(encodeGroupShare(owner), ownerShare);
  assert.deepEqual(recordGroupExperience(EMPTY_GROUP_HISTORY, imported), EMPTY_GROUP_HISTORY);
  const history = recordGroupExperience(EMPTY_GROUP_HISTORY, copyProject);
  assert.equal(history.pairs.length, 3);
  assert.ok(history.pairs.every(pair => pair.a === joined.participants[3].id || pair.b === joined.participants[3].id));
});

test('imported, cloned, source-spoofed and replayed claims never award local relationship credit', () => {
  const project = finish();
  assert.equal(recordGroupExperience(EMPTY_GROUP_HISTORY, project).pairs.length, 3);
  for (const claim of [copy(project), { ...copy(project), source: 'local' }, decodeGroupShare(encodeGroupShare(project)), versionAt(project, 3)]) {
    assert.deepEqual(recordGroupExperience(EMPTY_GROUP_HISTORY, claim), EMPTY_GROUP_HISTORY);
  }
  let imported = decodeGroupShare(encodeGroupShare(project));
  imported = applyContribution(imported, imported.participants[0].id, { type: 'movement', gait: 'hop' });
  const firstCredit = recordGroupExperience(EMPTY_GROUP_HISTORY, imported);
  assert.equal(firstCredit.pairs.length, 2);
  assert.ok(firstCredit.pairs.every(pair => pair.a === imported.participants[0].id || pair.b === imported.participants[0].id));
  imported = applyContribution(imported, imported.participants[1].id, { type: 'rhythm', rhythm: beatB });
  assert.equal(recordGroupExperience(EMPTY_GROUP_HISTORY, imported).pairs.length, 3);
  imported = applyContribution(imported, imported.participants[2].id, { type: 'harmony', harmony: 'meadow', timbre: 'wood' });
  assert.equal(recordGroupExperience(EMPTY_GROUP_HISTORY, imported).pairs.length, 3);
});

test('asynchronous A then B then C collaboration awards only the current local contributor edges', () => {
  let browserA = make();
  const [a, b, c] = browserA.participants.map(person => person.id);
  browserA = applyContribution(browserA, a, { type: 'movement', gait: 'glide' });
  assert.deepEqual(recordGroupExperience(EMPTY_GROUP_HISTORY, browserA), EMPTY_GROUP_HISTORY);
  let browserB = decodeGroupShare(encodeGroupShare(browserA));
  browserB = applyContribution(browserB, b, { type: 'rhythm', rhythm: beatA });
  assert.deepEqual(recordGroupExperience(EMPTY_GROUP_HISTORY, browserB), EMPTY_GROUP_HISTORY);
  let browserC = decodeGroupShare(encodeGroupShare(browserB));
  browserC = applyContribution(browserC, c, { type: 'harmony', harmony: 'sunrise', timbre: 'bell' });
  const historyC = recordGroupExperience(EMPTY_GROUP_HISTORY, browserC);
  assert.equal(historyC.pairs.length, 2);
  assert.equal(relationshipFor(historyC, browserC, c, a).count, 1);
  assert.equal(relationshipFor(historyC, browserC, c, b).count, 1);
  assert.equal(relationshipFor(historyC, browserC, a, b).count, 0);
  let browserD = addParticipant(decodeGroupShare(encodeGroupShare(browserC)), { name: 'Daisy', role: 'guest', kind: 'shared' });
  const d = browserD.participants.at(-1).id;
  browserD = applyContribution(browserD, d, { type: 'rhythm', rhythm: beatB });
  const historyD = recordGroupExperience(EMPTY_GROUP_HISTORY, browserD);
  assert.equal(historyD.pairs.length, 3);
  for (const participant of [a, b, c]) assert.equal(relationshipFor(historyD, browserD, d, participant).count, 1);
  assert.equal(relationshipFor(historyD, browserD, a, b).count, 0);
  assert.equal(relationshipFor(historyD, browserD, b, c).count, 0);
});

test('local relationship progress is scoped to participant pairs and distinct completed experience types', () => {
  const first = finish(), [a, b, c] = first.participants.map(person => person.id);
  let history = recordGroupExperience(EMPTY_GROUP_HISTORY, first);
  assert.deepEqual(relationshipFor(history, first, a, b), { completed: ['walking-flower'], count: 1, level: 'familiar', unlocks: [] });
  assert.deepEqual(recordGroupExperience(history, first), history);
  const repeat = finish(forkGroupProject(first), { gait: 'hop', rhythm: beatB, harmony: 'moonlight', timbre: 'glass' });
  history = recordGroupExperience(history, repeat);
  assert.equal(relationshipFor(history, repeat, a, b).count, 1);
  const second = finish(forkGroupProject(repeat, { experienceType: 'rhythm-garden' }), { gait: 'sway', rhythm: beatC, harmony: 'meadow', timbre: 'wood' });
  history = recordGroupExperience(history, second);
  assert.equal(relationshipFor(history, second, a, b).count, 2);
  assert.deepEqual(relationshipFor(history, second, a, c).unlocks, ['counterstep']);
  assert.ok(availableGroupGaits(history, second, a).includes('counterstep'));
  const next = forkGroupProject(second, { experienceType: 'harmony-garden' });
  assert.equal(applyContribution(next, a, { type: 'movement', gait: 'counterstep' }, history).gait, 'counterstep');
  const stranger = addParticipant(second, { name: 'Stranger', role: 'movement' });
  const strangerId = stranger.participants.at(-1).id;
  assert.equal(relationshipFor(history, stranger, a, strangerId).count, 0);
  assert.ok(!availableGroupGaits(history, stranger, strangerId).includes('counterstep'));
  assert.throws(() => applyContribution(stranger, strangerId, { type: 'movement', gait: 'counterstep' }, history), /two distinct/);
  const unrelated = finish(make({ seed: 'another-root' }));
  assert.equal(relationshipFor(history, unrelated, unrelated.participants[0].id, unrelated.participants[1].id).count, 0);
  assertDeepFrozen(history);
});

test('counterstep is unavailable without two distinct local relationship experiences', () => {
  const project = make();
  assert.deepEqual(availableGroupGaits(EMPTY_GROUP_HISTORY, project, project.participants[0].id), ['glide', 'hop', 'sway']);
  assert.throws(() => applyContribution(project, project.participants[0].id, { type: 'movement', gait: 'counterstep' }), /two distinct/);
  assert.throws(() => relationshipFor(EMPTY_GROUP_HISTORY, project, project.participants[0].id, project.participants[0].id));
  assert.throws(() => availableGroupGaits(EMPTY_GROUP_HISTORY, project, 'unknown'));
});

test('all v1 finished/remix shares and walking saves upgrade without changing old recipes or codecs', () => {
  const oldWalking = createExperiment('delight', EMPTY_HISTORY, { stem: 'straight', care: 'rain' });
  const oldMovement = developCreation(oldWalking, 'movement', { gait: 'hop' });
  const oldMusic = developCreation(createExperiment('wander'), 'music', { rhythm: beatA });
  const oldRemix = contributeRhythm(oldMusic, beatB);
  for (const legacy of [oldWalking, oldMovement, oldMusic, oldRemix, decodeCreation(encodeCreation(oldMovement))]) {
    const before = copy(legacy), upgraded = upgradeV1Project(legacy, { seed: 'legacy-upgrade' });
    assert.equal(upgraded.base.legacyId, legacy.id); assert.equal(upgraded.parentId, legacy.id);
    for (const key of ['stem', 'care', 'intention', 'recipe']) assert.equal(upgraded.base[key], legacy[key]);
    assert.equal(upgraded.gait, legacy.gait); assert.deepEqual(upgraded.rhythm, legacy.rhythm);
    assert.equal(upgraded.base.petals, legacy.traits.petals); assert.equal(upgraded.base.hue, legacy.traits.hue);
    assert.equal(upgraded.participants.length, 3); assert.ok(upgraded.participants.every(person => person.unverified));
    assert.equal(upgraded.contributions.length, 0); assert.equal(upgraded.completed, false);
    assert.deepEqual(recordGroupExperience(EMPTY_GROUP_HISTORY, upgraded), EMPTY_GROUP_HISTORY);
    assert.deepEqual(legacy, before);
    assert.equal(decodeGroupShare(encodeGroupShare(upgraded)).base.legacyId, legacy.id);
    if (legacy.stage !== 'walking') assert.equal(encodeCreation(legacy), encodeCreation(decodeCreation(encodeCreation(legacy))));
  }
  assert.throws(() => upgradeV1Project({ ...oldMovement, gait: 'glide' }));
});

test('legacy history migrates only to isolated legacy relationships, with no roster impersonation', () => {
  const legacy = { v: 1, completed: ['grow-walk', 'teach-step', 'compose-beat', 'rhythm-duet'] };
  const migrated = migrateLegacyHistory(legacy);
  assert.deepEqual(migrated.pairs, [
    { scope: 'legacy-v1', a: 'legacy-gardener', b: 'legacy-player', completed: ['grow-walk', 'teach-step', 'compose-beat'] },
    { scope: 'legacy-v1', a: 'legacy-guest', b: 'legacy-player', completed: ['rhythm-duet'] },
  ]);
  assert.deepEqual(migrateLegacyHistory(EMPTY_HISTORY), EMPTY_GROUP_HISTORY);
  const project = make();
  assert.equal(relationshipFor(migrated, project, project.participants[0].id, project.participants[1].id).count, 0);
  assert.ok(!availableGroupGaits(migrated, project, project.participants[0].id).includes('counterstep'));
  assert.throws(() => migrateLegacyHistory({ v: 1, completed: ['grow-walk', 'grow-walk'] }));
});

test('safe names and narrow schemas reject URLs, code, unknown fields and hidden accessors', () => {
  const project = make();
  for (const name of ['', ' ', ' A', 'A ', 'https://example.com', 'javascript:alert(1)', '<script>', '@person', 'A\nB', 'a'.repeat(25), 'A\u202eB']) assert.throws(() => addParticipant(project, { name, role: 'guest' }), TypeError);
  for (const input of [{ name: 'Safe', role: 'admin' }, { name: 'Safe', role: 'guest', kind: 'verified' }, { name: 'Safe', role: 'guest', id: 'same' }, { name: 'Safe', role: 'guest', home: 'user/repo' }]) assert.throws(() => addParticipant(project, input), TypeError);
  let invoked = false;
  const accessor = { role: 'guest' }; Object.defineProperty(accessor, 'name', { enumerable: true, get() { invoked = true; throw Error('Accessor'); } });
  assert.throws(() => addParticipant(project, accessor), TypeError); assert.equal(invoked, false);
  const dangerous = copy(project); dangerous.traits.petals = { toJSON() { invoked = true; return 5; } };
  assert.throws(() => encodeGroupShare(dangerous), TypeError); assert.equal(invoked, false);
  const executableText = { toJSON() { invoked = true; return 'Unsafe'; } };
  for (const options of [{ title: executableText }, { experienceType: executableText }]) {
    assert.throws(() => createGroupProject(options), TypeError);
    assert.throws(() => forkGroupProject(project, options), TypeError);
  }
  assert.equal(invoked, false);
});

test('malformed action arrays and silently inherited fields are rejected', () => {
  const project = make(), id = project.participants[1].id;
  const sparse = Array(8); sparse[0] = 1;
  const extras = [...beatA]; extras.url = 'https://example.com';
  const getter = [...beatA]; Object.defineProperty(getter, '0', { get() { throw Error('Getter executed'); }, enumerable: true });
  for (const steps of [null, '10100100', [], Array(8).fill(0), Array(8).fill(true), Array(8).fill(2), [...beatA, 1], [1, 0, 0, 0, 0, 0, 0, -0], sparse, extras, getter]) assert.throws(() => applyContribution(project, id, { type: 'rhythm', rhythm: steps }), TypeError);
  for (const action of [{ type: 'rhythm', rhythm: beatA, gait: 'glide' }, { type: 'harmony', harmony: 'evil', timbre: 'bell' }, { type: 'movement', gait: 'fly' }, Object.create({ type: 'rhythm', rhythm: beatA })]) assert.throws(() => applyContribution(project, id, action), TypeError);
});

test('shares reject corruption, unsupported versions, noncanonical JSON and oversized payloads', () => {
  const encoded = encodeGroupShare(finish());
  for (const bad of ['', 'A', '!!!', encoded + '=', 'x'.repeat(MAX_GROUP_PAYLOAD_LENGTH + 1), null]) assert.throws(() => decodeGroupShare(bad), TypeError);
  const source = unpack(encoded);
  const mutations = [
    value => { value.v = 3; }, value => { value.completed = true; },
    value => { value.rootId = '0000000000000000'; }, value => { value.generation = -1; }, value => { value.parentId = 'https://evil'; },
    value => { value.participants[0].unverified = false; }, value => { value.participants.push(value.participants[0]); },
    value => { value.participants[0].id = 'global-person'; }, value => { value.participants[0].name = '<img src=x>'; },
    value => { value.contributions[0].participantId = value.participants[1].id; }, value => { value.contributions[0].action.gait = 'fly'; },
    value => { value.contributions.push(value.contributions[0]); }, value => { value.base.rhythm = Array(8).fill(2); },
    value => { value.base.legacyId = 'user@example.com'; }, value => { value.base.timbre = 'bell'; },
  ];
  for (const mutate of mutations) { const payload = copy(source); mutate(payload); assert.throws(() => decodeGroupShare(pack(reseal(payload))), TypeError); }
  assert.throws(() => decodeGroupShare(pack({ ...source, id: '0000000000000000' })), TypeError);
  const raw = JSON.stringify(source);
  for (const noncanonical of [` ${raw}`, raw.replace('"v":2', '"v":2,"v":2'), raw.replace('"v":2', '"v":2.0'), raw.replace('"Clover"', '"\\u0043lover"')]) assert.throws(() => decodeGroupShare(Buffer.from(noncanonical).toString('base64url')), TypeError);
  assert.throws(() => decodeGroupShare(Buffer.from([0xff]).toString('base64url')), TypeError);
});

test('history validation rejects malformed pairs, duplicate types and false legacy claims', () => {
  const history = recordGroupExperience(EMPTY_GROUP_HISTORY, finish());
  assert.deepEqual(validateGroupHistory(copy(history)), history);
  const malformed = [
    { v: 1, pairs: [] }, { v: 2, pairs: [], verified: true }, { v: 2, pairs: [history.pairs[0], history.pairs[0]] },
    { v: 2, pairs: [{ ...history.pairs[0], completed: ['walking-flower', 'walking-flower'] }] },
    { v: 2, pairs: [{ ...history.pairs[0], completed: [] }] },
    { v: 2, pairs: [{ ...history.pairs[0], a: history.pairs[0].b }] },
    { v: 2, pairs: [{ ...history.pairs[0], completed: ['admin'] }] },
    { v: 2, pairs: [{ scope: 'legacy-v1', a: 'legacy-gardener', b: 'legacy-player', completed: ['rhythm-duet'] }] },
    { v: 2, pairs: [{ scope: 'legacy-v1', a: 'legacy-guest', b: 'legacy-player', completed: ['grow-walk'] }] },
  ];
  for (const value of malformed) assert.throws(() => validateGroupHistory(value), TypeError);
});

test('public option enumerations are frozen and include complementary and guest roles', () => {
  assert.deepEqual(GROUP_ROLES, ['movement', 'rhythm', 'harmony', 'guest']);
  assert.equal(GROUP_EXPERIENCE_TYPES.length, 3);
  assert.ok(Object.isFrozen(GROUP_ROLES)); assert.ok(Object.isFrozen(GROUP_EXPERIENCE_TYPES));
  assert.throws(() => createGroupProject({ title: '<b>Oops</b>' }));
  assert.throws(() => createGroupProject({ experienceType: 'unbounded' }));
  assert.throws(() => createGroupProject({ seed: 'a'.repeat(49) }));
});
