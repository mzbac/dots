/**
 * Dot home protocol v1: inert public declarations, never authority or transport.
 * Fingerprints detect byte-independent data changes; they DO NOT authenticate
 * a home, person, permission, signature, acceptance, merge, or deployment.
 * No network, filesystem, executable content, or publication APIs belong here.
 */
import { validateHomeConfig } from './home.js';
import { validateGift, validateWorld } from './gifts.js';

export const HOME_PROTOCOL_LIMITS = Object.freeze({
  bytes: 64 * 1024, descriptorBytes: 8 * 1024, depth: 16, nodes: 12000,
  messages: 10, revisions: 9, ledgerRecords: 32, lifetimeMs: 7 * 24 * 60 * 60 * 1000,
});
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const HASH = /^sha256:[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const UNSAFE_TEXT = /[<>\p{Cc}\p{Cf}\p{Cs}]/u;
const LINK = /(?:\b(?:https?|ftp|file|data|javascript|vbscript|blob|mailto|tel|sms|wss?)\s*:|\b[a-z][a-z0-9+.-]*\s*:\s*\/\s*\/|\/\/|www\s*\.|\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}\b)/iu;
const MESSAGE_KEYS = ['schemaVersion', 'kind', 'exchangeId', 'revision', 'parentFingerprint', 'from', 'to', 'createdAt', 'expiresAt', 'payload', 'payloadFingerprint', 'fingerprint'];
const DESCRIPTOR_KEYS = ['schemaVersion', 'kind', 'repository', 'revision', 'name', 'description', 'giftSchemaVersion', 'capabilities', 'routes'];
const REVIEW_CONTEXT = new WeakMap();
const DECISION_CONTEXT = new WeakMap();

