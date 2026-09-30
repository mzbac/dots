/**
 * A bounded, deterministic local game, not an AI/personhood or identity system.
 * The Gardener is a fictional NPC. Only the UI names that character; no user
 * text, identity, history, permissions, URLs, or executable data enter a share.
 *
 * Share checksums detect accidental edits, not a trusted author or real person.
 * History is this browser's simple local record, not a secure achievement ledger.
 */
export const MAX_CREATION_PAYLOAD_LENGTH = 2048;
export const EXPERIENCE_TYPES = Object.freeze(['grow-walk', 'teach-step', 'compose-beat', 'rhythm-duet']);
export const INTENTIONS = Object.freeze(['wander', 'delight']);
export const STEMS = Object.freeze(['curved', 'straight']);
export const CARES = Object.freeze(['sun', 'rain']);
export const RECIPES = Object.freeze(['walking-flower', 'counterstep-flower']);
export const EMPTY_HISTORY = Object.freeze({ v: 1, completed: Object.freeze([]) });

const GAITS = ['stroll', 'sway', 'glide', 'hop', 'dance', 'counterstep'];
const STAGES = ['walking', 'finished', 'remix'];
const BRANCHES = ['none', 'movement', 'music'];
const SOURCES = ['local', 'shared', 'remix'];
const PAYLOAD_KEYS = ['v', 'id', 'rootId', 'parentId', 'intention', 'stem', 'care', 'recipe', 'stage', 'branch', 'gait', 'adaptation', 'rhythm'];
const TRAIT_KEYS = ['petals', 'hue', 'stride', 'speed', 'bounce', 'tempo'];
const ZERO_RHYTHM = Object.freeze([0, 0, 0, 0, 0, 0, 0, 0]);
// A caller cannot turn a decoded share into a local completion by copying source.
const localResults = new WeakSet();

