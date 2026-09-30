/**
 * Pure bridge from a completed group recipe to the existing static gift format.
 * Recipes, attribution and live animation never extend the gift-v1 contract.
 * Nothing here accepts URLs, loads assets, changes a project, or accepts a gift.
 */
import { encodeGroupShare, decodeGroupShare } from './group-project-engine.js';
import { GIFT_LIMITS, GiftValidationError, parseGiftJson, validateGift, validateWorld } from './gifts.js';

export const GROUP_GIFT_SIZE = Object.freeze([16, 20, 12]);
export const MAX_GROUP_GIFT_PROVENANCE_BYTES = 32 * 1024;

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function completedSource(project) {
  // The group engine checks the exact shape, descriptors, checksum and derived
  // state before anything is read here. Work only from its canonical copy.
  const sourceRecipe = encodeGroupShare(project);
  const source = decodeGroupShare(sourceRecipe);
  if (!source.completed) throw new TypeError('Complete the group project before exporting a static gift');
  return { source, sourceRecipe };
}

const HARMONY_COLORS = Object.freeze({
  sunrise: Object.freeze({ petal: 'honey', inner: 'cream', heart: 'clay' }),
  moonlight: Object.freeze({ petal: 'cream', inner: 'sage', heart: 'honey' }),
  meadow: Object.freeze({ petal: 'sage', inner: 'fern', heart: 'cream' }),
});

// Two boot boxes and their ankle anchors form a frozen, readable gait pose.
const BOOTS = Object.freeze({
  glide: Object.freeze([[2, 2, 6, 5, 2, 3], [9, 3, 7, 4, 2, 3]]),
  hop: Object.freeze([[4, 4, 6, 3, 2, 3], [9, 4, 6, 3, 2, 3]]),
  sway: Object.freeze([[4, 2, 5, 3, 2, 3], [10, 3, 6, 3, 2, 3]]),
  counterstep: Object.freeze([[2, 3, 4, 4, 2, 3], [10, 2, 7, 4, 2, 3]]),
});

/** A deterministic, inert sculpture, validated by the unchanged gift-v1 parser. */
export function createGroupGift(project) {
  const { source } = completedSource(project);
  const blocks = [];
  const add = (x, y, z, width, height, depth, color) => blocks.push([x, y, z, width, height, depth, color]);
  const colors = HARMONY_COLORS[source.harmony];

  add(0, 0, 0, 16, 1, 12, 'clay');
  add(0, 1, 0, 16, 1, 12, 'sage');

  // Eight front-edge marks retain every authored step, including silent steps.
  add(0, 2, 0, 16, 1, 2, 'bark');
  source.rhythm.forEach((beat, step) => add(step * 2, 3, 0, 1, beat + 1, 1, beat ? 'honey' : 'cream'));

  for (const [x, y, z, width, height, depth] of BOOTS[source.gait]) {
    add(x, y, z, width, height, depth, 'bark');
    add(x, y, z, width, 1, depth, 'clay');
    const ankleX = x < 8 ? x + width - 1 : x;
    add(ankleX, y + height, z + 1, 1, 8 - y - height, 1, 'fern');
    const bridgeX = Math.min(ankleX, 8);
    add(bridgeX, 7, z + 1, Math.abs(ankleX - 8) + 1, 1, 1, 'fern');
  }

  // Straight and curved stems have distinct silhouettes, not merely labels.
  const stemXs = source.base.stem === 'curved' ? [8, 9, 9, 8, 7, 7, 8] : [8, 8, 8, 8, 8, 8, 8];
  stemXs.forEach((x, i) => add(x, i + 6, 7, 1, 1, 1, 'fern'));
  add(5, 9, 7, 3, 1, 1, 'fern');
  add(4, 10, 7, 2, 1, 1, 'sage');
  add(9, 11, 7, 3, 1, 1, 'sage');

  // Each authored petal has one distinct outer tip (depth 3), and three
  // shorter inner cells. Even the 16-petal maximum keeps unique integer tips.
  for (let petal = 0; petal < source.traits.petals; petal++) {
    const angle = Math.PI / 2 + petal * Math.PI * 2 / source.traits.petals;
    for (let radius = 2; radius <= 5; radius++) {
      const tip = radius === 5;
      add(Math.round(7 + Math.cos(angle) * radius), Math.round(13 + Math.sin(angle) * radius), tip ? 5 : 6,
        1, 1, tip ? 3 : 2, tip ? colors.petal : colors.inner);
    }
  }
  add(6, 12, 5, 3, 3, 4, colors.heart);
  add(6, 14, 9, 1, 1, 1, 'bark');
  add(8, 14, 9, 1, 1, 1, 'bark');
  add(7, 12, 9, 1, 1, 1, 'cream');

  // The three bounded chord marks retain harmony intervals in miniature;
  // their color and depth also distinguish the authored timbre.
  const timbreColor = { bell: 'honey', wood: 'bark', glass: 'cream' }[source.timbre];
  source.traits.harmonyNotes.forEach((note, index) => add(3 + index * 4, 2, 10, 1, 1 + note, source.timbre === 'wood' ? 2 : 1, timbreColor));

  return parseGiftJson(JSON.stringify({
    schemaVersion: 1,
    id: `group-flower-${source.id}`,
    title: source.title,
    creator: 'Group contributors (unverified)',
    description: `Static ${source.traits.petals}-petal flower with a ${source.base.stem} stem, ${source.gait} boot pose, ${source.harmony} ${source.timbre} harmony and rhythm ${source.rhythm.join('')}. Contributor names are unverified; see the separate provenance.`,
    size: [...GROUP_GIFT_SIZE],
    blocks,
  }));
}

