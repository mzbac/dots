/** Strict, inert transport packet. Consistency is not authenticated authorship. */
import {
  HOME_PROTOCOL_LIMITS, HomeProtocolError, parseHomeProtocolJson,
  homeProtocolFingerprint, validateHomeDescriptor, validateHomeExchange,
} from './home-protocol.js';
import { decodeGroupShare } from './group-project-engine.js';
import { createGroupGift, createGroupGiftProvenance, MAX_GROUP_GIFT_PROVENANCE_BYTES } from './group-gift.js';

export const HOME_PACKET_LIMITS = Object.freeze({ bytes: 48 * 1024, provenance: 8 });
export const HOME_PACKET_FENCE = 'dot-home-packet';
function fail(message) { throw new HomeProtocolError(message); }
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${label}`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) fail(`Invalid ${label} fields`);
  for (const key of keys) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property || !('value' in property) || !property.enumerable) fail(`Invalid ${label} data property`);
  }
}
// Do not stringify caller objects before inspecting their data descriptors.
// This protects the object API as well as the string/CLI entry points.
function copy(value) {
  let nodes = 0;
  const visit = (item, depth) => {
    if (++nodes > HOME_PROTOCOL_LIMITS.nodes || depth > HOME_PROTOCOL_LIMITS.depth) fail('Packet resource limit exceeded');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item === 'string') { if (item.length > HOME_PACKET_LIMITS.bytes) fail('Packet byte limit exceeded'); return item; }
    if (!item || typeof item !== 'object') fail('Packet accepts JSON data only');
    const keys = Reflect.ownKeys(item);
    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype || item.length > HOME_PROTOCOL_LIMITS.nodes || keys.length !== item.length + 1) fail('Invalid packet array');
      const array = [];
      for (let i = 0; i < item.length; i++) {
        const property = Object.getOwnPropertyDescriptor(item, String(i));
        if (!property || !('value' in property) || !property.enumerable) fail('Invalid packet array data');
        array.push(visit(property.value, depth + 1));
      }
      return array;
    }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) fail('Packet objects must be plain JSON');
    const result = {};
    for (const key of keys) {
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) fail('Forbidden packet key');
      const property = Object.getOwnPropertyDescriptor(item, key);
      if (!property || !('value' in property) || !property.enumerable) fail('Invalid packet data property');
      result[key] = visit(property.value, depth + 1);
    }
    return result;
  };
  const result = visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > HOME_PACKET_LIMITS.bytes) fail('Packet byte limit exceeded');
  return result;
}
export function parseHomePacketJson(source) {
  return parseHomeProtocolJson(source, HOME_PACKET_LIMITS.bytes);
}
/** A typed fence is a data declaration, never a command. Markdown and every
 * other fence are ignored. Multiple declarations and nested fences fail closed. */
export function extractHomePacketBlock(body) {
  if (typeof body !== 'string' || body.length > HOME_PROTOCOL_LIMITS.bytes || new TextEncoder().encode(body).byteLength > HOME_PROTOCOL_LIMITS.bytes) fail('Packet body byte limit exceeded');
  const lines = body.split('\n');
  let enclosing = null, start = null, end = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].replace(/\r$/u, '');
    const declaration = /^[ \t]*[`~]{3,}[ \t]*dot-home-packet\b/u.test(line);
    if (declaration) {
      if (line !== '```dot-home-packet' || enclosing || start !== null) fail('Nested, multiple or ambiguous packet declaration');
      start = index; enclosing = { marker: '`', length: 3, packet: true }; continue;
    }
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (!fence) continue;
    if (enclosing) {
      if (fence[1][0] === enclosing.marker && fence[1].length >= enclosing.length && /^[ \t]*$/u.test(fence[2])) {
        if (enclosing.packet) { if (line !== '```') fail('Ambiguous packet closing fence'); end = index; }
        enclosing = null;
      } else if (enclosing.packet) fail('Nested or ambiguous packet fence');
    } else enclosing = { marker: fence[1][0], length: fence[1].length, packet: false };
  }
  if (start === null) fail('Expected exactly one declared dot-home-packet JSON block');
  if (end === null) fail('Unterminated packet declaration');
  return parseHomePacketJson(lines.slice(start + 1, end).join('\n'));
}
/** Every supplied provenance is bound to one exact contribution revision.
 * Regeneration verifies the complete static gift and attribution/lineage data,
 * never a contributor's identity, authorization or real-world participation. */
