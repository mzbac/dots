/**
 * A bounded, opt-in local rehearsal. This is a deterministic game policy, not
 * an agent, a visitor, or a background simulation. The project engine remains
 * the only authority for legal contributions, receipts and relationship credit.
 * Turn preferences are deliberately outside the v1/v2 share and save schemas.
 */
import {
  applyContribution, availableGroupGaits, encodeGroupShare,
  recordGroupExperience, validateGroupHistory, EMPTY_GROUP_HISTORY,
  GROUP_EXPERIENCE_TYPES,
} from './group-project-engine.js';

export const MAX_CAST_EVENTS = 3;
export const CAST_INTENTIONS = Object.freeze(['wander', 'delight']);
export const CAST_APPROACHES = Object.freeze(['cautious', 'experimental']);
const ROLES = ['movement', 'rhythm', 'harmony'];
const TITLES = { 'walking-flower': 'A walking parade', 'rhythm-garden': 'A rhythm garden', 'harmony-garden': 'A harmony garden' };

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function sameAction(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function changes(project, action) {
  if (project.contributions.some(record => sameAction(record.action, action))) return false;
  if (action.type === 'movement') return project.gait !== action.gait;
  if (action.type === 'rhythm') return project.rhythm.some((bit, i) => bit !== action.rhythm[i]);
  return project.harmony !== action.harmony || project.timbre !== action.timbre;
}

function candidates(project, participant, role, history, intention, approach) {
  const playful = intention === 'delight', adventurous = approach === 'experimental';
  if (role === 'movement') {
    const legal = availableGroupGaits(history, project, participant.id);
    const preferred = adventurous ? ['counterstep', 'hop', 'sway', 'glide']
      : playful ? ['sway', 'hop', 'glide', 'counterstep'] : ['glide', 'sway', 'hop', 'counterstep'];
    return preferred.filter(gait => legal.includes(gait)).map(gait => ({ type: role, gait }));
  }
  if (role === 'rhythm') {
    const patterns = [];
    // A cautious cast refines a familiar rhythm by one beat. A new flower gets
    // a regular pulse first; an experimental cast tries syncopated combinations.
    if (!adventurous && project.rhythm.some(Boolean)) {
      for (const index of playful ? [3, 7, 1, 5, 2, 6, 0, 4] : [6, 2, 4, 0, 7, 3, 5, 1]) {
        const next = [...project.rhythm]; next[index] = next[index] ? 0 : 1;
        if (next.some(Boolean)) patterns.push(next);
      }
    }
    const first = adventurous
      ? (playful ? [1, 1, 0, 1, 0, 0, 1, 0] : [1, 0, 0, 1, 0, 1, 0, 0])
      : (playful ? [1, 0, 1, 0, 1, 0, 1, 0] : [1, 0, 0, 0, 1, 0, 0, 0]);
    for (let offset = 0; offset < 8; offset++) patterns.push(first.map((_, i) => first[(i + offset) % 8]));
    return patterns.map(rhythm => ({ type: role, rhythm }));
  }
  const harmonies = adventurous ? (playful ? ['meadow', 'moonlight', 'sunrise'] : ['moonlight', 'meadow', 'sunrise'])
    : (playful ? ['sunrise', 'meadow', 'moonlight'] : ['meadow', 'sunrise', 'moonlight']);
  // Preserve a known harmony while refining its voice, rather than replacing
  // both ingredients. These remain preferences, never unlocks or engine writes.
  if (!adventurous && project.harmony !== 'none') harmonies.unshift(project.harmony);
  const timbres = adventurous ? ['glass', 'bell', 'wood'] : playful ? ['bell', 'wood', 'glass'] : ['wood', 'bell', 'glass'];
  return [...new Set(harmonies)].flatMap(harmony => timbres.map(timbre => ({ type: role, harmony, timbre })));
}

function describe(before, after, participant, action, approach) {
  const detail = action.type === 'movement' ? `${before.gait} → ${after.gait}`
    : action.type === 'rhythm' ? `${before.rhythm.join('')} → ${after.rhythm.join('')}`
      : `${before.harmony} / ${before.timbre} → ${after.harmony} / ${after.timbre}`;
  const reason = action.type === 'movement' && action.gait === 'counterstep'
    ? 'Two different shared experiences made counterstep legal.'
    : approach === 'cautious' ? 'A familiar shape, refined one part at a time.' : 'An unfamiliar combination to try together.';
  return { participantId: participant.id, name: participant.name, role: action.type, action,
    beforeId: before.id, afterId: after.id, summary: `${participant.name}: ${detail}`, reason };
}

function relationshipChanges(before, after, project) {
  return after.pairs.filter(pair => pair.scope === project.rootId).flatMap(pair => {
    const old = before.pairs.find(item => item.scope === pair.scope && item.a === pair.a && item.b === pair.b);
    const from = old?.completed.length ?? 0, to = pair.completed.length;
    if (from === to) return [];
    return [{ a: pair.a, b: pair.b, from, to, experienceType: project.experienceType,
      names: [pair.a, pair.b].map(id => project.participants.find(person => person.id === id)?.name ?? 'A project participant'),
      unlocks: from < 2 && to >= 2 ? ['counterstep'] : [] }];
  });
}

/** Suggestions do not start or award a chapter. The user still chooses. */
export function nextCastChoice(project, history = EMPTY_GROUP_HISTORY) {
  const progress = validateGroupHistory(history);
  encodeGroupShare(project);
  const pairs = progress.pairs.filter(pair => pair.scope === project.rootId &&
    project.participants.some(person => person.id === pair.a) && project.participants.some(person => person.id === pair.b));
  const types = GROUP_EXPERIENCE_TYPES.filter(type => type !== project.experienceType);
  const experienceType = types.find(type => pairs.some(pair => !pair.completed.includes(type))) ?? types[0];
  return freeze({ type: 'linked-chapter', experienceType, label: TITLES[experienceType],
    reason: pairs.some(pair => !pair.completed.includes(experienceType))
      ? 'A different completed experience can help this group learn a new step.'
      : 'Try another kind of performance. Repeating a familiar experience adds no relationship progress.' });
}

/**
 * Make up to three chapter contributions, including earlier manual/imported
 * contributions in that budget. Never act for local/shared participant claims.
 * Calling again on the returned project cannot replay a spent chapter budget.
 */
export function runLocalCastTurn(project, { intention = 'wander', approach = 'cautious', history = EMPTY_GROUP_HISTORY } = {}) {
  encodeGroupShare(project);
  if (!CAST_INTENTIONS.includes(intention) || !CAST_APPROACHES.includes(approach)) throw new TypeError('Choose a local cast direction and approach');
  const beforeHistory = validateGroupHistory(history);
  let next = project, nextHistory = beforeHistory, notebookFull = false;
  const events = [], used = new Set();
  const budget = Math.max(0, MAX_CAST_EVENTS - project.contributions.length);
  while (events.length < budget) {
    let selected;
    const contributed = new Set(next.contributions.map(record => record.participantId));
    const cast = next.participants.filter(person => person.kind === 'npc' && !used.has(person.id))
      .sort((a, b) => Number(contributed.has(a.id)) - Number(contributed.has(b.id)));
    const roles = [...next.progress.neededRoles, ...ROLES.filter(role => !next.progress.neededRoles.includes(role))];
    for (const role of roles) {
      for (const participant of cast.filter(person => person.role === role || person.role === 'guest')) {
        const action = candidates(next, participant, role, nextHistory, intention, approach).find(candidate => changes(next, candidate));
        if (action) { selected = { participant, action }; break; }
      }
      if (selected) break;
    }
    if (!selected) break;
    const { participant, action } = selected;
    // Apply first; narrative and notebook are derived only from accepted work.
    const changed = applyContribution(next, participant.id, action, nextHistory);
    events.push(describe(next, changed, participant, action, approach));
    used.add(participant.id); next = changed;
    try { nextHistory = recordGroupExperience(nextHistory, next); }
    catch (error) { if (String(error.message).includes('notebook is full')) notebookFull = true; else throw error; }
  }
  const relationships = relationshipChanges(beforeHistory, nextHistory, next);
  const stopReason = next.contributions.length >= MAX_CAST_EVENTS ? 'chapter-budget'
    : events.length ? 'cast-finished' : 'no-legal-cast-action';
  return freeze({ project: next, history: nextHistory, intention, approach, events,
    relationshipChange: { pairs: relationships, notebookFull, newProgress: relationships.length > 0 },
    nextChoice: nextCastChoice(next, nextHistory), stopReason,
    remainingEvents: Math.max(0, MAX_CAST_EVENTS - next.contributions.length) });
}