export class HomeProtocolError extends Error {
  constructor(message) { super(message); this.name = 'HomeProtocolError'; }
}
function fail(message) { throw new HomeProtocolError(message); }
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${label}`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(k => typeof k !== 'string' || !keys.includes(k))) fail(`Invalid ${label} fields`);
  for (const key of keys) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property || !('value' in property) || !property.enumerable) fail(`Invalid ${label} data property`);
  }
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max || UNSAFE_TEXT.test(value) || LINK.test(value)) fail(`Invalid ${label}: use bounded plain text without links`);
  return value;
}
function slug(value, label) {
  if (typeof value !== 'string' || !SLUG.test(value) || value.length > 48 || FORBIDDEN.has(value)) fail(`Invalid ${label}`);
  return value;
}
function hash(value, label) { if (typeof value !== 'string' || !HASH.test(value)) fail(`Invalid ${label}`); return value; }
function integer(value, min, max, label) { if (!Number.isSafeInteger(value) || value < min || value > max) fail(`Invalid ${label}`); return value; }
function timestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)) fail(`Invalid ${label}`);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().replace('.000Z', 'Z') !== value) fail(`Invalid ${label}`);
  return ms;
}
function nowMs(value) { if (!Number.isSafeInteger(value) || value < 0) fail('Invalid review time'); return value; }
function iso(ms) { return new Date(nowMs(ms)).toISOString().replace(/\.\d{3}Z$/u, 'Z'); }
function repository(value) {
  if (typeof value !== 'string') fail('Invalid home repository');
  const match = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9_.-]{1,100})$/u.exec(value);
  if (!match || ['.', '..'].includes(match[2])) fail('Invalid home repository');
  return { owner: match[1], name: match[2], full: value };
}
function sameRepository(a, b) { return a.toLowerCase() === b.toLowerCase(); }

/** Copy JSON data without invoking getters, toJSON, prototypes or callbacks. */
function copyData(value, maxBytes = HOME_PROTOCOL_LIMITS.bytes) {
  let nodes = 0;
  const visit = (item, depth) => {
    if (++nodes > HOME_PROTOCOL_LIMITS.nodes || depth > HOME_PROTOCOL_LIMITS.depth) fail('Protocol resource limit exceeded');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number') { if (!Number.isFinite(item)) fail('Protocol numbers must be finite'); return item; }
    if (typeof item === 'string') { if (item.length > maxBytes) fail('Protocol byte limit exceeded'); return item; }
    if (!item || typeof item !== 'object') fail('Protocol accepts JSON data only');
    const own = Reflect.ownKeys(item);
    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype || own.length !== item.length + 1 || item.length > HOME_PROTOCOL_LIMITS.nodes) fail('Invalid protocol array');
      const result = [];
      for (let i = 0; i < item.length; i++) {
        const property = Object.getOwnPropertyDescriptor(item, String(i));
        if (!property || !('value' in property) || !property.enumerable) fail('Invalid protocol array data');
        result.push(visit(property.value, depth + 1));
      }
      return result;
    }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) fail('Protocol objects must be plain JSON');
    const result = {};
    for (const key of own) {
      if (typeof key !== 'string' || FORBIDDEN.has(key)) fail('Forbidden protocol key');
      const property = Object.getOwnPropertyDescriptor(item, key);
      if (!property || !('value' in property) || !property.enumerable) fail('Invalid protocol data property');
      result[key] = visit(property.value, depth + 1);
    }
    return result;
  };
  const result = visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > maxBytes) fail('Protocol byte limit exceeded');
  return result;
}

/** Strict JSON parsing: cap bytes before parsing, reject duplicate/prototype keys
 * and depth before allocating a recursive parsed object. No JSON5 or scripts. */
export function parseHomeProtocolJson(source, maxBytes = HOME_PROTOCOL_LIMITS.bytes) {
  integer(maxBytes, 1, HOME_PROTOCOL_LIMITS.bytes, 'JSON byte limit');
  if (typeof source !== 'string' || source.length > maxBytes || new TextEncoder().encode(source).byteLength > maxBytes) fail('Protocol byte limit exceeded');
  let pos = 0, nodes = 0;
  const whitespace = () => { while (/[\t\n\r ]/u.test(source[pos] ?? '\0')) pos++; };
  const string = () => {
    const start = pos++;
    while (pos < source.length) {
      const c = source[pos++];
      if (c === '\\') { pos++; continue; }
      if (c === '"') { try { return JSON.parse(source.slice(start, pos)); } catch { fail('Invalid protocol JSON string'); } }
    }
    fail('Unterminated protocol JSON string');
  };
  const value = depth => {
    if (++nodes > HOME_PROTOCOL_LIMITS.nodes || depth > HOME_PROTOCOL_LIMITS.depth) fail('Protocol resource limit exceeded');
    whitespace(); const token = source[pos];
    if (token === '"') return string();
    if (token === '[' || token === '{') {
      pos++; whitespace(); const array = token === '[', end = array ? ']' : '}', result = array ? [] : {}, seen = new Set();
      if (source[pos] === end) { pos++; return result; }
      for (;;) {
        whitespace(); let key;
        if (!array) {
          if (source[pos] !== '"') fail('Invalid protocol JSON object');
          key = string();
          if (FORBIDDEN.has(key) || seen.has(key)) fail('Duplicate or forbidden protocol key');
          seen.add(key); whitespace(); if (source[pos++] !== ':') fail('Invalid protocol JSON object');
        }
        const child = value(depth + 1);
        if (array) result.push(child); else result[key] = child;
        whitespace(); const delimiter = source[pos++];
        if (delimiter === end) return result;
        if (delimiter !== ',') fail('Invalid protocol JSON separator');
      }
    }
    const primitive = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(source.slice(pos));
    if (!primitive) fail('Invalid protocol JSON value');
    pos += primitive[0].length; const result = JSON.parse(primitive[0]);
    if (typeof result === 'number' && !Number.isFinite(result)) fail('Protocol numbers must be finite');
    return result;
  };
  const result = value(0); whitespace(); if (pos !== source.length) fail('Trailing protocol JSON content');
  return freeze(result);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
/** SHA-256 of canonical sorted-key JSON, not an identity signature. */
export async function homeProtocolFingerprint(value) {
  const source = canonical(copyData(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return `sha256:${Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')}`;
}

