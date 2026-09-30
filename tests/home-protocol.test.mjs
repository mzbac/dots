import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, symlink, rm, readdir, cp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  HOME_PROTOCOL_LIMITS, HomeProtocolError, parseHomeProtocolJson, homeProtocolFingerprint,
  createHomeDescriptor, validateHomeDescriptor, deriveHomeRoutes, homeReference,
  createHomeEnvelope, validateHomeEnvelope, validateHomeExchange, createHomeReviewLedger,
  validateHomeReviewLedger, reviewHomeExchange, recordHomeOwnerDecision,
} from '../src/home-protocol.js';
import { reviewHomeEnvelopeFiles } from '../tools/review-home-envelope.mjs';
import { createGroupProject, applyContribution } from '../src/group-project-engine.js';
import { createGroupGift, createGroupGiftProvenance } from '../src/group-gift.js';

const FIXTURES = path.resolve('tests/fixtures/home-protocol');
const read = async name => JSON.parse(await readFile(path.join(FIXTURES, name), 'utf8'));
const owner = await read('owner/descriptor.json'), peer = await read('inbound/peer.json');
const messages = await read('inbound/exchange.json'), world = await read('owner/community/world.json');
const stem = await read('owner/community/gifts/fictional-stem.json');
const ownerConfig = await read('owner/home.json'), ledger = await read('empty-ledger.json');
const now = Date.parse('2026-09-30T12:00:00Z');
const clone = value => structuredClone(value);
const options = extra => ({ ownerDescriptor: owner, peerDescriptor: peer, now, ...extra });
const reviewInput = extra => ({ ...options(), messages, world, giftsByPath: { 'community/gifts/fictional-stem.json': stem }, ledger, ...extra });
const review = extra => reviewHomeExchange(reviewInput(extra));
const run = promisify(execFile);
async function rewrite(message, change) {
  const { fingerprint, payloadFingerprint, ...input } = clone(message);
  change(input); return createHomeEnvelope(input);
}
async function revision(previous, giftChange = gift => { gift.blocks[0][6] = gift.blocks[0][6] === 'sage' ? 'clay' : 'sage'; }) {
  return rewrite(previous, draft => {
    draft.revision++; draft.parentFingerprint = previous.fingerprint; draft.payload.supersedes = previous.fingerprint;
    giftChange(draft.payload.gift);
  });
}
async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dot-home-protocol-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(FIXTURES, 'owner'), path.join(root, 'owner'), { recursive: true });
  await cp(path.join(FIXTURES, 'inbound'), path.join(root, 'inbound'), { recursive: true });
  return { root, inputDirectory: path.join(root, 'inbound'), trustedRoot: path.join(root, 'owner'), repository: owner.repository, revision: owner.revision, now };
}

test('explicitly fictional two-home offline roundtrip records review, local decision and acknowledgement', async () => {
  assert.match(owner.name, /^Fictional /u); assert.match(peer.name, /^Fictional /u);
  const exchange = await validateHomeExchange(messages, options());
  assert.equal(exchange.invitation.payload.role, 'petal-maker');
  assert.equal(exchange.intent.payload.role, 'petal-maker');
  assert.equal(exchange.contribution.payload.gift.id, 'fictional-bloom');
  const before = clone({ messages, world, stem, ledger });
  const result = await review();
  assert.deepEqual(result.review, await read('expected-review.json'));
  assert.equal(result.review.preview.gift.blocks.length, 5);
  assert.equal(result.review.diff.beforeAccepted.length, 1);
  assert.equal(result.review.diff.afterAccepted.length, 2);
  assert.equal(result.review.identityAuthenticated, false);
  assert.equal(result.review.publicationAuthorized, false);
  assert.equal(result.review.installed, false);
  const acceptance = await recordHomeOwnerDecision(result.review, { decision: 'accept', expectedReviewFingerprint: result.review.reviewFingerprint, now });
  assert.deepEqual(acceptance.decision, await read('expected-local-decision.json'));
  assert.deepEqual(acceptance.acknowledgement, await read('expected-acknowledgement.json'));
  assert.deepEqual(acceptance.nextLedger, await read('expected-final-ledger.json'));
  assert.equal(acceptance.decision.outcome, 'accepted-locally');
  assert.equal(acceptance.decision.publicationAuthorized, false);
  const complete = await validateHomeExchange([...messages, acceptance.acknowledgement], options({ decision: acceptance.decision }));
  assert.equal(complete.messages.length, 4);
  assert.deepEqual({ messages, world, stem, ledger }, before);
  assert.ok(Object.isFrozen(result.review.preview.gift.blocks[0]));
});