/**
 * Separate bounded attribution, never embedded into gift-v1. Names and roles
 * are contributor-supplied game labels, not verified identities. Idle roster
 * members are retained in the source recipe, but not credited as contributors.
 * The UI may derive its own same-site source link from sourceRecipe.
 */
export function createGroupGiftProvenance(project) {
  const { source, sourceRecipe } = completedSource(project);
  const contributors = source.participants.flatMap(participant => {
    const contributionIds = source.contributions.filter(record => record.participantId === participant.id).map(record => record.id);
    return contributionIds.length ? [{ ...participant, contributionIds }] : [];
  });
  const provenance = {
    schemaVersion: 1,
    kind: 'group-flower-provenance',
    giftId: `group-flower-${source.id}`,
    projectId: source.id,
    rootId: source.rootId,
    parentId: source.parentId,
    generation: source.generation,
    title: source.title,
    experienceType: source.experienceType,
    static: true,
    unverified: true,
    contributors,
    sourceRecipe,
  };
  if (new TextEncoder().encode(JSON.stringify(provenance)).byteLength > MAX_GROUP_GIFT_PROVENANCE_BYTES) {
    throw new TypeError('Group gift provenance exceeds the 32 KiB byte limit');
  }
  return freeze(provenance);
}

function dataObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new GiftValidationError(`Invalid ${label}`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) throw new GiftValidationError(`Invalid ${label} fields`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new GiftValidationError(`Invalid ${label} field`);
  }
}

/**
 * Build a freshly validated, in-memory garden preview. The returned manifest
 * includes the preview only for rendering; this does not accept or save a gift.
 * Rebuild derived origins/emptySlots rather than trusting caller-supplied ones.
 */
export function getGiftPreviewCommunity(community, gift) {
  dataObject(community, ['manifest', 'placements', 'emptySlots', 'totalBlocks'], 'community');
  const placements = community.placements;
  if (!Array.isArray(placements) || Object.getPrototypeOf(placements) !== Array.prototype || placements.length > GIFT_LIMITS.instances || Reflect.ownKeys(placements).length !== placements.length + 1) {
    throw new GiftValidationError('Invalid community placements');
  }
  const registry = new Map();
  for (let i = 0; i < placements.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(placements, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new GiftValidationError('Invalid community placement');
    const placement = descriptor.value;
    dataObject(placement, ['gift', 'zone', 'slot', 'origin', 'bounds'], 'community placement');
    const existing = validateGift(placement.gift);
    const path = `community/gifts/${existing.id}.json`;
    if (registry.has(path)) throw new GiftValidationError('Duplicate community gift');
    registry.set(path, existing);
  }
  const accepted = validateWorld(community.manifest, registry);
  const openSlot = accepted.manifest.slots.find(slot => slot.id === 'open-plot');
  if (!openSlot) throw new GiftValidationError('This community has no open-plot preview slot');
  if (accepted.manifest.accepted.some(entry => entry.slot === openSlot.id)) throw new GiftValidationError('The open-plot preview slot is occupied');
  const previewGift = parseGiftJson(JSON.stringify(validateGift(gift)));
  const path = `community/gifts/${previewGift.id}.json`;
  if (registry.has(path)) throw new GiftValidationError('This gift is already accepted in the community');
  registry.set(path, previewGift);
  return validateWorld({ ...accepted.manifest, accepted: [...accepted.manifest.accepted, { id: previewGift.id, path, slot: openSlot.id }] }, registry);
}