/** Derived addresses only. No remote lookup, custom domains or callbacks. */
export function deriveHomeRoutes(value) {
  const repo = repository(value), root = `https://github.com/${repo.full}`;
  const host = `${repo.owner.toLowerCase()}.github.io`;
  const pages = `https://${host}/${repo.name.toLowerCase() === host ? '' : `${repo.name}/`}`;
  return freeze({ repository: root, pages, descriptor: `${pages}home-descriptor.json`,
    invitation: `${root}/issues/new?template=invitation.yml`, hello: `${root}/issues/new?template=hello.yml`, pullRequests: `${root}/pulls` });
}
/** Only a matching trusted build identity can produce a descriptor. A fork with
 * copied upstream home.json gets null, never an upstream descriptor fallback. */
export function createHomeDescriptor(config, { repository: buildRepository = '', revision = '' } = {}) {
  const safe = copyData(config, HOME_PROTOCOL_LIMITS.descriptorBytes);
  const home = validateHomeConfig(safe);
  if (!buildRepository) return null;
  repository(buildRepository);
  if (!sameRepository(home.ownerRepository, buildRepository)) return null;
  if (!COMMIT.test(revision)) fail('Descriptor requires a full build commit revision');
  return validateHomeDescriptor({ schemaVersion: 1, kind: 'dot-home', repository: buildRepository, revision,
    name: home.name, description: home.description, giftSchemaVersion: 1,
    capabilities: ['gift-v1-static', 'local-review-v1'], routes: deriveHomeRoutes(buildRepository) });
}
export function validateHomeDescriptor(input) {
  const value = copyData(input, HOME_PROTOCOL_LIMITS.descriptorBytes);
  exact(value, DESCRIPTOR_KEYS, 'home descriptor');
  if (value.schemaVersion !== 1 || value.kind !== 'dot-home' || value.giftSchemaVersion !== 1 || !COMMIT.test(value.revision)) fail('Unsupported home descriptor');
  repository(value.repository); text(value.name, 48, 'home name'); text(value.description, 240, 'home description');
  if (canonical(value.capabilities) !== canonical(['gift-v1-static', 'local-review-v1'])) fail('Unsupported home capabilities');
  if (canonical(value.routes) !== canonical(deriveHomeRoutes(value.repository))) fail('Home routes must match its exact repository');
  return freeze(value);
}
export async function homeReference(descriptor) {
  const home = validateHomeDescriptor(descriptor);
  return freeze({ repository: home.repository, descriptorFingerprint: await homeProtocolFingerprint(home) });
}
function reference(value) {
  exact(value, ['repository', 'descriptorFingerprint'], 'home reference'); repository(value.repository); hash(value.descriptorFingerprint, 'descriptor fingerprint');
}
function payload(kind, value) {
  if (kind === 'invitation') {
    exact(value, ['title', 'request', 'slot', 'role', 'giftSchemaVersion'], 'invitation payload');
    text(value.title, 60, 'invitation title'); text(value.request, 240, 'invitation request'); slug(value.slot, 'invitation slot'); slug(value.role, 'complementary role');
    if (value.giftSchemaVersion !== 1) fail('Unsupported requested gift version');
  } else if (kind === 'intent') {
    exact(value, ['invitationFingerprint', 'summary', 'slot', 'role'], 'intent payload');
    hash(value.invitationFingerprint, 'invitation fingerprint'); text(value.summary, 240, 'intent summary'); slug(value.slot, 'intent slot'); slug(value.role, 'intent role');
  } else if (kind === 'contribution') {
    exact(value, ['invitationFingerprint', 'intentFingerprint', 'supersedes', 'slot', 'role', 'gift'], 'contribution payload');
    hash(value.invitationFingerprint, 'invitation fingerprint'); hash(value.intentFingerprint, 'intent fingerprint');
    if (value.supersedes !== null) hash(value.supersedes, 'superseded contribution');
    slug(value.slot, 'contribution slot'); slug(value.role, 'contribution role'); value.gift = validateGift(value.gift);
  } else if (kind === 'acknowledgement') {
    exact(value, ['contributionFingerprint', 'decisionFingerprint', 'outcome'], 'acknowledgement payload');
    hash(value.contributionFingerprint, 'contribution fingerprint'); hash(value.decisionFingerprint, 'decision fingerprint');
    if (!['accepted-locally', 'declined-locally'].includes(value.outcome)) fail('Unsupported acknowledgement outcome');
  } else fail('Unsupported envelope kind');
  return value;
}
function envelopeCore(input) {
  const value = copyData(input);
  exact(value, MESSAGE_KEYS, 'home envelope');
  if (value.schemaVersion !== 1) fail('Unsupported envelope version');
  slug(value.exchangeId, 'exchange id'); integer(value.revision, 0, HOME_PROTOCOL_LIMITS.revisions, 'envelope revision');
  if (value.parentFingerprint !== null) hash(value.parentFingerprint, 'parent fingerprint');
  reference(value.from); reference(value.to);
  if (sameRepository(value.from.repository, value.to.repository)) fail('An exchange requires two different home repositories');
  const created = timestamp(value.createdAt, 'creation time'), expires = timestamp(value.expiresAt, 'expiration time');
  if (expires <= created || expires - created > HOME_PROTOCOL_LIMITS.lifetimeMs) fail('Invalid envelope lifetime');
  value.payload = payload(value.kind, value.payload);
  hash(value.payloadFingerprint, 'payload fingerprint'); hash(value.fingerprint, 'envelope fingerprint');
  return value;
}
/** Build local JSON only. Callers choose whether/where to share, separately. */
export async function createHomeEnvelope(input) {
  const safe = copyData(input);
  exact(safe, MESSAGE_KEYS.filter(k => !['payloadFingerprint', 'fingerprint'].includes(k)), 'envelope draft');
  const placeholder = `sha256:${'0'.repeat(64)}`;
  const value = envelopeCore({ ...safe, payloadFingerprint: placeholder, fingerprint: placeholder });
  value.payloadFingerprint = await homeProtocolFingerprint(value.payload);
  const { fingerprint: ignored, ...core } = value;
  value.fingerprint = await homeProtocolFingerprint(core);
  return freeze(value);
}
export async function validateHomeEnvelope(input, { now = Date.now() } = {}) {
  const value = envelopeCore(input); nowMs(now);
  if (timestamp(value.createdAt, 'creation time') > now) fail('Envelope is from the future');
  if (timestamp(value.expiresAt, 'expiration time') <= now) fail('Envelope has expired');
  if (await homeProtocolFingerprint(value.payload) !== value.payloadFingerprint) fail('Tampered envelope payload');
  const { fingerprint, ...core } = value;
  if (await homeProtocolFingerprint(core) !== fingerprint) fail('Tampered envelope fingerprint');
  return freeze(value);
}
function sameReference(a, b) { return canonical(a) === canonical(b); }