test('descriptor derives exact routes and never advertises copied upstream config on a fork', () => {
  assert.deepEqual(createHomeDescriptor(ownerConfig, { repository: owner.repository, revision: owner.revision }), owner);
  assert.equal(createHomeDescriptor(ownerConfig, { repository: peer.repository, revision: peer.revision }), null);
  assert.equal(createHomeDescriptor(ownerConfig), null);
  assert.throws(() => createHomeDescriptor(ownerConfig, { repository: owner.repository, revision: 'main' }), /full build commit/u);
  assert.equal(deriveHomeRoutes('Example/Example.github.io').pages, 'https://example.github.io/');
  assert.equal(deriveHomeRoutes('Example/Some-Home').pages, 'https://example.github.io/Some-Home/');
  assert.equal(owner.routes.invitation, 'https://github.com/fictional-amber-home/workshop/issues/new?template=invitation.yml');
  assert.deepEqual(owner.capabilities, ['gift-v1-static', 'local-review-v1']);
});
for (const bad of ['https://github.com/a/b', 'a/b/c', '../x', 'a/..', 'a/x?token=secret', 'a/b#url', 'a/b%2Fc']) {
  test(`reject malformed repository ${bad}`, () => assert.throws(() => deriveHomeRoutes(bad), HomeProtocolError));
}
test('descriptor cannot override routes, identity, capabilities or protocol version', () => {
  for (const mutate of [v => { v.routes.pages = 'https://arbitrary.invalid/'; }, v => { v.routes.callback = 'https://arbitrary.invalid'; }, v => { v.capabilities.push('run-code'); }, v => { v.schemaVersion = 2; }, v => { v.authorized = true; }, v => { v.revision = 'b'.repeat(39); }]) {
    const candidate = clone(owner); mutate(candidate); assert.throws(() => validateHomeDescriptor(candidate));
  }
});
test('canonical fingerprints are key-order independent but payload sensitive', async () => {
  assert.equal(await homeProtocolFingerprint({ a: 1, b: [2, 3] }), await homeProtocolFingerprint({ b: [2, 3], a: 1 }));
  assert.notEqual(await homeProtocolFingerprint({ a: 1 }), await homeProtocolFingerprint({ a: 2 }));
  assert.deepEqual(await homeReference(owner), messages[0].from);
});
test('bounded parser rejects duplicate and prototype keys, markup-looking strings remain inert until schema rejection', () => {
  for (const source of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"constructor":1}', '{"x":{"__proto__":1}}', '[1,]', '{"x":1,}', '01', 'null true', '1e999', '{', '\ufeff{}']) assert.throws(() => parseHomeProtocolJson(source), HomeProtocolError);
  assert.deepEqual(parseHomeProtocolJson('{"x":[true,false,null,-1.5e2,"hello"]}'), { x: [true, false, null, -150, 'hello'] });
});
test('parsing enforces bytes, UTF-8 byte count, depth and node budgets before schema work', () => {
  assert.throws(() => parseHomeProtocolJson(' '.repeat(HOME_PROTOCOL_LIMITS.bytes + 1)), /byte limit/u);
  assert.throws(() => parseHomeProtocolJson(`"${'é'.repeat(HOME_PROTOCOL_LIMITS.bytes / 2)}"`), /byte limit/u);
  assert.throws(() => parseHomeProtocolJson('['.repeat(20) + '0' + ']'.repeat(20)), /resource limit/u);
  assert.throws(() => parseHomeProtocolJson(JSON.stringify(Array(12001).fill(0))), /resource limit/u);
  assert.throws(() => parseHomeProtocolJson('{}', Infinity), /JSON byte limit/u);
});
test('object APIs never invoke getters, toJSON, symbols or inherited executable data', async () => {
  let ran = false;
  const getter = clone(messages[2]); Object.defineProperty(getter, 'payload', { enumerable: true, get() { ran = true; return {}; } });
  await assert.rejects(validateHomeEnvelope(getter, { now }), /data property/u); assert.equal(ran, false);
  const array = clone(messages); Object.defineProperty(array, '0', { enumerable: true, get() { ran = true; return messages[0]; } });
  await assert.rejects(validateHomeExchange(array, options()), /array data/u); assert.equal(ran, false);
  for (const value of [Object.create(messages[2]), { toJSON() { ran = true; } }, { [Symbol('x')]: 1 }, new Date(), NaN]) await assert.rejects(homeProtocolFingerprint(value));
  assert.equal(ran, false);
});
test('expires exactly at boundary, rejects future and invalid calendar times', async () => {
  await assert.rejects(validateHomeEnvelope(messages[0], { now: Date.parse(messages[0].expiresAt) }), /expired/u);
  await assert.rejects(validateHomeEnvelope(messages[2], { now: Date.parse('2026-09-30T11:01:59Z') }), /future/u);
  await assert.rejects(rewrite(messages[0], v => { v.createdAt = '2026-02-30T11:00:00Z'; }), /creation time/u);
  await assert.rejects(rewrite(messages[0], v => { v.expiresAt = '2026-10-08T11:00:00Z'; }), /lifetime/u);
});
test('tampering with payload, fingerprint or metadata fails even when JSON is well formed', async () => {
  for (const mutate of [v => { v.payload.gift.title = 'Changed'; }, v => { v.payloadFingerprint = `sha256:${'c'.repeat(64)}`; }, v => { v.exchangeId = 'changed'; }, v => { v.fingerprint = `sha256:${'c'.repeat(64)}`; }]) {
    const candidate = clone(messages[2]); mutate(candidate); await assert.rejects(validateHomeEnvelope(candidate, { now }), /Tampered/u);
  }
});
test('recipient, sender and descriptor-revision mismatches fail despite correctly recomputed hashes', async () => {
  for (const mutate of [v => { v.to.repository = 'fictional-other/home'; }, v => { v.from.repository = 'fictional-other/home'; }, v => { v.to.descriptorFingerprint = `sha256:${'c'.repeat(64)}`; }]) {
    const candidate = await rewrite(messages[2], mutate); await assert.rejects(validateHomeExchange([...messages.slice(0, 2), candidate], options()), /Mismatched sender or recipient/u);
  }
  const changed = clone(owner); changed.revision = 'c'.repeat(40);
  await assert.rejects(validateHomeExchange(messages, options({ ownerDescriptor: changed })), /Mismatched/u);
});
test('unknown version, extra authority/script/URL fields and malformed gift data are rejected', async () => {
  for (const key of ['accepted', 'authorized', 'script', 'url', 'callback', 'permissions']) {
    const candidate = clone(messages[2]); candidate.payload[key] = true; await assert.rejects(validateHomeEnvelope(candidate, { now }), /fields/u);
  }
  await assert.rejects(rewrite(messages[2], v => { v.schemaVersion = 2; }), /version/u);
  await assert.rejects(rewrite(messages[2], v => { v.kind = 'execute'; }), /kind/u);
  await assert.rejects(rewrite(messages[2], v => { v.payload.gift.script = 'run'; }), /unexpected key/u);
  await assert.rejects(rewrite(messages[0], v => { v.payload.request = 'javascript:alert(1)'; }), /plain text/u);
  await assert.rejects(rewrite(messages[2], v => { v.payload.gift.blocks = Array(513).fill([0, 0, 0, 1, 1, 1, 'sage']); }), /array length/u);
});
test('lineage cannot change invitation, intent, source id, role, slot or ancestor', async () => {
  for (const mutate of [v => { v.payload.invitationFingerprint = `sha256:${'c'.repeat(64)}`; }, v => { v.payload.intentFingerprint = `sha256:${'c'.repeat(64)}`; }, v => { v.parentFingerprint = `sha256:${'c'.repeat(64)}`; }, v => { v.payload.slot = 'stem-plot'; }, v => { v.payload.role = 'owner'; }, v => { v.exchangeId = 'other-exchange'; }]) {
    const candidate = await rewrite(messages[2], mutate); await assert.rejects(validateHomeExchange([...messages.slice(0, 2), candidate], options()));
  }
  const changedId = await revision(messages[2], gift => { gift.id = 'other-gift'; });
  await assert.rejects(validateHomeExchange([...messages, changedId], options()), /source gift id/u);
});
test('replay detection catches same envelope and same gift rewrapped as a revision', async () => {
  await assert.rejects(validateHomeExchange([...messages, messages[2]], options()), /Replayed envelope/u);
  const duplicate = await revision(messages[2], () => {});
  await assert.rejects(validateHomeExchange([...messages, duplicate], options()), /semantic gift/u);
});
test('local ledger permits an explicit descendant revision but rejects replay and competing branches', async () => {
  const first = await review();
  await assert.rejects(review({ ledger: first.nextLedger }), /already reviewed/u);
  const updated = await revision(messages[2]);
  const second = await review({ messages: [...messages, updated], ledger: first.nextLedger });
  assert.equal(second.review.contributionFingerprint, updated.fingerprint);
  assert.equal(second.nextLedger.records.length, 2);
  assert.deepEqual(second.nextLedger.records[0], first.nextLedger.records[0]);
  const competitor = await revision(messages[2], gift => { gift.blocks[0][6] = 'fern'; });
  await assert.rejects(review({ messages: [...messages, competitor], ledger: second.nextLedger }), /Conflicting update/u);
});
test('semantic replay across different exchange IDs is rejected by the local ledger', async () => {
  const first = await review(); const alternative = [];
  for (const original of messages) alternative.push(await rewrite(original, v => {
    v.exchangeId = 'another-fictional-exchange'; v.parentFingerprint = alternative.at(-1)?.fingerprint ?? null;
    if (v.kind !== 'invitation') v.payload.invitationFingerprint = alternative[0].fingerprint;
    if (v.kind === 'contribution') v.payload.intentFingerprint = alternative[1].fingerprint;
  }));
  await assert.rejects(review({ messages: alternative, ledger: first.nextLedger }), /semantic gift already reviewed/u);
  const updated = await revision(messages[2]);
  const second = await review({ messages: [...messages, updated], ledger: first.nextLedger });
  await assert.rejects(review({ messages: alternative, ledger: second.nextLedger }), /semantic gift already reviewed/u);
});
test('local decision requires fresh branded review, matching fingerprint and an explicit choice', async () => {
  const result = await review();
  await assert.rejects(recordHomeOwnerDecision(clone(result.review), { decision: 'accept', expectedReviewFingerprint: result.review.reviewFingerprint, now }), /imported artifacts/u);
  await assert.rejects(recordHomeOwnerDecision(result.review, { decision: 'accept', expectedReviewFingerprint: 'old', now }), /Review changed/u);
  await assert.rejects(recordHomeOwnerDecision(result.review, { expectedReviewFingerprint: result.review.reviewFingerprint, now }), /explicit local/u);
  await assert.rejects(recordHomeOwnerDecision(result.review, { decision: 'accept', expectedReviewFingerprint: result.review.reviewFingerprint, now: Date.parse(messages[0].expiresAt) }), /lifetime/u);
  const resultDecision = await recordHomeOwnerDecision(result.review, { decision: 'decline', expectedReviewFingerprint: result.review.reviewFingerprint, now });
  assert.equal(resultDecision.decision.outcome, 'declined-locally');
  await assert.rejects(recordHomeOwnerDecision(result.review, { decision: 'accept', expectedReviewFingerprint: result.review.reviewFingerprint, now }), /fresh trusted/u);
});
test('imported acknowledgement/decision claims never authorize local acceptance', async () => {
  const result = await review();
  const accepted = await recordHomeOwnerDecision(result.review, { decision: 'accept', expectedReviewFingerprint: result.review.reviewFingerprint, now });
  await assert.rejects(validateHomeExchange([...messages, accepted.acknowledgement], options()), /Imported acknowledgement/u);
  await assert.rejects(validateHomeExchange([...messages, accepted.acknowledgement], options({ decision: clone(accepted.decision) })), /Imported acknowledgement/u);
  await assert.rejects(review({ messages: [...messages, accepted.acknowledgement] }), /Imported acknowledgement/u);
  const updated = await revision(messages[2]);
  await assert.rejects(review({ messages: [...messages, updated], ledger: accepted.nextLedger }), /already has a local decision/u);
});
test('base world fingerprint binds accepted geometry as well as the world registry', async () => {
  const first = await review(); const changed = clone(stem); changed.blocks[0][6] = 'sage';
  const second = await review({ giftsByPath: { 'community/gifts/fictional-stem.json': changed } });
  assert.notEqual(first.review.baseWorldFingerprint, second.review.baseWorldFingerprint);
  assert.notEqual(first.review.reviewFingerprint, second.review.reviewFingerprint);
});
test('review rejects occupied slots, oversized geometry and accepted gift ID conflicts', async () => {
  const occupied = clone(world); occupied.accepted.push({ id: messages[2].payload.gift.id, path: `community/gifts/${messages[2].payload.gift.id}.json`, slot: 'bloom-plot' });
  await assert.rejects(review({ world: occupied, giftsByPath: { 'community/gifts/fictional-stem.json': stem, 'community/gifts/fictional-bloom.json': messages[2].payload.gift } }), /occupied/u);
  const oversize = await rewrite(messages[2], v => { v.payload.gift.size[0] = 17; });
  await assert.rejects(review({ messages: [...messages.slice(0, 2), oversize] }), /does not fit/u);
  const sameId = await rewrite(messages[2], v => { v.payload.gift.id = stem.id; });
  await assert.rejects(review({ messages: [...messages.slice(0, 2), sameId] }), /accepted gift id/u);
});
test('maximum contribution revision preserves room for local decision plus final acknowledgement', async () => {
  const chain = clone(messages);
  while (chain.at(-1).revision < HOME_PROTOCOL_LIMITS.revisions - 1) chain.push(await revision(chain.at(-1), gift => { gift.description = `Fictional revision ${chain.length}.`; }));
  const result = await review({ messages: chain });
  const accepted = await recordHomeOwnerDecision(result.review, { decision: 'accept', expectedReviewFingerprint: result.review.reviewFingerprint, now });
  assert.equal(accepted.acknowledgement.revision, HOME_PROTOCOL_LIMITS.revisions);
  assert.equal((await validateHomeExchange([...chain, accepted.acknowledgement], options({ decision: accepted.decision }))).messages.length, HOME_PROTOCOL_LIMITS.messages);
  const overflow = await revision(chain.at(-1), gift => { gift.description = 'One revision too far'; });
  await assert.rejects(validateHomeExchange([...chain, overflow], options()), /Reserve the final revision/u);
  await assert.rejects(validateHomeExchange(Array(11).fill(messages[0]), options()), /message count/u);
});
test('full ledger fails closed without dropping replay history; wrong owner/duplicate records fail', async () => {
  const first = await review(); const full = clone(first.nextLedger);
  full.records = Array.from({ length: HOME_PROTOCOL_LIMITS.ledgerRecords }, (_, n) => ({ ...full.records[0], exchangeId: `old-exchange-${n}`, headFingerprint: `sha256:${n.toString(16).padStart(64, '0')}`, giftFingerprint: `sha256:${n.toString(16).padStart(64, '0')}` }));
  await assert.rejects(review({ ledger: full }), /ledger is full/u);
  full.records.push(clone(full.records[0])); assert.throws(() => validateHomeReviewLedger(full, owner.repository), /resource limit/u);
  const wrong = clone(ledger); wrong.ownerRepository = peer.repository; assert.throws(() => validateHomeReviewLedger(wrong, owner.repository), /owner mismatch/u);
  const duplicate = clone(first.nextLedger); duplicate.records.push(clone(duplicate.records[0])); assert.throws(() => validateHomeReviewLedger(duplicate, owner.repository), /Duplicate/u);
});
test('trusted CLI returns inert SVG/diff and explicit local decision without modifying inputs or using network', async t => {
  const paths = await temporary(t);
  const originalFetch = globalThis.fetch; globalThis.fetch = () => { throw new Error('Network is forbidden in local reviewer'); }; t.after(() => { globalThis.fetch = originalFetch; });
  const before = await readFile(path.join(paths.inputDirectory, 'exchange.json'), 'utf8');
  const beforeWorld = await readFile(path.join(paths.trustedRoot, 'community/world.json'), 'utf8');
  const beforeStem = await readFile(path.join(paths.trustedRoot, 'community/gifts/fictional-stem.json'), 'utf8');
  const result = await reviewHomeEnvelopeFiles(paths);
  assert.match(result.previewSvg, /^<svg/u); assert.doesNotMatch(result.previewSvg, /<script|href=|<image/u);
  assert.equal(result.decision, undefined); assert.equal(result.nextLedger.records[0].outcome, 'reviewed');
  const accepted = await reviewHomeEnvelopeFiles({ ...paths, decision: 'accept', expectedReviewFingerprint: result.review.reviewFingerprint });
  assert.equal(accepted.decision.outcome, 'accepted-locally'); assert.equal(accepted.acknowledgement.kind, 'acknowledgement');
  assert.equal(await readFile(path.join(paths.inputDirectory, 'exchange.json'), 'utf8'), before);
  assert.deepEqual((await readdir(paths.root)).sort(), ['inbound', 'owner']);
  assert.equal(await readFile(path.join(paths.trustedRoot, 'community/world.json'), 'utf8'), beforeWorld);
  assert.equal(await readFile(path.join(paths.trustedRoot, 'community/gifts/fictional-stem.json'), 'utf8'), beforeStem);
});
test('CLI subprocess supports review then fingerprint-bound decision; invalid flags or expired data fail', async t => {
  const paths = await temporary(t);
  const args = ['tools/review-home-envelope.mjs', '--input', paths.inputDirectory, '--home-root', paths.trustedRoot, '--repository', owner.repository, '--revision', owner.revision, '--now', '2026-09-30T12:00:00Z'];
  const first = JSON.parse((await run(process.execPath, args)).stdout);
  const second = JSON.parse((await run(process.execPath, [...args, '--decision', 'accept', '--expect', first.review.reviewFingerprint])).stdout);
  assert.equal(second.decision.outcome, 'accepted-locally');
  for (const extra of [['--decision', 'accept'], ['--decision', 'accept', '--expect', 'stale'], ['--script', 'bad'], ['--repository', peer.repository]]) await assert.rejects(run(process.execPath, [...args, ...extra]));
  await assert.rejects(run(process.execPath, args.map(v => v === '2026-09-30T12:00:00Z' ? '2026-10-08T12:00:00Z' : v)), /expired/u);
});
test('CLI rejects fork mismatch, nested imports, URL paths, imported ledgers and symlink files/directories', async t => {
  const paths = await temporary(t);
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, repository: peer.repository }), /copied fork/u);
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, inputDirectory: path.join(paths.trustedRoot, 'community') }), /separate directory/u);
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, inputDirectory: 'https://arbitrary.invalid/data' }), /local directory/u);
  await writeFile(path.join(paths.inputDirectory, 'ledger.json'), JSON.stringify(ledger));
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, ledgerPath: path.join(paths.inputDirectory, 'ledger.json') }), /cannot come from/u);
  await symlink(paths.inputDirectory, path.join(paths.root, 'linked'));
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, inputDirectory: path.join(paths.root, 'linked') }), /symlinks/u);
  await rm(path.join(paths.inputDirectory, 'exchange.json'));
  await symlink(path.join(FIXTURES, 'inbound/exchange.json'), path.join(paths.inputDirectory, 'exchange.json'));
  await assert.rejects(reviewHomeEnvelopeFiles(paths), /Symlinks/u);
});
test('CLI rejects oversized, invalid UTF-8, nonregular and resource-heavy JSON inputs', async t => {
  const paths = await temporary(t), file = path.join(paths.inputDirectory, 'exchange.json');
  await writeFile(file, ' '.repeat(HOME_PROTOCOL_LIMITS.bytes + 1)); await assert.rejects(reviewHomeEnvelopeFiles(paths), /byte limit/u);
  await writeFile(file, Buffer.from([0xff, 0xfe])); await assert.rejects(reviewHomeEnvelopeFiles(paths), /UTF-8/u);
  await writeFile(file, '['.repeat(30) + '0' + ']'.repeat(30)); await assert.rejects(reviewHomeEnvelopeFiles(paths), /resource limit/u);
  await rm(file); await mkdir(file); await assert.rejects(reviewHomeEnvelopeFiles(paths), /regular file/u);
});


