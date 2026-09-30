/**
 * Trusted, dependency-free community contract. Contributor JSON is data only.
 * Use raw text imports with loadCommunityWorld() to enforce the byte limit
 * before parsing. Every public function throws GiftValidationError on failure.
 * All returned data is deeply frozen and contains only freshly copied values.
 * Origins are scene-space minimum corners; every size is in integer grid units.
 */
export const GIFT_LIMITS = Object.freeze({
  bytes: 64 * 1024,
  blocks: 512,
  dimension: 32,
  instances: 8,
  visibleBlocks: 4096,
  worldDimension: 256,
  worldCoordinate: 1000,
  zones: 8,
  slots: 8,
  protectedAreas: 16,
});
export const GRID_UNIT = 0.1;
export const GIFT_PALETTE = Object.freeze({
  sage: 0x91a282, fern: 0x5b8249, clay: 0xbf9969,
  honey: 0xddbf79, cream: 0xf1dfb3, bark: 0x6f6547,
});
const GIFT_KEYS = ['schemaVersion', 'id', 'title', 'creator', 'description', 'size', 'blocks'];
const WORLD_KEYS = ['schemaVersion', 'gridUnit', 'zones', 'slots', 'protectedAreas', 'accepted'];
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CONTROL_OR_HTML = /[<>\p{Cc}\p{Cf}\p{Cs}]/u;
// Text is never interpreted as markup. Reject links as an additional content
// rule, including bare domains, protocol-relative URLs and common URI schemes.
const LINK = /(?:\b(?:https?|ftp|file|data|javascript|vbscript|blob|mailto|tel|sms|wss?)\s*:|\b[a-z][a-z0-9+.-]*\s*:\s*\/\s*\/|\/\/|www\s*\.|\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}\b)/iu;
const EPSILON = 1e-9;