/** Validate a single ordered exchange. A divergent revision is a conflict, not
 * last-write-wins. Acknowledgements must bind a separately supplied local
 * decision, otherwise their imported acceptance claim is rejected. */
export async function validateHomeExchange(input, { ownerDescriptor, peerDescriptor, now = Date.now(), decision = null } = {}) {
  const messages = copyData(input);
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > HOME_PROTOCOL_LIMITS.messages) fail('Invalid exchange message count');
  const owner = await homeReference(ownerDescriptor), peer = await homeReference(peerDescriptor);
  if (sameRepository(owner.repository, peer.repository)) fail('An exchange requires two homes');
  const validated = [], seen = new Set(), giftPrints = new Set(); let invitation, intent, contribution;
  for (const inputMessage of messages) {
    const message = await validateHomeEnvelope(inputMessage, { now });
    if (seen.has(message.fingerprint)) fail('Replayed envelope');
    seen.add(message.fingerprint);
    const previous = validated.at(-1);
    if (message.revision !== validated.length || message.parentFingerprint !== (previous?.fingerprint ?? null)) fail('Conflicting update or broken revision lineage');
    if (previous && (message.exchangeId !== invitation.exchangeId || timestamp(message.createdAt) < timestamp(previous.createdAt) || timestamp(message.expiresAt) > timestamp(invitation.expiresAt))) fail('Exchange identity or time lineage mismatch');
    const inbound = ['intent', 'contribution'].includes(message.kind);
    if (!sameReference(message.from, inbound ? peer : owner) || !sameReference(message.to, inbound ? owner : peer)) fail('Mismatched sender or recipient home');
    if (message.kind === 'invitation') {
      if (validated.length !== 0) fail('Invitation must start the exchange'); invitation = message;
    } else if (message.kind === 'intent') {
      if (validated.length !== 1 || !invitation || message.payload.invitationFingerprint !== invitation.fingerprint) fail('Intent must bind the invitation'); intent = message;
    } else if (message.kind === 'contribution') {
      if (message.revision >= HOME_PROTOCOL_LIMITS.revisions) fail('Reserve the final revision for an acknowledgement');
      if (!intent || previous.kind === 'acknowledgement' || message.payload.invitationFingerprint !== invitation.fingerprint || message.payload.intentFingerprint !== intent.fingerprint || message.payload.supersedes !== (contribution?.fingerprint ?? null)) fail('Contribution source lineage mismatch');
      if (contribution && message.payload.gift.id !== contribution.payload.gift.id) fail('An update cannot change the source gift id');
      const giftPrint = await homeProtocolFingerprint(message.payload.gift);
      if (giftPrints.has(giftPrint)) fail('Replayed semantic gift contribution');
      giftPrints.add(giftPrint); contribution = message;
    } else {
      if (!contribution || previous.kind !== 'contribution' || message.payload.contributionFingerprint !== contribution.fingerprint) fail('Acknowledgement must follow its contribution');
      if (!decision || !DECISION_CONTEXT.has(decision) || message.payload.decisionFingerprint !== decision.decisionFingerprint || message.payload.outcome !== decision.outcome || decision.contributionFingerprint !== contribution.fingerprint) fail('Imported acknowledgement does not prove a local owner decision');
    }
    if (['intent', 'contribution'].includes(message.kind) && (message.payload.slot !== invitation.payload.slot || message.payload.role !== invitation.payload.role)) fail('Contribution slot or role differs from the invitation');
    validated.push(message);
  }
  if (!invitation) fail('Exchange must start with an invitation');
  return freeze({ messages: validated, invitation, intent: intent ?? null, contribution: contribution ?? null });
}

