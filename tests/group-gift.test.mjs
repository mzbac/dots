import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createGroupProject, addParticipant, applyContribution, forkGroupProject,
  encodeGroupShare, decodeGroupShare, recordGroupExperience, EMPTY_GROUP_HISTORY,
} from '../src/group-project-engine.js';
import { GIFT_LIMITS, GIFT_PALETTE, parseGiftJson, loadCommunityWorld, validateWorld } from '../src/gifts.js';
import { GROUP_GIFT_SIZE, MAX_GROUP_GIFT_PROVENANCE_BYTES, createGroupGift, createGroupGiftProvenance, getGiftPreviewCommunity } from '../src/group-gift.js';

const copy = value => JSON.parse(JSON.stringify(value));
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const beatA = [1, 0, 1, 0, 0, 1, 0, 0];
const beatB = [0, 1, 0, 1, 0, 0, 1, 0];
const make = options => createGroupProject({ seed: 'gift-project', ...options });
function finish(project = make(), options = {}) {
  const gait = options.gait ?? 'glide';
  const [a, b] = project.participants.slice(0, 2).map(person => person.id).sort();
  const history = gait === 'counterstep' ? { v: 2, pairs: [{ scope: project.rootId, a, b, completed: ['walking-flower', 'rhythm-garden'] }] } : EMPTY_GROUP_HISTORY;
  let next = applyContribution(project, project.participants[0].id, { type: 'movement', gait }, history);
  next = applyContribution(next, next.participants[1].id, { type: 'rhythm', rhythm: options.rhythm ?? beatA });
  return applyContribution(next, next.participants[2].id, { type: 'harmony', harmony: options.harmony ?? 'sunrise', timbre: options.timbre ?? 'bell' });
}
function assertFrozen(value) {
  if (value && typeof value === 'object') {
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) assertFrozen(child);
  }
}
function community() {
  return loadCommunityWorld(readFileSync(new URL('./fixtures/reference-world.json', import.meta.url), 'utf8'), {
    'community/gifts/welcome-planter.json': readFileSync(new URL('../community/gifts/welcome-planter.json', import.meta.url), 'utf8'),
  });
}
// Exercise the full canonical schema range, including imported base recipes.
// This checksum is not authentication; the source decoder remains authoritative.
function withBase(project, patch) {
  const payload = JSON.parse(Buffer.from(encodeGroupShare(project), 'base64url').toString('utf8'));
  Object.assign(payload.base, patch);
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(JSON.stringify({ ...payload, id: '' }))) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  payload.id = hash.toString(16).padStart(16, '0');
  return decodeGroupShare(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url'));
}

test('completed snapshots export deterministic strict v1 gifts, without changing their recipe or credit', () => {
  const project = finish(), before = copy(project), sourceRecipe = encodeGroupShare(project);
  const credit = recordGroupExperience(EMPTY_GROUP_HISTORY, project);
  const gift = createGroupGift(project);
  assert.equal(gift.id, `group-flower-${project.id}`);
  assert.equal(gift.title, project.title);
  assert.deepEqual(Object.keys(gift), ['schemaVersion', 'id', 'title', 'creator', 'description', 'size', 'blocks']);
  assert.deepEqual(gift.size, [16, 20, 12]);
  assert.deepEqual(gift, parseGiftJson(JSON.stringify(gift)));
  assert.deepEqual(gift, createGroupGift(project));
  assert.deepEqual(gift, createGroupGift(decodeGroupShare(sourceRecipe)));
  assert.match(gift.description, /^Static /);
  assert.match(gift.creator, /unverified/);
  assert.deepEqual(project, before);
  assert.equal(encodeGroupShare(project), sourceRecipe);
  assert.deepEqual(recordGroupExperience(EMPTY_GROUP_HISTORY, project), credit);
  assertFrozen(gift);
});

test('incomplete, tampered, noncanonical and accessor-based source states cannot export', () => {
  const initial = make(), completed = finish();
  const malformed = [null, {}, initial, { ...copy(initial), completed: true }, { ...copy(completed), id: '0'.repeat(16) }, { ...copy(completed), url: 'https://example.com' }, { ...copy(completed), rhythm: beatB }, { ...copy(completed), traits: { ...copy(completed.traits), petals: 512 } }];
  let read = false;
  const getter = copy(completed);
  Object.defineProperty(getter, 'completed', { enumerable: true, get() { read = true; return true; } });
  malformed.push(getter);
  for (const source of malformed) {
    assert.throws(() => createGroupGift(source));
    assert.throws(() => createGroupGiftProvenance(source));
  }
  assert.equal(read, false);
  assert.throws(() => createGroupGift(initial), /Complete the group project/);
});

