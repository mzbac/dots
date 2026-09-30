/**
 * Immutable, local-only group flower projects. Participants are unverified game
 * characters, never authenticated people. IDs exist only inside a project lineage.
 * A checksum detects accidental changes; it is not a signature or permission.
 *
 * API: createGroupProject({ title?, experienceType?, participants?, seed? });
 * addParticipant(project, { name, role, kind? });
 * applyContribution(project, participantId, { type:'movement', gait }, history?);
 * applyContribution(project, participantId, { type:'rhythm', rhythm:[eight bits] });
 * applyContribution(project, participantId, { type:'harmony', harmony, timbre });
 * forkGroupProject(project, { title?, experienceType?, participants? });
 * versionAt(project, contributionCount); encodeGroupShare/decodeGroupShare;
 * upgradeV1Project(creation, options?); recordGroupExperience(history, project).
 *
 * 16 participants / 32 records are per-snapshot resource budgets. Fork a linked
 * project (optionally with a fresh roster) to continue. No network or accounts.
 */
import { encodeCreation, decodeCreation, validateHistory, completeExperience, EMPTY_HISTORY } from './experiment-engine.js';

export const MAX_GROUP_PARTICIPANTS = 16;
export const MAX_GROUP_CONTRIBUTIONS = 32;
export const MAX_GROUP_PAYLOAD_LENGTH = 16384;
export const MAX_GROUP_HISTORY_PAIRS = 256;
export const GROUP_ROLES = Object.freeze(['movement', 'rhythm', 'harmony', 'guest']);
export const GROUP_EXPERIENCE_TYPES = Object.freeze(['walking-flower', 'rhythm-garden', 'harmony-garden']);
export const GROUP_GAITS = Object.freeze(['glide', 'hop', 'sway', 'counterstep']);
export const GROUP_HARMONIES = Object.freeze(['sunrise', 'moonlight', 'meadow']);
export const GROUP_TIMBRES = Object.freeze(['bell', 'wood', 'glass']);
export const EMPTY_GROUP_HISTORY = Object.freeze({ v: 2, pairs: Object.freeze([]) });
const LEGACY_TYPES = ['grow-walk', 'teach-step', 'compose-beat', 'rhythm-duet'];
const TYPES = ['movement', 'rhythm', 'harmony'];
const KINDS = ['local', 'npc', 'shared'];
const ALL_GAITS = ['stroll', 'dance', ...GROUP_GAITS];
const PAYLOAD_KEYS = ['v', 'id', 'rootId', 'parentId', 'generation', 'seed', 'title', 'experienceType', 'participants', 'base', 'contributions'];
const BASE_KEYS = ['gait', 'rhythm', 'harmony', 'timbre', 'petals', 'hue', 'stem', 'care', 'intention', 'recipe', 'legacyId'];
const RESULT_KEYS = [...PAYLOAD_KEYS, 'source', 'gait', 'rhythm', 'harmony', 'timbre', 'traits', 'progress', 'completed'];
const TRAIT_KEYS = ['petals', 'hue', 'stride', 'speed', 'bounce', 'tempo', 'harmonyNotes', 'timbre'];
const PROGRESS_KEYS = ['contributions', 'contributors', 'roles', 'neededRoles', 'percent'];
const HASH = /^[0-9a-f]{16}$/;
const PARTICIPANT_ID = /^p[0-9a-f]{16}$/;
// Unforgeable local receipts: copying/decoding a JSON object never imports credit.
const receipts = new WeakMap();