export function createHomeReviewLedger(ownerRepository) {
  repository(ownerRepository);
  return freeze({ schemaVersion: 1, kind: 'dot-home-local-ledger', ownerRepository, records: [] });
}
export function validateHomeReviewLedger(input, ownerRepository) {
  const value = copyData(input);
  exact(value, ['schemaVersion', 'kind', 'ownerRepository', 'records'], 'local review ledger');
  if (value.schemaVersion !== 1 || value.kind !== 'dot-home-local-ledger' || value.ownerRepository !== ownerRepository) fail('Local ledger owner mismatch');
  if (!Array.isArray(value.records) || value.records.length > HOME_PROTOCOL_LIMITS.ledgerRecords) fail('Local ledger resource limit exceeded');
  const heads = new Set(), gifts = new Set(), latest = new Map();
  for (const record of value.records) {
    exact(record, ['exchangeId', 'headFingerprint', 'contributionFingerprint', 'giftFingerprint', 'decisionFingerprint', 'outcome'], 'ledger record');
    slug(record.exchangeId, 'ledger exchange id');
    for (const key of ['headFingerprint', 'contributionFingerprint', 'giftFingerprint']) hash(record[key], key);
    if (!['reviewed', 'accepted-locally', 'declined-locally'].includes(record.outcome) || (record.outcome === 'reviewed') !== (record.decisionFingerprint === null)) fail('Invalid ledger decision state');
    if (record.decisionFingerprint !== null) hash(record.decisionFingerprint, 'ledger decision fingerprint');
    if (heads.has(record.headFingerprint) || gifts.has(record.giftFingerprint)) fail('Duplicate local ledger record or semantic gift');
    if (latest.has(record.exchangeId) && latest.get(record.exchangeId).outcome !== 'reviewed') fail('Local ledger cannot reopen a decided exchange');
    heads.add(record.headFingerprint); gifts.add(record.giftFingerprint); latest.set(record.exchangeId, record);
  }
  return freeze(value);
}
function nextLedger(ledger, record) {
  if (ledger.records.length >= HOME_PROTOCOL_LIMITS.ledgerRecords) fail('Local ledger is full; retain replay history and review ledger rollover separately');
  return freeze({ ...ledger, records: [...ledger.records, record] });
}
/** Trusted local review: reconstruct all world placement checks from authoritative
 * gift-v1 and world-v1 data. Returned candidate changes are INERT, not accepted.
 * Supply only the owner's separately trusted ledger; the exchange cannot choose it. */