export class GiftValidationError extends Error {
  constructor(message) { super(message); this.name = 'GiftValidationError'; }
}
function fail(message) { throw new GiftValidationError(message); }
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function exactObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail(`${label} must be a plain object`);
  const own = Reflect.ownKeys(value);
  for (const key of own) {
    if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key) || !keys.includes(key)) fail(`${label} has an unexpected key`);
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (!desc || !('value' in desc) || !desc.enumerable) fail(`${label} must contain data properties only`);
  }
  if (own.length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail(`${label} is missing a required key`);
}
function array(value, min, max, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < min || value.length > max) fail(`${label} has an invalid array length`);
  // Sparse arrays, accessors and extra/prototype properties are not JSON data.
  const own = Reflect.ownKeys(value);
  if (own.length !== value.length + 1) fail(`${label} must be a dense data array`);
  for (let i = 0; i < value.length; i++) {
    const desc = Object.getOwnPropertyDescriptor(value, String(i));
    if (!desc || !('value' in desc) || !desc.enumerable) fail(`${label} must be a dense data array`);
  }
  return value;
}
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${label} must be an integer from ${min} to ${max}`);
  return value;
}
function slug(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 48 || !SLUG.test(value) || FORBIDDEN_KEYS.has(value)) fail(`${label} must be a lowercase slug of 1–48 characters`);
  return value;
}
function text(value, max, label, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max || CONTROL_OR_HTML.test(value) || LINK.test(value)) fail(`${label} must be plain text without links (maximum ${max} characters)`);
  return value;
}
function dimensions(value, max, label) {
  return array(value, 3, 3, label).map((n, i) => integer(n, 1, max, `${label}[${i}]`));
}
function origin(value, label) {
  return array(value, 3, 3, label).map((n, i) => {
    if (!Number.isFinite(n) || Math.abs(n) > GIFT_LIMITS.worldCoordinate) fail(`${label}[${i}] must be a finite bounded scene coordinate`);
    return n;
  });
}
/** Only trusted registry entries may select a local gift file. */
export function validateGiftPath(value) {
  if (typeof value !== 'string' || !/^community\/gifts\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(value)) fail('Gift path must be community/gifts/<lowercase-slug>.json');
  slug(value.slice('community/gifts/'.length, -5), 'Gift filename');
  return value;
}
function parseJson(source, label) {
  if (typeof source !== 'string') fail(`${label} must be UTF-8 JSON text`);
  // Checking UTF-16 length first avoids encoding an arbitrarily large string.
  if (source.length > GIFT_LIMITS.bytes || new TextEncoder().encode(source).byteLength > GIFT_LIMITS.bytes) fail(`${label} exceeds the 64 KiB byte limit`);
  try {
    return JSON.parse(source, (key, value) => {
      if (FORBIDDEN_KEYS.has(key)) fail(`${label} contains a forbidden prototype key`);
      return value;
    });
  } catch (error) {
    if (error instanceof GiftValidationError) throw error;
    fail(`${label} is not valid JSON`);
  }
}
export function parseGiftJson(source) { return validateGift(parseJson(source, 'Gift')); }
export function parseWorldJson(source) { return normalizeWorld(parseJson(source, 'World')); }

/** Validate and copy a single declaration. Internal sculptural overlap is allowed. */
export function validateGift(value) {
  exactObject(value, GIFT_KEYS, 'Gift');
  if (value.schemaVersion !== 1) fail('Gift schemaVersion must be 1');
  const result = {
    schemaVersion: 1,
    id: slug(value.id, 'Gift id'),
    title: text(value.title, 60, 'Gift title'),
    creator: text(value.creator, 40, 'Gift creator'),
    description: text(value.description, 240, 'Gift description', true),
    size: dimensions(value.size, GIFT_LIMITS.dimension, 'Gift size'),
    blocks: [],
  };
  result.blocks = array(value.blocks, 1, GIFT_LIMITS.blocks, 'Gift blocks').map((block, i) => {
    array(block, 7, 7, `Block ${i}`);
    const copy = block.slice();
    for (let axis = 0; axis < 3; axis++) {
      integer(copy[axis], 0, GIFT_LIMITS.dimension - 1, `Block ${i} position`);
      integer(copy[axis + 3], 1, GIFT_LIMITS.dimension, `Block ${i} dimension`);
      if (copy[axis] + copy[axis + 3] > result.size[axis]) fail(`Block ${i} is outside gift size`);
    }
    if (typeof copy[6] !== 'string' || !Object.hasOwn(GIFT_PALETTE, copy[6])) fail(`Block ${i} uses an unknown palette color`);
    return copy;
  });
  return freeze(result);
}
function boundedArea(value, label, slot = false) {
  exactObject(value, slot ? ['id', 'zone', 'origin', 'size'] : ['id', 'origin', 'size'], label);
  const result = { id: slug(value.id, `${label} id`), origin: origin(value.origin, `${label} origin`), size: dimensions(value.size, GIFT_LIMITS.worldDimension, `${label} size`) };
  if (slot) result.zone = slug(value.zone, `${label} zone`);
  return result;
}
function unique(entries, key, label) {
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry[key])) fail(`Duplicate ${label}`);
    seen.add(entry[key]);
  }
}
/** Convert an area's integer extents into an absolute, scene-space AABB. */
export function areaBounds(area) {
  const o = origin(area.origin, 'Area origin');
  const size = dimensions(area.size, GIFT_LIMITS.worldDimension, 'Area size');
  return freeze({ min: o, max: o.map((n, axis) => n + size[axis] * GRID_UNIT) });
}
function contains(outer, inner) {
  return outer.min.every((n, axis) => inner.min[axis] >= n - EPSILON && inner.max[axis] <= outer.max[axis] + EPSILON);
}
function overlaps(a, b) {
  // Merely touching a border is allowed; intersecting positive volume is not.
  return a.min.every((n, axis) => n < b.max[axis] - EPSILON && a.max[axis] > b.min[axis] + EPSILON);
}
function noCollisions(areas, label) {
  for (let i = 0; i < areas.length; i++) for (let j = i + 1; j < areas.length; j++) {
    if (overlaps(areaBounds(areas[i]), areaBounds(areas[j]))) fail(`${label} overlap`);
  }
}
function normalizeWorld(value) {
  exactObject(value, WORLD_KEYS, 'World');
  if (value.schemaVersion !== 1 || value.gridUnit !== GRID_UNIT) fail('World must use schemaVersion 1 and gridUnit 0.1');
  const result = {
    schemaVersion: 1, gridUnit: GRID_UNIT,
    zones: array(value.zones, 1, GIFT_LIMITS.zones, 'World zones').map((v, i) => boundedArea(v, `Zone ${i}`)),
    slots: array(value.slots, 0, GIFT_LIMITS.slots, 'World slots').map((v, i) => boundedArea(v, `Slot ${i}`, true)),
    protectedAreas: array(value.protectedAreas, 0, GIFT_LIMITS.protectedAreas, 'World protectedAreas').map((v, i) => boundedArea(v, `Protected area ${i}`)),
    accepted: array(value.accepted, 0, GIFT_LIMITS.instances, 'World accepted').map((v, i) => {
      exactObject(v, ['id', 'path', 'slot'], `Accepted gift ${i}`);
      const id = slug(v.id, 'Accepted gift id'), path = validateGiftPath(v.path), slot = slug(v.slot, 'Accepted gift slot');
      if (path !== `community/gifts/${id}.json`) fail('Accepted gift path must match its id');
      return { id, path, slot };
    }),
  };
  unique(result.zones, 'id', 'zone id');
  unique(result.slots, 'id', 'slot id');
  unique(result.protectedAreas, 'id', 'protected area id');
  unique(result.accepted, 'id', 'accepted gift id');
  unique(result.accepted, 'path', 'accepted gift path');
  unique(result.accepted, 'slot', 'accepted gift slot');
  noCollisions(result.zones, 'World zones');
  noCollisions(result.slots, 'World slots');
  const zones = new Map(result.zones.map(z => [z.id, z]));
  const slots = new Map(result.slots.map(s => [s.id, s]));
  for (const slot of result.slots) {
    const zone = zones.get(slot.zone);
    if (!zone) fail('Slot references an unresolved zone');
    if (!contains(areaBounds(zone), areaBounds(slot))) fail('Slot is outside its zone');
    for (const protectedArea of result.protectedAreas) if (overlaps(areaBounds(slot), areaBounds(protectedArea))) fail('Slot overlaps a protected area');
  }
  for (const accepted of result.accepted) if (!slots.has(accepted.slot)) fail('Accepted gift references an unresolved slot');
  return freeze(result);
}
function entriesOfRegistry(registry) {
  if (registry instanceof Map) return [...registry.entries()];
  if (!registry || typeof registry !== 'object' || Array.isArray(registry) || ![Object.prototype, null].includes(Object.getPrototypeOf(registry))) fail('Gift registry must be a path-keyed object or Map');
  return Reflect.ownKeys(registry).map(key => {
    if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key)) fail('Gift registry has an unexpected key');
    const desc = Object.getOwnPropertyDescriptor(registry, key);
    if (!desc || !('value' in desc) || !desc.enumerable) fail('Gift registry must contain data properties only');
    return [key, desc.value];
  });
}
/**
 * Validate a trusted world against already parsed, path-keyed gifts. Every
 * registry entry must be accepted: the browser should bundle accepted JSON only.
 * placements: {gift, zone, slot, origin, bounds}; emptySlots: normalized slots.
 */
export function validateWorld(value, giftsByPath) {
  const manifest = normalizeWorld(value);
  const gifts = new Map();
  const ids = new Set();
  const acceptedPaths = new Set(manifest.accepted.map(v => v.path));
  for (const [path, value] of entriesOfRegistry(giftsByPath)) {
    validateGiftPath(path);
    if (!acceptedPaths.has(path)) fail('Gift registry contains an unaccepted file');
    const gift = validateGift(value);
    if (ids.has(gift.id)) fail('Duplicate gift id');
    ids.add(gift.id);
    if (path !== `community/gifts/${gift.id}.json`) fail('Gift file path must match its id');
    gifts.set(path, gift);
  }
  let totalBlocks = 0;
  const occupied = new Set();
  const placements = manifest.accepted.map(accepted => {
    const gift = gifts.get(accepted.path);
    if (!gift || gift.id !== accepted.id) fail('Accepted gift references an unresolved gift');
    const slot = manifest.slots.find(v => v.id === accepted.slot);
    const zone = manifest.zones.find(v => v.id === slot.zone);
    if (gift.size.some((n, axis) => n > slot.size[axis])) fail('Gift does not fit its reserved slot');
    // Center on X/Z, align Y to the slot floor. A gift never chooses its origin.
    const placedOrigin = slot.origin.map((n, axis) => n + (axis === 1 ? 0 : (slot.size[axis] - gift.size[axis]) * GRID_UNIT / 2));
    const bounds = areaBounds({ origin: placedOrigin, size: gift.size });
    if (!contains(areaBounds(slot), bounds)) fail('Gift is outside its reserved slot');
    for (const area of manifest.protectedAreas) if (overlaps(bounds, areaBounds(area))) fail('Gift overlaps a protected area');
    occupied.add(slot.id);
    totalBlocks += gift.blocks.length;
    if (totalBlocks > GIFT_LIMITS.visibleBlocks) fail('Visible gifts exceed the total block budget');
    return { gift, zone, slot, origin: placedOrigin, bounds };
  });
  for (let i = 0; i < placements.length; i++) for (let j = i + 1; j < placements.length; j++) {
    if (overlaps(placements[i].bounds, placements[j].bounds)) fail('Gift placements overlap');
  }
  return freeze({ manifest, placements, emptySlots: manifest.slots.filter(s => !occupied.has(s.id)), totalBlocks });
}
/** Browser/CLI entry point. Inputs are raw JSON, not modules or external URLs. */
export function loadCommunityWorld(manifestInput, giftTextByPath) {
  const manifest = typeof manifestInput === 'string' ? parseWorldJson(manifestInput) : normalizeWorld(manifestInput);
  const gifts = new Map(entriesOfRegistry(giftTextByPath).map(([path, raw]) => [validateGiftPath(path), parseGiftJson(raw)]));
  return validateWorld(manifest, gifts);
}
/** Pure box-to-instance conversion; creates no materials, lights or network IO. */
export function giftToInstances(value, at = [0, 0, 0]) {
  const gift = validateGift(value), min = origin(at, 'Gift placement origin');
  return freeze(gift.blocks.map(([x, y, z, w, h, d, color]) => [
    min[0] + (x + w / 2) * GRID_UNIT,
    min[1] + (y + h / 2) * GRID_UNIT,
    min[2] + (z + d / 2) * GRID_UNIT,
    w * GRID_UNIT, h * GRID_UNIT, d * GRID_UNIT, GIFT_PALETTE[color],
  ]));
}