test('stem, petal count, all four boot gaits, harmony, timbre and rhythm change geometry', () => {
  const base = finish(), original = createGroupGift(base);
  const alternatives = [
    withBase(base, { stem: 'straight' }),
    withBase(base, { petals: 9 }),
    finish(make(), { gait: 'hop' }),
    finish(make(), { gait: 'sway' }),
    finish(make(), { gait: 'counterstep' }),
    finish(make(), { harmony: 'moonlight' }),
    finish(make(), { harmony: 'meadow' }),
    finish(make(), { timbre: 'wood' }),
    finish(make(), { timbre: 'glass' }),
    finish(make(), { rhythm: beatB }),
  ];
  for (const project of alternatives) {
    const gift = createGroupGift(project);
    assert.notEqual(gift.id, original.id);
    assert.notDeepEqual(gift.blocks, original.blocks);
  }
  assert.equal(new Set(['glide', 'hop', 'sway', 'counterstep'].map(gait => JSON.stringify(createGroupGift(finish(make(), { gait })).blocks))).size, 4);
});

test('every petal has a distinct tip and eight static beat marks preserve the exact rhythm', () => {
  for (let petals = 3; petals <= 16; petals++) {
    const project = withBase(finish(), { petals }), gift = createGroupGift(project);
    const tips = gift.blocks.filter(block => block[2] === 5 && block[3] === 1 && block[4] === 1 && block[5] === 3);
    assert.equal(tips.length, project.traits.petals);
    assert.equal(new Set(tips.map(block => `${block[0]},${block[1]}`)).size, project.traits.petals);
    const rhythm = gift.blocks.filter(block => block[1] === 3 && block[2] === 0 && block[3] === 1 && block[5] === 1);
    assert.deepEqual(rhythm.map(block => block[0]), [0, 2, 4, 6, 8, 10, 12, 14]);
    assert.deepEqual(rhythm.map(block => block[4] - 1), project.rhythm);
    assert.deepEqual(rhythm.map(block => block[6]), project.rhythm.map(beat => beat ? 'honey' : 'cream'));
  }
});

test('the full authored variant range remains under the plot, block and byte budgets', () => {
  for (const experienceType of ['walking-flower', 'rhythm-garden', 'harmony-garden']) {
    for (const gait of ['glide', 'hop', 'sway', 'counterstep']) {
      for (const harmony of ['sunrise', 'moonlight', 'meadow']) {
        for (const timbre of ['bell', 'wood', 'glass']) {
          for (const stem of ['curved', 'straight']) {
            const project = withBase(finish(make({ experienceType }), { gait, harmony, timbre, rhythm: Array(8).fill(1) }), { stem, petals: 16 });
            const gift = createGroupGift(project);
            assert.ok(gift.blocks.length <= GIFT_LIMITS.blocks);
            assert.ok(bytes(gift) <= GIFT_LIMITS.bytes);
            assert.deepEqual(gift.size, GROUP_GIFT_SIZE);
            for (const block of gift.blocks) {
              assert.ok(block.slice(0, 6).every(Number.isSafeInteger));
              assert.ok(Object.hasOwn(GIFT_PALETTE, block[6]));
              for (let axis = 0; axis < 3; axis++) {
                assert.ok(block[axis] >= 0 && block[axis + 3] > 0);
                assert.ok(block[axis] + block[axis + 3] <= GROUP_GIFT_SIZE[axis]);
              }
            }
          }
        }
      }
    }
  }
});

test('provenance preserves exact contributor labels and canonical source, with honest guest attribution', () => {
  const names = ["Éloise O'Neil", '森', 'Luma'];
  let project = finish(make({ title: 'Étoile du jardin', participants: names.map((name, index) => ({ name, role: 'guest', kind: ['local', 'npc', 'shared'][index] })) }));
  project = addParticipant(project, { name: 'Quiet guest', role: 'guest', kind: 'shared' });
  const before = encodeGroupShare(project), provenance = createGroupGiftProvenance(project);
  assert.equal(provenance.kind, 'group-flower-provenance');
  assert.equal(provenance.giftId, createGroupGift(project).id);
  assert.equal(provenance.projectId, project.id);
  assert.equal(provenance.rootId, project.rootId);
  assert.equal(provenance.parentId, project.parentId);
  assert.equal(provenance.generation, project.generation);
  assert.equal(provenance.static, true);
  assert.equal(provenance.unverified, true);
  assert.deepEqual(provenance.contributors.map(person => person.name), names);
  assert.deepEqual(provenance.contributors.map(person => person.kind), ['local', 'npc', 'shared']);
  for (const contributor of provenance.contributors) {
    const original = project.participants.find(person => person.id === contributor.id);
    const { contributionIds, ...person } = contributor;
    assert.deepEqual(person, original);
    assert.equal(contributor.role, original.role);
    assert.equal(contributor.unverified, true);
    assert.deepEqual(contributionIds, project.contributions.filter(record => record.participantId === contributor.id).map(record => record.id));
  }
  assert.equal(provenance.sourceRecipe, before);
  assert.equal(encodeGroupShare(decodeGroupShare(provenance.sourceRecipe)), before);
  assert.equal(decodeGroupShare(provenance.sourceRecipe).participants.length, 4);
  assert.ok(!Object.keys(provenance).some(key => /url|link/i.test(key)));
  assert.ok(bytes(provenance) <= MAX_GROUP_GIFT_PROVENANCE_BYTES);
  assert.equal(encodeGroupShare(project), before);
  assertFrozen(provenance);
});