export async function reviewHomeExchange({ ownerDescriptor, peerDescriptor, messages, world, giftsByPath, ledger, reviewContextFingerprint = null, now = Date.now() }) {
  if (reviewContextFingerprint !== null) hash(reviewContextFingerprint, 'review context fingerprint');
  const owner = validateHomeDescriptor(ownerDescriptor), peer = validateHomeDescriptor(peerDescriptor);
  const localLedger = validateHomeReviewLedger(ledger, owner.repository);
  const exchange = await validateHomeExchange(messages, { ownerDescriptor: owner, peerDescriptor: peer, now });
  const contribution = exchange.contribution;
  if (!contribution || exchange.messages.at(-1).kind !== 'contribution') fail('Review requires a contribution and no imported acknowledgement');
  const gift = contribution.payload.gift, giftFingerprint = await homeProtocolFingerprint(gift);
  const prior = localLedger.records.findLast(r => r.exchangeId === contribution.exchangeId);
  if (prior) {
    if (prior.contributionFingerprint === contribution.fingerprint) fail('Replayed contribution already reviewed locally');
    if (prior.outcome !== 'reviewed') fail('Exchange already has a local decision; start a new invitation');
    if (!exchange.messages.some(m => m.kind === 'contribution' && m.fingerprint === prior.headFingerprint)) fail('Conflicting update against the local reviewed revision');
  }
  if (localLedger.records.some(r => r.giftFingerprint === giftFingerprint)) fail('Replayed semantic gift already reviewed locally');
  const accepted = validateWorld(world, giftsByPath);
  const slot = accepted.emptySlots.find(s => s.id === contribution.payload.slot);
  if (!slot) fail('Requested trusted slot is absent or occupied');
  const registry = new Map(accepted.placements.map(p => [`community/gifts/${p.gift.id}.json`, p.gift]));
  const giftPath = `community/gifts/${gift.id}.json`;
  if (registry.has(giftPath)) fail('Contribution conflicts with an accepted gift id');
  registry.set(giftPath, gift);
  const proposed = validateWorld({ ...accepted.manifest, accepted: [...accepted.manifest.accepted, { id: gift.id, path: giftPath, slot: slot.id }] }, registry);
  const placement = proposed.placements.find(p => p.gift.id === gift.id);
  const core = {
    schemaVersion: 1, kind: 'dot-home-inert-review', ownerRepository: owner.repository, peerRepository: peer.repository,
    exchangeId: contribution.exchangeId, contributionFingerprint: contribution.fingerprint, giftFingerprint,
    ownerDescriptorFingerprint: await homeProtocolFingerprint(owner), peerDescriptorFingerprint: await homeProtocolFingerprint(peer),
    baseWorldFingerprint: await homeProtocolFingerprint({ manifest: accepted.manifest, gifts: await Promise.all(accepted.placements.map(async p => ({ id: p.gift.id, fingerprint: await homeProtocolFingerprint(p.gift) }))) }), ledgerFingerprint: await homeProtocolFingerprint(localLedger),
    ...(reviewContextFingerprint === null ? {} : { reviewContextFingerprint }),
    preview: { gift, slot: placement.slot, origin: placement.origin, bounds: placement.bounds },
    diff: { beforeAccepted: accepted.manifest.accepted, afterAccepted: proposed.manifest.accepted },
    identityAuthenticated: false, publicationAuthorized: false, installed: false,
  };
  const review = freeze({ ...core, reviewedAt: iso(now), reviewFingerprint: await homeProtocolFingerprint(core) });
  const record = { exchangeId: contribution.exchangeId, headFingerprint: contribution.fingerprint, contributionFingerprint: contribution.fingerprint, giftFingerprint, decisionFingerprint: null, outcome: 'reviewed' };
  const updatedLedger = nextLedger(localLedger, record);
  REVIEW_CONTEXT.set(review, { exchange, owner, peer, ledger: localLedger, record, now, proposed });
  return freeze({ review, nextLedger: updatedLedger });
}
/** Only a fresh, in-memory trusted review plus an explicit local choice can make
 * a local decision record. JSON imports can never become review authority. */