function fail(message) { throw new TypeError(message); }
function object(value, keys, label, optional = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`Invalid ${label}`);
  const own = Reflect.ownKeys(value);
  if ((!optional && own.length !== keys.length) || own.some(key => typeof key !== 'string' || !keys.includes(key))) fail(`Invalid ${label} fields`);
  for (const key of own) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail(`Invalid ${label} field`);
  }
}
function array(value, max, label, exact = false) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max || (exact && value.length !== max)) fail(`Invalid ${label}`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))) fail(`Invalid ${label} fields`);
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail(`Invalid ${label} element`);
  }
}
function choice(value, choices, label) { if (!choices.includes(value)) fail(`Invalid ${label}`); return value; }
function integer(value, min, max, label) { if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max) fail(`Invalid ${label}`); return value; }
function plainText(value, max, label) {
  if (typeof value !== 'string' || value.length > max || !/^[\p{L}\p{N}][\p{L}\p{N} '\-]*$/u.test(value) || value.trim() !== value) fail(`${label} must be plain text, up to ${max} characters, without URLs or code`);
  return value;
}
function rhythm(value, needsBeat = false) {
  array(value, 8, 'rhythm', true);
  if (value.some(bit => (bit !== 0 && bit !== 1) || Object.is(bit, -0)) || (needsBeat && !value.some(Boolean))) fail('Choose eight binary steps with at least one beat');
  return [...value];
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}
function hash(value) {
  let result = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(JSON.stringify(value))) result = BigInt.asUintN(64, (result ^ BigInt(byte)) * 0x100000001b3n);
  return result.toString(16).padStart(16, '0');
}
function orderedBase(value) { return Object.fromEntries(BASE_KEYS.map(key => [key, key === 'rhythm' ? [...value.rhythm] : value[key]])); }
function orderedParticipant(value) { return { id: value.id, name: value.name, role: value.role, kind: value.kind, unverified: true }; }
function orderedAction(value) {
  if (value.type === 'movement') return { type: 'movement', gait: value.gait };
  if (value.type === 'rhythm') return { type: 'rhythm', rhythm: [...value.rhythm] };
  return { type: 'harmony', harmony: value.harmony, timbre: value.timbre };
}
function orderedRecord(value) { return { id: value.id, participantId: value.participantId, action: orderedAction(value.action) }; }
function ordered(value) {
  return { v: 2, id: value.id, rootId: value.rootId, parentId: value.parentId, generation: value.generation, seed: value.seed, title: value.title, experienceType: value.experienceType,
    participants: value.participants.map(orderedParticipant), base: orderedBase(value.base), contributions: value.contributions.map(orderedRecord) };
}
function idFor(value) { return hash(ordered({ ...value, id: '' })); }
function rootFor(seed) { return hash({ v: 2, seed }); }
function validateBase(value) {
  object(value, BASE_KEYS, 'base');
  choice(value.gait, ALL_GAITS, 'base gait'); rhythm(value.rhythm);
  choice(value.harmony, ['none', ...GROUP_HARMONIES], 'base harmony');
  choice(value.timbre, ['soft', ...GROUP_TIMBRES], 'base timbre');
  if ((value.harmony === 'none') !== (value.timbre === 'soft')) fail('Invalid base sound');
  integer(value.petals, 3, 16, 'base petals'); integer(value.hue, 0, 359, 'base hue');
  choice(value.stem, ['curved', 'straight'], 'stem'); choice(value.care, ['sun', 'rain'], 'care');
  choice(value.intention, ['wander', 'delight'], 'intention'); choice(value.recipe, ['walking-flower', 'counterstep-flower'], 'recipe');
  if (value.legacyId !== null && (typeof value.legacyId !== 'string' || !HASH.test(value.legacyId))) fail('Invalid legacy reference');
}
function validateParticipants(value) {
  array(value, MAX_GROUP_PARTICIPANTS, 'participants');
  const ids = new Set();
  for (const participant of value) {
    object(participant, ['id', 'name', 'role', 'kind', 'unverified'], 'participant');
    if (typeof participant.id !== 'string' || !PARTICIPANT_ID.test(participant.id) || ids.has(participant.id)) fail('Duplicate or invalid participant ID');
    ids.add(participant.id); plainText(participant.name, 24, 'Name');
    choice(participant.role, GROUP_ROLES, 'role'); choice(participant.kind, KINDS, 'participant kind');
    if (participant.unverified !== true) fail('Participant names must remain explicitly unverified');
  }
}
function validateAction(value) {
  object(value, ['type', 'gait', 'rhythm', 'harmony', 'timbre'], 'action', true);
  choice(value.type, TYPES, 'action type');
  if (value.type === 'movement') { object(value, ['type', 'gait'], 'movement'); choice(value.gait, GROUP_GAITS, 'gait'); }
  else if (value.type === 'rhythm') { object(value, ['type', 'rhythm'], 'rhythm action'); rhythm(value.rhythm, true); }
  else { object(value, ['type', 'harmony', 'timbre'], 'harmony action'); choice(value.harmony, GROUP_HARMONIES, 'harmony'); choice(value.timbre, GROUP_TIMBRES, 'timbre'); }
}
function actionKey(action) { return JSON.stringify(orderedAction(action)); }
function applyToArt(art, action) {
  if (action.type === 'movement') art.gait = action.gait;
  else if (action.type === 'rhythm') art.rhythm = [...action.rhythm];
  else { art.harmony = action.harmony; art.timbre = action.timbre; }
}
function isNoop(art, action) {
  if (action.type === 'movement') return art.gait === action.gait;
  if (action.type === 'rhythm') return art.rhythm.every((bit, i) => bit === action.rhythm[i]);
  return art.harmony === action.harmony && art.timbre === action.timbre;
}
function validatePayload(value) {
  object(value, PAYLOAD_KEYS, 'group project');
  if (value.v !== 2) fail('Unsupported group version');
  for (const key of ['id', 'rootId']) if (typeof value[key] !== 'string' || !HASH.test(value[key])) fail('Invalid project ID');
  if (value.parentId !== null && (typeof value.parentId !== 'string' || !HASH.test(value.parentId) || value.parentId === value.id)) fail('Invalid parent snapshot');
  integer(value.generation, 0, Number.MAX_SAFE_INTEGER, 'generation');
  if (typeof value.seed !== 'string' || !/^[A-Za-z0-9-]{1,48}$/.test(value.seed)) fail('Invalid project seed');
  if (rootFor(value.seed) !== value.rootId) fail('Project root does not match');
  if (value.generation > 0 && value.parentId === null) fail('Linked projects need a parent snapshot');
  plainText(value.title, 48, 'Title'); choice(value.experienceType, GROUP_EXPERIENCE_TYPES, 'experience type');
  validateParticipants(value.participants); validateBase(value.base);
  array(value.contributions, MAX_GROUP_CONTRIBUTIONS, 'contributions');
  const seen = new Set(), art = orderedBase(value.base);
  for (const record of value.contributions) {
    object(record, ['id', 'participantId', 'action'], 'contribution'); validateAction(record.action);
    const participant = value.participants.find(item => item.id === record.participantId);
    if (!participant || (participant.role !== 'guest' && participant.role !== record.action.type)) fail('Contribution does not match participant role');
    if (record.id !== hash({ rootId: value.rootId, participantId: record.participantId, action: orderedAction(record.action) })) fail('Contribution checksum does not match');
    const key = actionKey(record.action);
    if (seen.has(key) || isNoop(art, record.action)) fail('Duplicate or no-op contribution');
    seen.add(key); applyToArt(art, record.action);
  }
  if (value.id !== idFor(value)) fail('Project checksum does not match');
  return value;
}
function derived(value) {
  const art = orderedBase(value.base);
  for (const record of value.contributions) applyToArt(art, record.action);
  const roles = TYPES.filter(type => value.contributions.some(record => record.action.type === type));
  const contributors = new Set(value.contributions.map(record => record.participantId)).size;
  const completed = roles.length === 3 && contributors >= 3;
  const harmonyIndex = GROUP_HARMONIES.indexOf(art.harmony);
  const beats = art.rhythm.reduce((sum, beat) => sum + beat, 0);
  const theme = GROUP_EXPERIENCE_TYPES.indexOf(value.experienceType);
  return {
    gait: art.gait, rhythm: art.rhythm, harmony: art.harmony, timbre: art.timbre,
    traits: {
      petals: Math.min(16, art.petals + (harmonyIndex < 0 ? 0 : harmonyIndex + 1) + theme),
      hue: (art.hue + (harmonyIndex < 0 ? 0 : [16, 174, 86][harmonyIndex]) + theme * 24) % 360,
      stride: art.gait === 'glide' ? 0.72 : art.gait === 'counterstep' ? 0.58 : art.gait === 'hop' ? 0.38 : 0.32,
      speed: (art.intention === 'delight' ? 0.9 : 0.7) + beats * 0.035 + (art.gait === 'counterstep' ? 0.16 : 0),
      bounce: art.gait === 'hop' ? 0.26 : art.gait === 'counterstep' ? 0.17 : art.gait === 'sway' ? 0.09 : 0.04,
      tempo: (art.intention === 'delight' ? 112 : 88) + beats * 2 + theme * 6,
      harmonyNotes: harmonyIndex < 0 ? [0] : [[0, 4, 7], [0, 3, 7], [0, 5, 9]][harmonyIndex], timbre: art.timbre,
    },
    progress: { contributions: value.contributions.length, contributors, roles, neededRoles: TYPES.filter(type => !roles.includes(type)), percent: Math.floor(100 * (roles.length + Math.min(3, contributors)) / 6) },
    completed,
  };
}
function result(value, source, localRecords = []) {
  const payload = ordered(value); const project = freeze({ ...payload, source, ...derived(payload) });
  if (localRecords.length) receipts.set(project, Object.freeze([...localRecords]));
  return project;
}
function checked(project) {
  object(project, RESULT_KEYS, 'project result');
  choice(project.source, ['local', 'shared', 'copy', 'replay', 'legacy'], 'source');
  // Validate all descriptors before canonical copying can read user properties.
  validateParticipants(project.participants); validateBase(project.base);
  array(project.contributions, MAX_GROUP_CONTRIBUTIONS, 'contributions');
  for (const record of project.contributions) { object(record, ['id', 'participantId', 'action'], 'contribution'); validateAction(record.action); }
  const payload = ordered(project); validatePayload(payload);
  const expected = derived(payload);
  rhythm(project.rhythm); object(project.traits, TRAIT_KEYS, 'traits'); array(project.traits.harmonyNotes, 3, 'harmony notes');
  object(project.progress, PROGRESS_KEYS, 'progress'); array(project.progress.roles, 3, 'roles'); array(project.progress.neededRoles, 3, 'needed roles');
  function matches(actual, wanted) {
    if (Array.isArray(wanted)) return Array.isArray(actual) && actual.length === wanted.length && wanted.every((item, index) => matches(actual[index], item));
    if (wanted && typeof wanted === 'object') return Object.keys(wanted).every(key => matches(actual[key], wanted[key]));
    return actual === wanted;
  }
  for (const key of ['gait', 'rhythm', 'harmony', 'timbre', 'traits', 'progress', 'completed']) if (!matches(project[key], expected[key])) fail('Derived project state does not match contributions');
  return payload;
}
function newParticipant(input, context, index) {
  object(input, ['name', 'role', 'kind'], 'new participant', true);
  plainText(input.name, 24, 'Name'); choice(input.role, GROUP_ROLES, 'role');
  const kind = input.kind ?? 'local'; choice(kind, KINDS, 'participant kind');
  return { id: `p${hash({ context, index, name: input.name, role: input.role, kind })}`, name: input.name, role: input.role, kind, unverified: true };
}
function roster(inputs, context) {
  array(inputs, MAX_GROUP_PARTICIPANTS, 'new participants');
  return inputs.map((input, index) => newParticipant(input, context, index));
}
function defaults() { return [{ name: 'Clover', role: 'movement', kind: 'npc' }, { name: 'Pip', role: 'rhythm', kind: 'npc' }, { name: 'Luma', role: 'harmony', kind: 'npc' }]; }
function seed() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Non-secret local namespace, not an authentication/security token.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function seal(value, source, localRecords = []) { value.id = idFor(value); validatePayload(value); return result(value, source, localRecords); }

/** Start a project with three example characters, or any supplied bounded roster. */
export function createGroupProject(options = {}) {
  object(options, ['title', 'experienceType', 'participants', 'seed'], 'project options', true);
  const projectSeed = options.seed ?? seed();
  if (typeof projectSeed !== 'string' || !/^[A-Za-z0-9-]{1,48}$/.test(projectSeed)) fail('Invalid project seed');
  const title = plainText(options.title ?? 'A flower for the neighborhood', 48, 'Title');
  const experienceType = choice(options.experienceType ?? 'walking-flower', GROUP_EXPERIENCE_TYPES, 'experience type');
  const rootId = rootFor(projectSeed);
  return seal({ v: 2, id: '', rootId, parentId: null, generation: 0, seed: projectSeed,
    title, experienceType,
    participants: roster(options.participants ?? defaults(), rootId),
    base: { gait: 'stroll', rhythm: [0, 0, 0, 0, 0, 0, 0, 0], harmony: 'none', timbre: 'soft', petals: 5, hue: 44, stem: 'curved', care: 'sun', intention: 'wander', recipe: 'walking-flower', legacyId: null }, contributions: [] }, 'local');
}

export function addParticipant(project, participant) {
  const value = checked(project);
  if (value.participants.length >= MAX_GROUP_PARTICIPANTS) fail('This snapshot has 16 participants. Archive it and start a linked project with a fresh roster to welcome more dots');
  const next = newParticipant(participant, value.id, value.participants.length);
  return seal({ ...value, parentId: value.id, participants: [...value.participants, next] }, 'copy', receipts.get(project));
}

/** Append only material, role-legal work. Existing snapshots never change. */
export function applyContribution(project, participantId, action, history = EMPTY_GROUP_HISTORY) {
  const value = checked(project); validateAction(action);
  const participant = value.participants.find(item => item.id === participantId);
  if (!participant || (participant.role !== 'guest' && participant.role !== action.type)) fail('Choose a participant with the matching role');
  if (value.contributions.length >= MAX_GROUP_CONTRIBUTIONS) fail('This snapshot has 32 contributions. Archive it and continue in a linked project');
  if (action.type === 'movement' && action.gait === 'counterstep' && !availableGroupGaits(history, project, participantId).includes('counterstep')) fail('This participant learns counterstep after two distinct completed experiences with a local partner');
  const art = derived(value), key = actionKey(action);
  if (isNoop(art, action) || value.contributions.some(record => actionKey(record.action) === key)) fail('Choose a new contribution that changes the flower');
  const record = { id: hash({ rootId: value.rootId, participantId, action: orderedAction(action) }), participantId, action: orderedAction(action) };
  return seal({ ...value, parentId: value.id, contributions: [...value.contributions, record] }, 'copy', [...(receipts.get(project) ?? []), record.id]);
}

/** New linked chapter, with fresh contribution budget and optionally fresh cast. */
export function forkGroupProject(project, options = {}) {
  const value = checked(project); object(options, ['title', 'experienceType', 'participants'], 'fork options', true);
  const title = plainText(options.title ?? value.title, 48, 'Title');
  const experienceType = choice(options.experienceType ?? value.experienceType, GROUP_EXPERIENCE_TYPES, 'experience type');
  const art = derived(value);
  const generation = value.generation + 1;
  integer(generation, 1, Number.MAX_SAFE_INTEGER, 'generation');
  const context = hash({ parentId: value.id, generation });
  return seal({ ...value, parentId: value.id, generation,
    title, experienceType,
    participants: options.participants === undefined ? value.participants : roster(options.participants, context),
    base: { ...value.base, gait: art.gait, rhythm: art.rhythm, harmony: art.harmony, timbre: art.timbre }, contributions: [] }, 'copy');
}

/**
 * Reconstructed contribution-prefix preview, using the current roster. This is
 * not the historical snapshot ID or a reconstruction of past roster membership.
 * Keep the actual source share URL before editing when linking to that original.
 * A preview has no local completion receipt.
 */
export function versionAt(project, contributionCount) {
  const value = checked(project); integer(contributionCount, 0, value.contributions.length, 'version');
  if (contributionCount === value.contributions.length) return result(value, 'replay');
  return seal({ ...value, parentId: value.id, contributions: value.contributions.slice(0, contributionCount) }, 'replay');
}
export const projectAtStep = versionAt;

function toBase64Url(raw) {
  const bytes = new TextEncoder().encode(raw);
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function encodeGroupShare(project) {
  const payload = checked(project), encoded = toBase64Url(JSON.stringify(payload));
  if (encoded.length > MAX_GROUP_PAYLOAD_LENGTH) fail('Group share exceeds the snapshot budget');
  return encoded;
}
export function decodeGroupShare(encoded) {
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > MAX_GROUP_PAYLOAD_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) fail('Invalid group share');
  let raw, parsed;
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    raw = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
    parsed = JSON.parse(raw);
  } catch { fail('Invalid group encoding'); }
  validatePayload(parsed);
  const payload = ordered(parsed);
  if (JSON.stringify(payload) !== raw || toBase64Url(raw) !== encoded) fail('Group share must be canonical');
  return result(payload, 'shared');
}