test('maximum participant and contribution budgets retain every exact credited name within 32 KiB', () => {
  let project = make({ title: '森'.repeat(48), participants: Array.from({ length: 16 }, (_, index) => ({ name: `${'森'.repeat(21)} ${index}`, role: 'guest', kind: index % 2 ? 'shared' : 'local' })) });
  project = finish(project);
  for (let index = 3; index < 16; index++) {
    const rhythm = Array.from({ length: 8 }, (_, bit) => (index >> bit) & 1);
    project = applyContribution(project, project.participants[index].id, { type: 'rhythm', rhythm });
  }
  for (let pattern = 16; project.contributions.length < 32; pattern++) {
    const rhythm = Array.from({ length: 8 }, (_, bit) => (pattern >> bit) & 1);
    project = applyContribution(project, project.participants[pattern % 16].id, { type: 'rhythm', rhythm });
  }
  const provenance = createGroupGiftProvenance(project), gift = createGroupGift(project);
  assert.equal(provenance.contributors.length, 16);
  assert.deepEqual(provenance.contributors.map(person => person.name), project.participants.map(person => person.name));
  assert.equal(provenance.contributors.reduce((count, person) => count + person.contributionIds.length, 0), 32);
  assert.ok(bytes(provenance) <= MAX_GROUP_GIFT_PROVENANCE_BYTES);
  assert.ok(bytes(gift) <= GIFT_LIMITS.bytes);
  assert.ok(gift.creator.length <= 40);
});

test('a completed linked chapter keeps its exact lineage and requires fresh completion', () => {
  const original = finish(), chapter = forkGroupProject(original, { experienceType: 'rhythm-garden' });
  assert.throws(() => createGroupGift(chapter), /Complete/);
  const project = finish(chapter, { gait: 'hop', rhythm: beatB, harmony: 'moonlight' });
  const provenance = createGroupGiftProvenance(project);
  assert.equal(provenance.rootId, original.rootId);
  assert.equal(provenance.generation, 1);
  assert.equal(provenance.parentId, project.parentId);
  assert.equal(provenance.projectId, project.id);
  assert.equal(decodeGroupShare(provenance.sourceRecipe).base.gait, original.gait);
});

test('garden preview is validated, freshly copied, within the empty open plot and never changes accepted data', () => {
  const accepted = community(), before = copy(accepted), gift = createGroupGift(finish()), giftBefore = copy(gift);
  const preview = getGiftPreviewCommunity(accepted, gift);
  assert.equal(accepted.placements.length, 1);
  assert.equal(preview.placements.length, 2);
  assert.equal(preview.emptySlots.length, accepted.emptySlots.length - 1);
  const placement = preview.placements.find(item => item.gift.id === gift.id);
  assert.equal(placement.slot.id, 'open-plot');
  assert.deepEqual(placement.origin, placement.slot.origin);
  assert.notEqual(placement.gift, gift);
  assert.notEqual(preview.manifest, accepted.manifest);
  assert.deepEqual(accepted, before);
  assert.deepEqual(gift, giftBefore);
  assert.equal(preview.totalBlocks, accepted.totalBlocks + gift.blocks.length);
  assertFrozen(preview);
  assert.throws(() => getGiftPreviewCommunity(preview, gift), /occupied/);
});

test('preview rejects malformed gifts, unavailable or undersized slots and corrupted accepted manifests', () => {
  const accepted = community(), gift = createGroupGift(finish());
  assert.throws(() => getGiftPreviewCommunity(accepted, { ...gift, script: 'run' }));
  assert.throws(() => getGiftPreviewCommunity(accepted, { ...gift, size: [17, 20, 12] }), /fit/);
  const registry = Object.fromEntries(accepted.placements.map(item => [`community/gifts/${item.gift.id}.json`, item.gift]));
  const missing = validateWorld({ ...accepted.manifest, slots: accepted.manifest.slots.filter(slot => slot.id !== 'open-plot') }, registry);
  assert.throws(() => getGiftPreviewCommunity(missing, gift), /no open-plot/);
  assert.throws(() => getGiftPreviewCommunity({ ...accepted, manifest: { ...accepted.manifest, accepted: [] } }, gift), /unaccepted/);
  let read = false;
  const hostile = { ...accepted };
  Object.defineProperty(hostile, 'placements', { enumerable: true, get() { read = true; return accepted.placements; } });
  assert.throws(() => getGiftPreviewCommunity(hostile, gift));
  assert.equal(read, false);
});