export async function validateHomePacket(input, { ownerDescriptor, now = Date.now() } = {}) {
  const packet = copy(input);
  exact(packet, Object.hasOwn(packet, 'provenance')
    ? ['schemaVersion', 'peer', 'envelopes', 'provenance'] : ['schemaVersion', 'peer', 'envelopes'], 'home packet');
  if (packet.schemaVersion !== 1) fail('Unsupported home packet version');
  const owner = validateHomeDescriptor(ownerDescriptor);
  packet.peer = validateHomeDescriptor(packet.peer);
  const exchange = await validateHomeExchange(packet.envelopes, { ownerDescriptor: owner, peerDescriptor: packet.peer, now });
  packet.envelopes = exchange.messages;
  const entries = packet.provenance ?? [];
  if (!Array.isArray(entries) || entries.length > HOME_PACKET_LIMITS.provenance) fail('Invalid packet provenance count');
  const contributions = packet.envelopes.filter(message => message.kind === 'contribution');
  const byFingerprint = new Map(contributions.map(message => [message.fingerprint, message]));
  const verified = new Map();
  for (const entry of entries) {
    exact(entry, ['contributionFingerprint', 'group'], 'packet provenance entry');
    if (!byFingerprint.has(entry.contributionFingerprint) || verified.has(entry.contributionFingerprint)) fail('Unknown or duplicate provenance contribution');
    if (!entry.group || typeof entry.group !== 'object' || Array.isArray(entry.group) || typeof entry.group.sourceRecipe !== 'string') fail('Invalid group provenance');
    if (new TextEncoder().encode(JSON.stringify(entry.group)).byteLength > MAX_GROUP_GIFT_PROVENANCE_BYTES) fail('Group provenance byte limit exceeded');
    let gift, provenance;
    try {
      const project = decodeGroupShare(entry.group.sourceRecipe);
      gift = createGroupGift(project);
      provenance = createGroupGiftProvenance(project);
    } catch { fail('Group provenance requires a canonical completed source recipe'); }
    if (await homeProtocolFingerprint(provenance) !== await homeProtocolFingerprint(entry.group)) fail('Group attribution or lineage does not exactly match its source recipe');
    if (await homeProtocolFingerprint(gift) !== await homeProtocolFingerprint(byFingerprint.get(entry.contributionFingerprint).payload.gift)) fail('Submitted gift does not exactly match its completed group source recipe');
    verified.set(entry.contributionFingerprint, { sourceRecipeFingerprint: await homeProtocolFingerprint(provenance.sourceRecipe),
      provenanceFingerprint: await homeProtocolFingerprint(provenance), projectId: provenance.projectId,
      rootId: provenance.rootId, parentId: provenance.parentId, generation: provenance.generation });
  }
  const attribution = contributions.map(message => ({ contributionFingerprint: message.fingerprint, giftId: message.payload.gift.id,
    status: verified.has(message.fingerprint) ? 'exact-group-reproduction' : 'no-group-provenance',
    group: verified.get(message.fingerprint) ?? null, identityAuthenticated: false, requiresAttributionReview: true,
    notice: verified.has(message.fingerprint)
      ? 'Gift and declared attribution exactly reproduce the completed recipe. Contributor identities and participation remain unverified.'
      : 'No group source provenance was supplied. Treat this as a hand-authored static gift and review its attribution normally.' }));
  return freeze({ packet, attribution });
}

export const HOME_PACKET_PROPOSAL_PATH = 'community/proposals/home-packet.json';
const SHA = /^[0-9a-f]{40}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function date(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value;
}
function revisionRecord(record, keys, label) {
  exact(record, keys, label);
  if (!positive(record.id) || typeof record.nodeId !== 'string' || !/^[A-Za-z0-9_+=/-]{1,128}$/u.test(record.nodeId) ||
      !date(record.updatedAt) || !HASH.test(record.bodyFingerprint)) fail(`Invalid ${label} revision`);
}
/** A strict consistency-checked receipt can still be fabricated by its author.
 * It records a bounded read, not authenticated transport or home identity. */
export async function validateHomePacketSourceEvidence(input, { packet, ownerDescriptor } = {}) {
  const evidence = copy(input);
  if (new TextEncoder().encode(JSON.stringify(evidence)).byteLength > 8 * 1024) fail('Source evidence byte limit exceeded');
  exact(evidence, ['schemaVersion', 'kind', 'repository', 'itemType', 'itemNumber', 'item', 'source', 'comment',
    'headSha', 'file', 'packetFingerprint', 'observedAt', 'identityAuthenticated', 'reviewScope'], 'packet source evidence');
  const owner = validateHomeDescriptor(ownerDescriptor);
  if (evidence.schemaVersion !== 1 || evidence.kind !== 'github-home-packet-read' ||
      evidence.repository !== owner.repository || !['issue', 'pull-request'].includes(evidence.itemType) ||
      !positive(evidence.itemNumber) || evidence.itemNumber > 999999999 ||
      !['body', 'comment', 'file'].includes(evidence.source) || !date(evidence.observedAt) ||
      evidence.identityAuthenticated !== false || evidence.reviewScope !== 'selected-packet-only') fail('Invalid packet source evidence');
  revisionRecord(evidence.item, ['id', 'nodeId', 'updatedAt', 'bodyFingerprint'], 'item');
  if (evidence.source === 'comment') revisionRecord(evidence.comment, ['id', 'nodeId', 'updatedAt', 'bodyFingerprint'], 'comment');
  else if (evidence.comment !== null) fail('Unexpected comment evidence');
  if (evidence.itemType === 'pull-request') {
    if (!SHA.test(evidence.headSha)) fail('Source evidence requires the exact PR head');
  } else if (evidence.headSha !== null || evidence.source === 'file') fail('Unexpected issue source revision');
  if (evidence.source === 'file') {
    exact(evidence.file, ['path', 'commitSha', 'rootTreeSha', 'blobSha', 'byteLength', 'contentFingerprint', 'mode'], 'source file');
    if (evidence.file.path !== HOME_PACKET_PROPOSAL_PATH || evidence.file.commitSha !== evidence.headSha ||
        !SHA.test(evidence.file.rootTreeSha) || !SHA.test(evidence.file.blobSha) ||
        !positive(evidence.file.byteLength) || evidence.file.byteLength > HOME_PACKET_LIMITS.bytes ||
        !HASH.test(evidence.file.contentFingerprint) || evidence.file.mode !== '100644') fail('Invalid immutable source file evidence');
  } else if (evidence.file !== null) fail('Unexpected source file evidence');
  if (!HASH.test(evidence.packetFingerprint) || evidence.packetFingerprint !== await homeProtocolFingerprint(copy(packet))) fail('Source evidence packet fingerprint mismatch');
  return freeze(evidence);
}