/** The existing v1 codec is still authoritative. No old identity claim is added. */
export function upgradeV1Project(creation, options = {}) {
  // The v1 engine validates even an unfinished walking save. Finished v1 shares
  // continue to pass through their original codec without any schema changes.
  completeExperience(EMPTY_HISTORY, creation);
  const legacy = creation.stage === 'walking' ? creation : decodeCreation(encodeCreation(creation));
  const initial = createGroupProject(options), value = checked(initial);
  return seal({ ...value, parentId: legacy.id,
    base: { gait: legacy.gait, rhythm: [...legacy.rhythm], harmony: 'none', timbre: 'soft', petals: legacy.traits.petals, hue: legacy.traits.hue, stem: legacy.stem, care: legacy.care, intention: legacy.intention, recipe: legacy.recipe, legacyId: legacy.id } }, 'legacy');
}

function pairOrder(a, b) { return [a, b].sort(); }
export function validateGroupHistory(history = EMPTY_GROUP_HISTORY) {
  object(history, ['v', 'pairs'], 'group history');
  if (history.v !== 2) fail('Invalid group history version');
  array(history.pairs, MAX_GROUP_HISTORY_PAIRS, 'relationship pairs');
  const seen = new Set(), pairs = [];
  for (const pair of history.pairs) {
    object(pair, ['scope', 'a', 'b', 'completed'], 'relationship');
    const legacy = pair.scope === 'legacy-v1';
    if (!legacy && (typeof pair.scope !== 'string' || !HASH.test(pair.scope))) fail('Invalid relationship scope');
    const ids = legacy ? ['legacy-player', 'legacy-gardener', 'legacy-guest'] : null;
    if (typeof pair.a !== 'string' || typeof pair.b !== 'string' || pair.a >= pair.b || (legacy ? (!ids.includes(pair.a) || !ids.includes(pair.b)) : (!PARTICIPANT_ID.test(pair.a) || !PARTICIPANT_ID.test(pair.b)))) fail('Invalid relationship participants');
    const types = legacy ? LEGACY_TYPES : GROUP_EXPERIENCE_TYPES;
    array(pair.completed, types.length, 'completed experiences');
    if (!pair.completed.length || new Set(pair.completed).size !== pair.completed.length) fail('Invalid completed experiences');
    for (const type of pair.completed) choice(type, types, 'completed experience');
    if (legacy && (pair.a === 'legacy-gardener' ? pair.b !== 'legacy-player' || pair.completed.includes('rhythm-duet') : pair.a !== 'legacy-guest' || pair.b !== 'legacy-player' || pair.completed.some(type => type !== 'rhythm-duet'))) fail('Invalid legacy relationship');
    const key = `${pair.scope}:${pair.a}:${pair.b}`;
    if (seen.has(key)) fail('Duplicate relationship pair'); seen.add(key);
    pairs.push({ scope: pair.scope, a: pair.a, b: pair.b, completed: types.filter(type => pair.completed.includes(type)) });
  }
  pairs.sort((a, b) => `${a.scope}:${a.a}:${a.b}`.localeCompare(`${b.scope}:${b.a}:${b.b}`));
  return freeze({ v: 2, pairs });
}