test('optional trusted review context is hash-bound without changing legacy fixed-file output', async () => {
  const plain = await review();
  assert.equal(Object.hasOwn(plain.review, 'reviewContextFingerprint'), false);
  const a = await review({ reviewContextFingerprint: `sha256:${'a'.repeat(64)}` });
  const b = await review({ reviewContextFingerprint: `sha256:${'b'.repeat(64)}` });
  assert.equal(a.review.giftFingerprint, b.review.giftFingerprint);
  assert.notEqual(a.review.reviewFingerprint, b.review.reviewFingerprint);
  await assert.rejects(recordHomeOwnerDecision(b.review, { decision: 'accept', expectedReviewFingerprint: a.review.reviewFingerprint, now }), /Review changed/u);
  await assert.rejects(review({ reviewContextFingerprint: 'accepted' }), /review context fingerprint/u);
});


async function packetFiles(t, packet = { schemaVersion: 1, peer, envelopes: messages }) {
  const paths = await temporary(t);
  const packetPath = path.join(paths.inputDirectory, 'home-packet.json');
  await writeFile(packetPath, JSON.stringify(packet));
  return { ...paths, inputDirectory: null, packetPath };
}
async function receiptFor(packet) {
  return { schemaVersion: 1, kind: 'github-home-packet-read', repository: owner.repository, itemType: 'issue', itemNumber: 1,
    item: { id: 1, nodeId: 'FICTIONAL_FIXTURE', updatedAt: '2026-09-30T11:30:00Z', bodyFingerprint: `sha256:${'d'.repeat(64)}` },
    source: 'body', comment: null, headSha: null, file: null, packetFingerprint: await homeProtocolFingerprint(packet),
    observedAt: '2026-09-30T11:45:00Z', identityAuthenticated: false, reviewScope: 'selected-packet-only' };
}
test('packet-mode review binds its full validated packet while preserving static gift review', async t => {
  const paths = await packetFiles(t), result = await reviewHomeEnvelopeFiles(paths);
  const plain = await review();
  assert.equal(result.review.giftFingerprint, plain.review.giftFingerprint);
  assert.notEqual(result.review.reviewFingerprint, plain.review.reviewFingerprint);
  assert.equal(result.packetReview.identityAuthenticated, false);
  assert.equal(result.packetReview.publicationAuthorized, false);
  assert.equal(result.packetReview.sourceEvidence, null);
  assert.equal(result.packetReview.attribution[0].status, 'no-group-provenance');
  assert.equal(result.review.reviewContextFingerprint, result.packetReview.reviewContextFingerprint);
  const accepted = await reviewHomeEnvelopeFiles({ ...paths, decision: 'accept', expectedReviewFingerprint: result.review.reviewFingerprint });
  assert.equal(accepted.decision.outcome, 'accepted-locally');
});
test('source receipt substitution with unchanged gift invalidates prior inspection fingerprint', async t => {
  const packet = { schemaVersion: 1, peer, envelopes: messages }, paths = await packetFiles(t, packet);
  const sourceEvidencePath = path.join(path.dirname(paths.packetPath), 'source-evidence.json');
  const evidence = await receiptFor(packet); await writeFile(sourceEvidencePath, JSON.stringify(evidence));
  const initial = await reviewHomeEnvelopeFiles({ ...paths, sourceEvidencePath });
  assert.equal(initial.packetReview.sourceEvidence.itemNumber, 1);
  evidence.itemNumber = 2; await writeFile(sourceEvidencePath, JSON.stringify(evidence));
  const changed = await reviewHomeEnvelopeFiles({ ...paths, sourceEvidencePath });
  assert.equal(initial.review.giftFingerprint, changed.review.giftFingerprint);
  assert.notEqual(initial.review.reviewFingerprint, changed.review.reviewFingerprint);
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, sourceEvidencePath, decision: 'accept', expectedReviewFingerprint: initial.review.reviewFingerprint }), /Review changed/u);
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, decision: 'accept', expectedReviewFingerprint: initial.review.reviewFingerprint }), /Review changed/u);
});
test('removing exact group attribution with identical contribution and geometry invalidates inspection', async t => {
  let project = createGroupProject({ seed: 'fictional-packet-review', title: 'Fictional group flower' });
  project = applyContribution(project, project.participants[0].id, { type: 'movement', gait: 'glide' });
  project = applyContribution(project, project.participants[1].id, { type: 'rhythm', rhythm: [1, 0, 1, 0, 1, 0, 0, 0] });
  project = applyContribution(project, project.participants[2].id, { type: 'harmony', harmony: 'sunrise', timbre: 'bell' });
  const contribution = await rewrite(messages[2], draft => { draft.payload.gift = createGroupGift(project); });
  const packet = { schemaVersion: 1, peer, envelopes: [...messages.slice(0, 2), contribution],
    provenance: [{ contributionFingerprint: contribution.fingerprint, group: createGroupGiftProvenance(project) }] };
  const paths = await packetFiles(t, packet), initial = await reviewHomeEnvelopeFiles(paths);
  assert.equal(initial.packetReview.attribution[0].status, 'exact-group-reproduction');
  assert.equal(initial.packetReview.provenance[0].group.contributors.length, 3);
  assert.equal(initial.packetReview.attribution[0].identityAuthenticated, false);
  const tampered = clone(packet); tampered.provenance[0].group.contributors[0].name = 'Changed attribution';
  await writeFile(paths.packetPath, JSON.stringify(tampered));
  await assert.rejects(reviewHomeEnvelopeFiles(paths), /attribution or lineage/u);
  delete packet.provenance; await writeFile(paths.packetPath, JSON.stringify(packet));
  const changed = await reviewHomeEnvelopeFiles(paths);
  assert.equal(initial.review.giftFingerprint, changed.review.giftFingerprint);
  assert.equal(initial.review.contributionFingerprint, changed.review.contributionFingerprint);
  assert.notEqual(initial.review.reviewFingerprint, changed.review.reviewFingerprint);
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, decision: 'accept', expectedReviewFingerprint: initial.review.reviewFingerprint }), /Review changed/u);
});
test('packet/receipt paths remain isolated, bounded, regular and explicitly selected', async t => {
  const paths = await packetFiles(t);
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, inputDirectory: path.dirname(paths.packetPath) }), /exactly one/u);
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, packetPath: path.join(paths.trustedRoot, 'home.json') }), /separate directory/u);
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, sourceEvidencePath: path.join(paths.trustedRoot, 'home.json') }), /escapes/u);
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, packetPath: 'https://arbitrary.invalid/packet.json' }), /local directory/u);
  const evidencePath = path.join(path.dirname(paths.packetPath), 'source-evidence.json');
  await writeFile(evidencePath, ' '.repeat(8193));
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, sourceEvidencePath: evidencePath }), /byte limit/u);
  const packet = { schemaVersion: 1, peer, envelopes: messages }, evidence = await receiptFor(packet);
  evidence.identityAuthenticated = true; await writeFile(evidencePath, JSON.stringify(evidence));
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, sourceEvidencePath: evidencePath }), /source evidence/u);
  evidence.identityAuthenticated = false; evidence.packetFingerprint = `sha256:${'f'.repeat(64)}`;
  await writeFile(evidencePath, JSON.stringify(evidence));
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, sourceEvidencePath: evidencePath }), /packet fingerprint mismatch/u);
  await rm(evidencePath); await symlink(path.join(FIXTURES, 'empty-ledger.json'), evidencePath);
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, sourceEvidencePath: evidencePath }), /Symlinks/u);
  await writeFile(paths.packetPath, ' '.repeat(48 * 1024 + 1)); await assert.rejects(reviewHomeEnvelopeFiles(paths), /byte limit/u);
});
test('packet CLI supports real argument parsing and refuses ambiguous input modes', async t => {
  const paths = await packetFiles(t);
  const args = ['tools/review-home-envelope.mjs', '--packet', paths.packetPath, '--home-root', paths.trustedRoot,
    '--repository', owner.repository, '--revision', owner.revision, '--now', '2026-09-30T12:00:00Z'];
  const first = JSON.parse((await run(process.execPath, args)).stdout);
  assert.equal(first.packetReview.attribution[0].status, 'no-group-provenance');
  const second = JSON.parse((await run(process.execPath, [...args, '--decision', 'accept', '--expect', first.review.reviewFingerprint])).stdout);
  assert.equal(second.decision.publicationAuthorized, false);
  await assert.rejects(run(process.execPath, [...args, '--input', path.dirname(paths.packetPath)]));
  await assert.rejects(reviewHomeEnvelopeFiles({ ...paths, packetPath: null, inputDirectory: path.dirname(paths.packetPath), sourceEvidencePath: paths.packetPath }), /requires packet mode/u);
});
