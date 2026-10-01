import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  GIFT_LIMITS, GIFT_PALETTE, GRID_UNIT, GiftValidationError,
  parseGiftJson, parseWorldJson, validateGift, validateGiftPath,
  validateWorld, loadCommunityWorld, giftToInstances, areaBounds,
} from '../src/gifts.js';
import { readBoundedJson, validateGiftFile, validateRepository } from '../tools/validate-gifts.mjs';

const rawGift = await readFile(new URL('../community/gifts/welcome-planter.json', import.meta.url), 'utf8');
const rawWorld = await readFile(new URL('./fixtures/reference-world.json', import.meta.url), 'utf8');
const clone = value => structuredClone(value);
const gift = () => JSON.parse(rawGift);
const world = () => JSON.parse(rawWorld);
const registry = () => ({ 'community/gifts/welcome-planter.json': gift() });
const rejectsGift = value => assert.throws(() => validateGift(value), GiftValidationError);
const run = promisify(execFile);
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dot-gifts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'community/gifts'), { recursive: true });
  await writeFile(path.join(root, 'community/world.json'), rawWorld);
  await writeFile(path.join(root, 'community/gifts/welcome-planter.json'), rawGift);
  return root;
}

test('original planter validates, preserves intended overlaps and is copied/frozen', () => {
  const input = gift();
  const result = validateGift(input);
  assert.equal(result.blocks.length, 20);
  assert.deepEqual(result, input);
  assert.notEqual(result, input);
  assert.notEqual(result.blocks, input.blocks);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.blocks[0]));
  input.blocks[0][0] = 999;
  assert.equal(result.blocks[0][0], 1);
  assert.throws(() => { result.title = 'changed'; }, TypeError);
});
test('palette contains exactly the six design colors', () => {
  assert.deepEqual(GIFT_PALETTE, { sage: 0x91a282, fern: 0x5b8249, clay: 0xbf9969, honey: 0xddbf79, cream: 0xf1dfb3, bark: 0x6f6547 });
  assert.equal(GRID_UNIT, 0.1);
});
test('instance conversion uses min corners, fixed scale and trusted numeric palette', () => {
  const cells = giftToInstances(gift(), [10, 2, 4]);
  assert.deepEqual(cells[0], [10.6, 2.05, 4.4, 1, 0.1, 0.6000000000000001, 0xbf9969]);
  assert.equal(cells.length, 20);
  assert.ok(Object.isFrozen(cells[0]));
  for (const cell of cells) assert.ok(cell.every(Number.isFinite));
  for (const invalid of [[Infinity, 0, 0], [NaN, 0, 0], [1001, 0, 0], [0, 0], ['0', 0, 0]]) assert.throws(() => giftToInstances(gift(), invalid), GiftValidationError);
});
test('world yields centered floor-aligned placement and the named empty plot', () => {
  const result = loadCommunityWorld(rawWorld, { 'community/gifts/welcome-planter.json': rawGift });
  assert.equal(result.placements.length, 1);
  assert.equal(result.totalBlocks, 20);
  assert.equal(result.emptySlots[0].id, 'open-plot');
  assert.deepEqual(result.placements[0].origin, [-2.1999999999999997, 0.12, 5.8]);
  assert.deepEqual(result.placements[0].bounds.min, result.placements[0].origin);
  assert.ok(Object.isFrozen(result.placements[0].bounds.min));
  assert.equal(result.placements[0].gift.id, 'welcome-planter');
});
test('gift AABB remains within its slot even when geometry does not fill its size', () => {
  const result = validateWorld(world(), registry());
  const { bounds, slot } = result.placements[0];
  const reserved = areaBounds(slot);
  for (let i = 0; i < 3; i++) {
    assert.ok(bounds.min[i] >= reserved.min[i]);
    assert.ok(bounds.max[i] <= reserved.max[i]);
  }
});
for (const invalid of [null, [], 1, 'gift', true, new Date(), Object.create({ inherited: true })]) {
  test(`reject non-record gift ${String(invalid)}`, () => rejectsGift(invalid));
}
for (const key of ['schemaVersion', 'id', 'title', 'creator', 'description', 'size', 'blocks']) {
  test(`reject missing gift key ${key}`, () => { const value = gift(); delete value[key]; rejectsGift(value); });
}
for (const key of ['script', 'url', 'src', 'model', 'shader', 'import', 'callback', 'origin', 'status', 'camera', 'lights', 'prototype', 'constructor']) {
  test(`reject extra or privileged gift key ${key}`, () => { const value = gift(); value[key] = 'forbidden'; rejectsGift(value); });
}
test('reject prototype keys at any JSON depth without prototype pollution', () => {
  for (const source of ['{"__proto__":{"polluted":true}}', rawGift.replace('"title":', '"constructor":{"prototype":{"polluted":true}},"title":'), rawGift.replace('"blocks": [', '"blocks": [{"__proto__":{}},')]) assert.throws(() => parseGiftJson(source), GiftValidationError);
  assert.equal({}.polluted, undefined);
});
test('reject executable getters, symbols and non-enumerable properties without invoking getters', () => {
  const value = gift(); let ran = false;
  Object.defineProperty(value, 'title', { get() { ran = true; return 'title'; }, enumerable: true });
  rejectsGift(value); assert.equal(ran, false);
  const symbol = gift(); symbol[Symbol('extra')] = true; rejectsGift(symbol);
  const hidden = gift(); Object.defineProperty(hidden, 'title', { value: 'hidden', enumerable: false }); rejectsGift(hidden);
});
for (const version of [0, 2, '1', null, Infinity, NaN]) {
  test(`reject invalid schema version ${version}`, () => { const value = gift(); value.schemaVersion = version; rejectsGift(value); });
}
for (const id of ['', 'a'.repeat(49), 'Upper', '../escape', 'two_words', 'two--hyphens', '-start', 'end-', 'with space', 'é', 'constructor', '__proto__']) {
  test(`reject invalid slug ${JSON.stringify(id)}`, () => { const value = gift(); value.id = id; rejectsGift(value); });
}
test('accept slug boundaries and title/creator/description limits', () => {
  for (const id of ['a', 'a'.repeat(48), 'gift-123']) { const value = gift(); value.id = id; validateGift(value); }
  const value = gift(); value.title = 'x'.repeat(60); value.creator = 'x'.repeat(40); value.description = 'x'.repeat(240); validateGift(value);
  value.description = ''; validateGift(value);
});
for (const [key, limit] of [['title', 60], ['creator', 40], ['description', 240]]) {
  test(`reject invalid ${key} length/type`, () => {
    for (const text of ['x'.repeat(limit + 1), null, 3, {}, []]) { const value = gift(); value[key] = text; rejectsGift(value); }
    if (key !== 'description') for (const text of ['', '  ']) { const value = gift(); value[key] = text; rejectsGift(value); }
  });
}
for (const text of ['<script>alert(1)</script>', 'a > b', 'a\nb', 'a\tb', 'a\u0000b', 'a\u007fb', 'a\u202eb', 'a\u200bb', '\ud800', 'https://example.com', 'http : //example.com', '//example.test', 'www.example.test', 'example.com', 'mailto:a@b.test', 'javascript:alert(1)', 'data:text/html,test', 'file:/etc/passwd', 'custom://host/path']) {
  test(`reject unsafe text ${JSON.stringify(text)}`, () => {
    for (const key of ['title', 'creator', 'description']) { const value = gift(); value[key] = text; rejectsGift(value); }
  });
}
test('ordinary Unicode, punctuation and text remain plain data', () => {
  const value = gift(); value.title = 'A cozy café 🌻'; value.description = 'Flowers, pots & petals — all original.';
  assert.equal(validateGift(value).title, value.title);
});
for (const bad of [NaN, Infinity, -Infinity, 1.5, '2', null, 0, -1, 33, Number.MAX_SAFE_INTEGER]) {
  test(`reject size value ${bad}`, () => { const value = gift(); value.size[0] = bad; rejectsGift(value); });
}
for (const bad of [[], [1, 2], [1, 2, 3, 4], {}, null]) {
  test(`reject invalid size shape ${JSON.stringify(bad)}`, () => { const value = gift(); value.size = bad; rejectsGift(value); });
}
test('reject sparse arrays, array accessors, inherited arrays and array extra keys', () => {
  const sparse = gift(); delete sparse.blocks[0][0]; rejectsGift(sparse);
  const extra = gift(); extra.blocks[0].asset = 'bad'; rejectsGift(extra);
  const proto = gift(); Object.setPrototypeOf(proto.size, {}); rejectsGift(proto);
  const getter = gift(); let ran = false; Object.defineProperty(getter.blocks[0], '0', { get() { ran = true; return 1; }, enumerable: true }); rejectsGift(getter); assert.equal(ran, false);
});
test('reject invalid block array shapes/counts', () => {
  for (const blocks of [[], new Array(513).fill([0, 0, 0, 1, 1, 1, 'sage']), {}, null, [[0, 0, 0, 1, 1, 1]], [[0, 0, 0, 1, 1, 1, 'sage', 'extra']]]) { const value = gift(); value.blocks = blocks; rejectsGift(value); }
});
for (let index = 0; index < 6; index++) {
  test(`reject bad block coordinate/dimension ${index}`, () => {
    for (const bad of [NaN, Infinity, -Infinity, 0.5, '1', -1, 33, Number.MAX_SAFE_INTEGER]) { const value = gift(); value.blocks[0][index] = bad; rejectsGift(value); }
    if (index > 2) { const value = gift(); value.blocks[0][index] = 0; rejectsGift(value); }
  });
}
test('check full extents, not just block origins', () => {
  for (let axis = 0; axis < 3; axis++) { const value = gift(); value.blocks[0][axis] = value.size[axis] - 1; value.blocks[0][axis + 3] = 2; rejectsGift(value); }
});
for (const color of ['#91A282', 0x91a282, 'Sage', 'red', 'constructor', '__proto__', {}, null]) {
  test(`reject arbitrary palette value ${JSON.stringify(color)}`, () => { const value = gift(); value.blocks[0][6] = color; rejectsGift(value); });
}
test('512 internally overlapping boxes are allowed and retained', () => {
  const value = gift(); value.blocks = Array.from({ length: 512 }, () => [0, 0, 0, 1, 1, 1, 'sage']);
  assert.equal(validateGift(value).blocks.length, 512);
});
test('byte cap applies before JSON parsing, including multibyte UTF-8', () => {
  assert.throws(() => parseGiftJson('{'.repeat(GIFT_LIMITS.bytes + 1)), /byte limit/);
  assert.throws(() => parseGiftJson('é'.repeat(32769)), /byte limit/);
  assert.throws(() => parseWorldJson('x'.repeat(GIFT_LIMITS.bytes + 1)), /byte limit/);
  const exact = rawGift + ' '.repeat(GIFT_LIMITS.bytes - Buffer.byteLength(rawGift));
  assert.equal(parseGiftJson(exact).id, 'welcome-planter');
  assert.throws(() => parseGiftJson(exact + ' '), /byte limit/);
  for (const source of ['', '{', '{} trailing', 'NaN', 'Infinity', 'null', '[]', '{"schemaVersion":1e999}', rawGift.replace('"schemaVersion": 1', '"schemaVersion": 1e999')]) assert.throws(() => parseGiftJson(source), GiftValidationError);
});
for (const bad of ['../gift.json', '/gift.json', 'community/gifts/../gift.json', 'community/gifts/gift.JSON', 'community/gifts/gift.js', 'community/gifts/gift.json?x', 'community/gifts/gift.json#x', 'community/gifts/%2e%2e.json', 'community/gifts/a/b.json', 'https://example.com/gift.json', 'community\\gifts\\gift.json', 'community/gifts/-bad.json', 'community/gifts/a'.concat('a'.repeat(48), '.json'), 'community/gifts/gift.json\u0000']) {
  test(`reject registry path ${JSON.stringify(bad)}`, () => assert.throws(() => validateGiftPath(bad), GiftValidationError));
}
test('world rejects invalid object shapes, schema, scale and undeclared controls', () => {
  for (const input of [null, [], {}]) assert.throws(() => validateWorld(input, registry()), GiftValidationError);
  for (const change of [{ schemaVersion: 2 }, { gridUnit: 1 }, { camera: {} }, { status: 'resting' }]) assert.throws(() => validateWorld({ ...world(), ...change }, registry()), GiftValidationError);
  const value = world(); delete value.protectedAreas; assert.throws(() => validateWorld(value, registry()), GiftValidationError);
});
test('world rejects malformed areas, bounds, references and registry entries', () => {
  const mutations = [
    w => { w.zones = []; }, w => { w.zones[0].origin[0] = Infinity; },
    w => { w.zones[0].origin[0] = 1001; }, w => { w.zones[0].size[0] = 257; },
    w => { w.slots[0].size[1] = 0; }, w => { w.slots[0].size[0] = 2.5; },
    w => { w.slots[0].zone = 'missing'; }, w => { w.slots[0].origin[0] = 900; },
    w => { w.accepted[0].slot = 'missing'; }, w => { w.accepted[0].path = 'community/gifts/other.json'; },
    w => { w.accepted[0].source = 'bad'; }, w => { w.slots[0].script = 'bad'; },
    w => { w.protectedAreas[0].origin = [0, 0]; },
  ];
  for (const mutate of mutations) { const value = world(); mutate(value); assert.throws(() => validateWorld(value, registry()), GiftValidationError); }
});
test('world rejects duplicate ids, occupied slots and overlapping reserved areas', () => {
  for (const collection of ['zones', 'slots', 'protectedAreas', 'accepted']) {
    const value = world(); value[collection].push(clone(value[collection][0]));
    assert.throws(() => validateWorld(value, registry()), /Duplicate/);
  }
  const slots = world(); slots.slots[1].origin = [...slots.slots[0].origin]; assert.throws(() => validateWorld(slots, registry()), /overlap/);
  const zones = world(); zones.zones.push({ ...clone(zones.zones[0]), id: 'other-zone' }); assert.throws(() => validateWorld(zones, registry()), /overlap/);
  const occupied = world(); occupied.accepted.push({ id: 'another-gift', path: 'community/gifts/another-gift.json', slot: 'welcome-plot' }); assert.throws(() => validateWorld(occupied, registry()), /Duplicate accepted gift slot/);
});
test('world rejects protected room intrusion even in an empty plot', () => {
  const value = world(); value.protectedAreas.push({ id: 'reserved-plot', origin: [1, 0.12, 5.6], size: [1, 1, 1] });
  assert.throws(() => validateWorld(value, registry()), /protected area/);
});
test('touching slot and protected boundaries do not count as collisions', () => {
  const value = world(); value.slots[1].origin[0] = value.slots[0].origin[0] + 1.6;
  value.protectedAreas.push({ id: 'touching-area', origin: [-2.4, -0.88, 5.6], size: [16, 10, 12] });
  validateWorld(value, registry());
});
test('full gift footprint must fit slot, regardless of tiny geometry', () => {
  const value = gift(); value.size = [32, 32, 32]; value.blocks = [[0, 0, 0, 1, 1, 1, 'sage']];
  assert.throws(() => validateWorld(world(), { 'community/gifts/welcome-planter.json': value }), /fit/);
});
test('registry rejects unresolved, mismatched, unaccepted and unsafe gift files', () => {
  assert.throws(() => validateWorld(world(), {}), /unresolved/);
  const renamed = gift(); renamed.id = 'different'; assert.throws(() => validateWorld(world(), { 'community/gifts/welcome-planter.json': renamed }), /match/);
  assert.throws(() => validateWorld(world(), { ...registry(), 'community/gifts/extra.json': gift() }), /unaccepted/);
  assert.throws(() => validateWorld(world(), { '../bad.json': gift() }), /path/);
  for (const value of [null, [], new Date()]) assert.throws(() => validateWorld(world(), value), GiftValidationError);
  const accessor = {}; let ran = false; Object.defineProperty(accessor, 'community/gifts/welcome-planter.json', { get() { ran = true; }, enumerable: true }); assert.throws(() => validateWorld(world(), accessor), GiftValidationError); assert.equal(ran, false);
});
test('raw loader rejects object module imports and malformed JSON', () => {
  assert.throws(() => loadCommunityWorld(rawWorld, registry()), /JSON text/);
  assert.throws(() => loadCommunityWorld(rawWorld, { 'community/gifts/welcome-planter.json': 'not json' }), /not valid JSON/);
});
test('eight instances / 4096 boxes are accepted, any ninth instance is rejected', () => {
  const value = world(); value.zones = [{ id: 'large-garden', origin: [0, 0, 5], size: [256, 32, 32] }]; value.slots = []; value.accepted = []; value.protectedAreas = [];
  const gifts = {};
  for (let i = 0; i < 8; i++) {
    const id = `gift-${i}`, slot = `slot-${i}`;
    value.slots.push({ id: slot, zone: 'large-garden', origin: [i * 3, 0, 5], size: [16, 20, 12] });
    value.accepted.push({ id, path: `community/gifts/${id}.json`, slot });
    gifts[`community/gifts/${id}.json`] = { ...gift(), id, blocks: Array.from({ length: 512 }, () => [0, 0, 0, 1, 1, 1, 'sage']) };
  }
  assert.equal(validateWorld(value, gifts).totalBlocks, 4096);
  value.accepted.push({ id: 'ninth', path: 'community/gifts/ninth.json', slot: 'slot-0' });
  assert.throws(() => validateWorld(value, gifts), /World accepted/);
});
test('filesystem reader and repository validator accept local original JSON', async t => {
  const root = await fixture(t);
  assert.equal(await readBoundedJson(path.join(root, 'community/gifts/welcome-planter.json'), { baseDir: root }), rawGift);
  const result = await validateRepository(root); assert.equal(result.checkedFiles, 1); assert.equal(result.world.totalBlocks, 20);
  const preview = await validateGiftFile(path.join(root, 'community/gifts/welcome-planter.json'), root); assert.equal(preview.slot.id, 'open-plot');
});
test('repository checks unaccepted JSON but only places approved entries', async t => {
  const root = await fixture(t), value = gift(); value.id = 'new-gift';
  await writeFile(path.join(root, 'community/gifts/new-gift.json'), JSON.stringify(value));
  const result = await validateRepository(root); assert.equal(result.checkedFiles, 2); assert.equal(result.world.placements.length, 1);
  value.title = '<img>'; await writeFile(path.join(root, 'community/gifts/new-gift.json'), JSON.stringify(value));
  await assert.rejects(validateRepository(root), GiftValidationError);
});
test('reader rejects oversize and invalid UTF-8 before parse', async t => {
  const root = await fixture(t), file = path.join(root, 'large.json');
  await writeFile(file, Buffer.alloc(GIFT_LIMITS.bytes + 1, 0x7b)); await assert.rejects(readBoundedJson(file), /byte limit/);
  await writeFile(file, Buffer.from([0xff, 0xfe])); await assert.rejects(readBoundedJson(file), /UTF-8/);
});
test('reader rejects leaf and parent symlinks', async t => {
  const root = await fixture(t), original = path.join(root, 'community/gifts/welcome-planter.json');
  const link = path.join(root, 'linked.json'); await symlink(original, link); await assert.rejects(readBoundedJson(link), /Symlinks/);
  const directory = path.join(root, 'linked-directory'); await symlink(path.join(root, 'community/gifts'), directory);
  await assert.rejects(readBoundedJson(path.join(directory, 'welcome-planter.json')), /Symlinks/);
  await symlink(original, path.join(root, 'community/gifts/symlinked.json')); await assert.rejects(validateRepository(root), /symlinks/);
});
test('reader rejects directories, traversal, URLs, bad extensions and base escape', async t => {
  const root = await fixture(t), file = path.join(root, 'community/gifts/welcome-planter.json');
  for (const value of [path.join(root, 'evil.js'), `${root}/../escape.json`, 'https://example.com/file.json', `${root}/a%20b.json`, `${root}/x.json?url=1`, `${root}/x.JSON`, `${root}/x\\file.json`]) await assert.rejects(readBoundedJson(value), GiftValidationError);
  await assert.rejects(readBoundedJson(file, { baseDir: path.join(root, 'elsewhere') }), /escapes/);
  const folder = path.join(root, 'folder.json'); await mkdir(folder); await assert.rejects(readBoundedJson(folder), /regular file/);
});
test('repository rejects missing accepted file and any non-JSON code file without executing it', async t => {
  const root = await fixture(t); await rm(path.join(root, 'community/gifts/welcome-planter.json'));
  await assert.rejects(validateRepository(root), /missing JSON/);
  await writeFile(path.join(root, 'community/gifts/welcome-planter.json'), rawGift);
  await writeFile(path.join(root, 'community/gifts/run.js'), 'throw new Error("CONTRIBUTOR CODE EXECUTED")');
  await assert.rejects(validateRepository(root), /Gift path/);
});
test('repository rejects file/id mismatch and duplicate ids', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'community/gifts/another.json'), rawGift);
  await assert.rejects(validateRepository(root), /match|Duplicate/);
});
test('single gift validation rejects filename mismatch, oversized preview and occupied preview', async t => {
  const root = await fixture(t), value = gift();
  await writeFile(path.join(root, 'wrong-name.json'), rawGift); await assert.rejects(validateGiftFile(path.join(root, 'wrong-name.json'), root), /filename/);
  value.size = [32, 16, 8]; await writeFile(path.join(root, 'welcome-planter.json'), JSON.stringify(value)); await assert.rejects(validateGiftFile(path.join(root, 'welcome-planter.json'), root), /preview slot/);
  const manifest = world(); manifest.accepted[0].slot = 'open-plot'; await writeFile(path.join(root, 'community/world.json'), JSON.stringify(manifest));
  await assert.rejects(validateGiftFile(path.join(root, 'community/gifts/welcome-planter.json'), root), /empty trusted preview/);
});
test('CLI returns concise successful validation and nonzero failure without executing inputs', async () => {
  const cli = new URL('../tools/validate-gifts.mjs', import.meta.url);
  const configured = await validateRepository();
  const result = await run(process.execPath, [cli.pathname]);
  assert.equal(result.stdout.trim(), `Valid community: ${configured.checkedFiles} JSON gift(s), ${configured.world.placements.length} accepted placement(s), ${configured.world.totalBlocks} visible box(es), ${configured.world.emptySlots.length} empty slot(s).`);
  const proposed = [cli.pathname, '--gift', new URL('../community/gifts/welcome-planter.json', import.meta.url).pathname];
  if (configured.world.emptySlots.some(slot => slot.id === 'open-plot')) {
    const one = await run(process.execPath, proposed); assert.match(one.stdout, /no contributor code/);
  } else {
    await assert.rejects(run(process.execPath, proposed), error => error.code === 1 && /No empty trusted preview slot/.test(error.stderr));
  }
  await assert.rejects(run(process.execPath, [cli.pathname, '--gift', '../escape.json']), error => error.code === 1 && /Path traversal/.test(error.stderr));
  await assert.rejects(run(process.execPath, [cli.pathname, '--unknown']), error => error.code === 1 && /Usage:/.test(error.stderr));
});