/** Import only old local notebook semantics, isolated from new project rosters. */
export function migrateLegacyHistory(history) {
  const legacy = validateHistory(history), pairs = [];
  const gardener = legacy.completed.filter(type => type !== 'rhythm-duet');
  if (gardener.length) pairs.push({ scope: 'legacy-v1', a: 'legacy-gardener', b: 'legacy-player', completed: gardener });
  if (legacy.completed.includes('rhythm-duet')) pairs.push({ scope: 'legacy-v1', a: 'legacy-guest', b: 'legacy-player', completed: ['rhythm-duet'] });
  return validateGroupHistory({ v: 2, pairs });
}

/**
 * Imports alone earn nothing. A meaningful locally performed action on a
 * completed project records only pairs touching a local contributor. The other
 * side may be an unverified imported contributor, enabling asynchronous play;
 * imported-only pairs between other characters never receive local credit.
 */
export function recordGroupExperience(history, project) {
  const progress = validateGroupHistory(history), value = checked(project);
  if (!project.completed) return progress;
  const localIds = new Set(receipts.get(project) ?? []);
  const localRecords = value.contributions.filter(record => localIds.has(record.id));
  const localParticipants = new Set(localRecords.map(record => record.participantId));
  if (!localParticipants.size) return progress;
  const participants = [...new Set(value.contributions.map(record => record.participantId))];
  const pairs = progress.pairs.map(pair => ({ ...pair, completed: [...pair.completed] }));
  for (let i = 0; i < participants.length; i++) for (let j = i + 1; j < participants.length; j++) {
    if (!localParticipants.has(participants[i]) && !localParticipants.has(participants[j])) continue;
    const [a, b] = pairOrder(participants[i], participants[j]);
    const pair = pairs.find(item => item.scope === value.rootId && item.a === a && item.b === b);
    if (pair) { if (!pair.completed.includes(value.experienceType)) pair.completed.push(value.experienceType); }
    else {
      if (pairs.length >= MAX_GROUP_HISTORY_PAIRS) fail('Local relationship notebook is full. Archive it before recording more pairs');
      pairs.push({ scope: value.rootId, a, b, completed: [value.experienceType] });
    }
  }
  return validateGroupHistory({ v: 2, pairs });
}

export function relationshipFor(history, project, participantA, participantB) {
  const progress = validateGroupHistory(history), value = checked(project);
  if (participantA === participantB || !value.participants.some(item => item.id === participantA) || !value.participants.some(item => item.id === participantB)) fail('Choose two different project participants');
  const [a, b] = pairOrder(participantA, participantB);
  const completed = progress.pairs.find(pair => pair.scope === value.rootId && pair.a === a && pair.b === b)?.completed ?? [];
  return freeze({ completed: [...completed], count: completed.length, level: completed.length >= 2 ? 'in-sync' : completed.length ? 'familiar' : 'new', unlocks: completed.length >= 2 ? ['counterstep'] : [] });
}

export function availableGroupGaits(history, project, participantId) {
  const progress = validateGroupHistory(history), value = checked(project);
  if (!value.participants.some(item => item.id === participantId)) fail('Unknown project participant');
  const learned = progress.pairs.some(pair => pair.scope === value.rootId && (pair.a === participantId || pair.b === participantId) && pair.completed.length >= 2);
  return Object.freeze(GROUP_GAITS.filter(gait => gait !== 'counterstep' || learned));
}