function fail(message) { throw new TypeError(message); }
function exactObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`Invalid ${label}`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) fail(`Invalid ${label} fields`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail(`Invalid ${label} field`);
  }
}
function optionalObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`Invalid ${label}`);
  const own = Reflect.ownKeys(value);
  if (own.some(key => typeof key !== 'string' || !keys.includes(key))) fail(`Invalid ${label} fields`);
  exactObject(value, own, label);
}
function enumValue(value, choices, label) {
  if (!choices.includes(value)) fail(`Invalid ${label}`);
  return value;
}
function boundedArray(value, length, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== length) fail(`Invalid ${label}`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1 || keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))) fail(`Invalid ${label} fields`);
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail(`Invalid ${label} step`);
  }
}
function rhythmValue(steps, needsBeat = false) {
  boundedArray(steps, 8, 'rhythm');
  if (steps.some(step => step !== 0 && step !== 1) || steps.some(step => Object.is(step, -0))) fail('Rhythm must contain exactly eight binary numbers');
  if (needsBeat && !steps.some(Boolean)) fail('Choose at least one beat');
  return [...steps];
}
function sameRhythm(left, right) { return left.every((value, index) => value === right[index]); }
function checksum(value) {
  // FNV-1a 64, applied to schema-limited ASCII. Deterministic in browser and Node.
  let hash = 0xcbf29ce484222325n;
  for (const char of JSON.stringify(value)) {
    hash ^= BigInt(char.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}
function baseGait(recipe, care) { return recipe === 'counterstep-flower' ? 'counterstep' : care === 'rain' ? 'sway' : 'stroll'; }
function rootFor(value) {
  return checksum({ v: 1, intention: value.intention, stem: value.stem, care: value.care, recipe: value.recipe, adaptation: value.adaptation });
}
function orderedPayload(value) {
  return {
    v: 1, id: value.id, rootId: value.rootId, parentId: value.parentId,
    intention: value.intention, stem: value.stem, care: value.care, recipe: value.recipe,
    stage: value.stage, branch: value.branch, gait: value.gait,
    adaptation: value.adaptation, rhythm: [...value.rhythm],
  };
}
function idFor(value) {
  if (value.stage === 'walking') return rootFor(value);
  const payload = orderedPayload({ ...value, id: '' });
  return checksum(payload);
}
function traitsFor(value) {
  const beats = value.rhythm.reduce((sum, beat) => sum + beat, 0);
  const counterstep = value.recipe === 'counterstep-flower';
  const moving = value.branch === 'movement';
  return Object.freeze({
    petals: counterstep ? 8 : value.intention === 'delight' ? 6 : 5,
    hue: value.care === 'sun' ? (value.intention === 'delight' ? 24 : 44) : (value.intention === 'delight' ? 302 : 204),
    stride: moving ? (value.gait === 'glide' ? 0.72 : 0.48) : value.stem === 'straight' ? 0.4 : 0.32,
    speed: (value.intention === 'wander' ? 0.7 : 0.95) + (moving ? 0.25 : 0) + value.adaptation * 0.05,
    bounce: value.gait === 'hop' ? 0.24 : value.stage === 'remix' ? 0.1 + beats * 0.015 : value.stem === 'curved' ? 0.07 : 0.04,
    tempo: (value.intention === 'delight' ? 112 : 88) + (counterstep ? 8 : 0),
  });
}
function freezeCreation(value, source, local = false) {
  const payload = orderedPayload(value);
  Object.freeze(payload.rhythm);
  const result = Object.freeze({ ...payload, traits: traitsFor(payload), source });
  if (local) localResults.add(result);
  return result;
}
function validatePayload(value, shareOnly = false) {
  exactObject(value, PAYLOAD_KEYS, 'creation');
  if (value.v !== 1) fail('Unsupported creation version');
  enumValue(value.intention, INTENTIONS, 'intention');
  enumValue(value.stem, STEMS, 'stem');
  enumValue(value.care, CARES, 'care');
  enumValue(value.recipe, RECIPES, 'recipe');
  enumValue(value.stage, STAGES, 'stage');
  enumValue(value.branch, BRANCHES, 'branch');
  enumValue(value.gait, GAITS, 'gait');
  if (!Number.isInteger(value.adaptation) || Object.is(value.adaptation, -0) || value.adaptation < 0 || value.adaptation > 3) fail('Invalid adaptation');
  for (const key of ['id', 'rootId']) if (typeof value[key] !== 'string' || !/^[0-9a-f]{16}$/.test(value[key])) fail('Invalid creation lineage');
  if (value.parentId !== null && (typeof value.parentId !== 'string' || !/^[0-9a-f]{16}$/.test(value.parentId))) fail('Invalid parent lineage');
  rhythmValue(value.rhythm, value.stage === 'remix' || value.branch === 'music');
  if (value.stage === 'walking') {
    if (shareOnly) fail('Grow and develop this flower before sharing');
    if (value.branch !== 'none' || value.parentId !== null || value.gait !== baseGait(value.recipe, value.care) || !sameRhythm(value.rhythm, ZERO_RHYTHM)) fail('Invalid walking recipe');
  } else {
    if (value.branch === 'none') fail('Choose a development first');
    if (value.stage === 'finished') {
      if (value.parentId !== value.rootId) fail('Invalid finished lineage');
      if (value.branch === 'movement' && (!['glide', 'hop'].includes(value.gait) || !sameRhythm(value.rhythm, ZERO_RHYTHM))) fail('Invalid movement recipe');
      if (value.branch === 'music' && value.gait !== baseGait(value.recipe, value.care)) fail('Invalid music recipe');
    } else if (!value.parentId || value.parentId === value.rootId || value.parentId === value.id || value.gait !== (value.recipe === 'counterstep-flower' ? 'counterstep' : 'dance')) fail('Invalid remix recipe');
  }
  if (value.rootId !== rootFor(value) || value.id !== idFor(value)) fail('Creation checksum does not match');
  return value;
}
function checkedCreation(value, shareOnly = false) {
  exactObject(value, [...PAYLOAD_KEYS, 'traits', 'source'], 'creation result');
  enumValue(value.source, SOURCES, 'source');
  rhythmValue(value.rhythm);
  const payload = orderedPayload(value);
  validatePayload(payload, shareOnly);
  exactObject(value.traits, TRAIT_KEYS, 'traits');
  const traits = traitsFor(payload);
  for (const key of TRAIT_KEYS) if (value.traits[key] !== traits[key]) fail('Traits do not match recipe');
  return payload;
}

/** Reject malformed storage; callers may explicitly fall back to EMPTY_HISTORY. */
export function validateHistory(history = EMPTY_HISTORY) {
  exactObject(history, ['v', 'completed'], 'history');
  if (history.v !== 1 || !Array.isArray(history.completed) || history.completed.length > EXPERIENCE_TYPES.length) fail('Invalid history version or length');
  boundedArray(history.completed, history.completed.length, 'history');
  for (const type of history.completed) enumValue(type, EXPERIENCE_TYPES, 'experience type');
  if (new Set(history.completed).size !== history.completed.length) fail('Duplicate experience type');
  return Object.freeze({ v: 1, completed: Object.freeze(EXPERIENCE_TYPES.filter(type => history.completed.includes(type))) });
}

function gardenerExperienceCount(history) {
  return history.completed.filter(type => type !== 'rhythm-duet').length;
}

export function availableRecipes(history = EMPTY_HISTORY) {
  return Object.freeze(gardenerExperienceCount(validateHistory(history)) >= 2 ? [...RECIPES] : [RECIPES[0]]);
}

/** Intention + maker stem + fictional Gardener care create a walking artifact. */
export function createExperiment(intention, history = EMPTY_HISTORY, options = {}) {
  enumValue(intention, INTENTIONS, 'intention');
  const progress = validateHistory(history);
  optionalObject(options, ['stem', 'care', 'recipe'], 'creation options');
  const stem = Object.hasOwn(options, 'stem') ? options.stem : 'curved';
  const care = Object.hasOwn(options, 'care') ? options.care : 'sun';
  const recipe = Object.hasOwn(options, 'recipe') ? options.recipe : RECIPES[0];
  enumValue(stem, STEMS, 'stem');
  enumValue(care, CARES, 'care');
  if (!availableRecipes(progress).includes(recipe)) fail('Complete two different experience types to choose the counterstep recipe');
  const value = { v: 1, intention, stem, care, recipe, stage: 'walking', branch: 'none', gait: baseGait(recipe, care), adaptation: Math.min(3, gardenerExperienceCount(progress)), rhythm: [...ZERO_RHYTHM], parentId: null };
  value.rootId = rootFor(value);
  value.id = idFor(value);
  return freezeCreation(value, 'local', true);
}

/** One material owner choice: a gait lesson, or a real eight-step composition. */
export function developCreation(creation, branch, options = {}) {
  const payload = checkedCreation(creation);
  if (!localResults.has(creation) || creation.source !== 'local' || payload.stage !== 'walking') fail('Develop a local walking flower');
  enumValue(branch, ['movement', 'music'], 'development');
  optionalObject(options, branch === 'movement' ? ['gait'] : ['rhythm'], 'development options');
  const gait = branch === 'movement' ? (Object.hasOwn(options, 'gait') ? options.gait : payload.intention === 'wander' ? 'glide' : 'hop') : payload.gait;
  if (branch === 'movement') enumValue(gait, ['glide', 'hop'], 'movement gait');
  const defaultRhythm = payload.intention === 'wander' ? [1, 0, 0, 1, 0, 0, 1, 0] : [1, 0, 1, 0, 1, 1, 0, 0];
  const rhythm = branch === 'music' ? rhythmValue(Object.hasOwn(options, 'rhythm') ? options.rhythm : defaultRhythm, true) : [...ZERO_RHYTHM];
  const value = { ...payload, stage: 'finished', branch, gait, rhythm, parentId: payload.id };
  value.id = idFor(value);
  return freezeCreation(value, 'local', true);
}

/** Call on Perform, not when toggling the editor. Original never changes. */
export function contributeRhythm(creation, steps) {
  const payload = checkedCreation(creation, true);
  const rhythm = rhythmValue(steps, true);
  if (sameRhythm(rhythm, payload.rhythm)) fail('Choose a rhythm different from the original');
  const value = { ...payload, stage: 'remix', gait: payload.recipe === 'counterstep-flower' ? 'counterstep' : 'dance', rhythm, parentId: payload.id };
  value.id = idFor(value);
  return freezeCreation(value, 'remix', true);
}

/** Imported snapshots do not count. Only locally performed experience types do. */
export function completeExperience(history, creation) {
  const progress = validateHistory(history);
  checkedCreation(creation);
  if (!localResults.has(creation) || creation.source === 'shared') return progress;
  const type = creation.stage === 'walking' ? 'grow-walk' : creation.stage === 'remix' ? 'rhythm-duet' : creation.branch === 'movement' ? 'teach-step' : 'compose-beat';
  if (progress.completed.includes(type)) return progress;
  return validateHistory({ v: 1, completed: [...progress.completed, type] });
}

function toBase64Url(text) { return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

/** Returns payload only; the caller may add its fixed #flower= fragment prefix. */
export function encodeCreation(creation) {
  const payload = checkedCreation(creation, true);
  const result = toBase64Url(JSON.stringify(payload));
  if (result.length > MAX_CREATION_PAYLOAD_LENGTH) fail('Creation payload is too large');
  return result;
}

/** Canonical base64url + canonical ASCII JSON; unknown/duplicate fields fail. */
export function decodeCreation(encoded) {
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > MAX_CREATION_PAYLOAD_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) fail('Invalid creation payload');
  let raw, parsed;
  try {
    raw = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    if (!/^[\x20-\x7e]+$/.test(raw)) fail('Invalid creation encoding');
    parsed = JSON.parse(raw);
  } catch { fail('Invalid creation encoding'); }
  validatePayload(parsed, true);
  const canonical = orderedPayload(parsed);
  if (JSON.stringify(canonical) !== raw || toBase64Url(raw) !== encoded) fail('Creation payload must be canonical');
  return freezeCreation(canonical, 'shared');
}