export async function recordHomeOwnerDecision(review, { decision, expectedReviewFingerprint, now = Date.now() } = {}) {
  const context = REVIEW_CONTEXT.get(review);
  if (!context) fail('A fresh trusted local review is required; imported artifacts grant no authority');
  if (!['accept', 'decline'].includes(decision)) fail('An explicit local accept or decline decision is required');
  if (expectedReviewFingerprint !== review.reviewFingerprint) fail('Review changed; inspect the current preview before deciding');
  nowMs(now);
  if (now < context.now || now >= timestamp(context.exchange.invitation.expiresAt)) fail('Local decision is outside the reviewed exchange lifetime');
  // Consume the in-memory review once: a second or concurrent choice must rerun review.
  REVIEW_CONTEXT.delete(review);
  const core = { schemaVersion: 1, kind: 'dot-home-local-owner-decision', ownerRepository: review.ownerRepository,
    exchangeId: review.exchangeId, reviewFingerprint: review.reviewFingerprint, contributionFingerprint: review.contributionFingerprint,
    baseWorldFingerprint: review.baseWorldFingerprint, outcome: decision === 'accept' ? 'accepted-locally' : 'declined-locally',
    decidedAt: iso(now), identityAuthenticated: false, publicationAuthorized: false, installed: false };
  const record = freeze({ ...core, decisionFingerprint: await homeProtocolFingerprint(core) });
  DECISION_CONTEXT.set(record, context);
  const acknowledgement = await createHomeEnvelope({ schemaVersion: 1, kind: 'acknowledgement', exchangeId: review.exchangeId,
    revision: context.exchange.messages.length, parentFingerprint: review.contributionFingerprint,
    from: await homeReference(context.owner), to: await homeReference(context.peer), createdAt: iso(now), expiresAt: context.exchange.invitation.expiresAt,
    payload: { contributionFingerprint: review.contributionFingerprint, decisionFingerprint: record.decisionFingerprint, outcome: record.outcome } });
  const ledger = nextLedger(context.ledger, { ...context.record, headFingerprint: acknowledgement.fingerprint, decisionFingerprint: record.decisionFingerprint, outcome: record.outcome });
  return freeze({ decision: record, acknowledgement, nextLedger: ledger });
}
