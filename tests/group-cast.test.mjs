import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGroupProject, applyContribution, forkGroupProject, encodeGroupShare,
  decodeGroupShare, EMPTY_GROUP_HISTORY, availableGroupGaits, recordGroupExperience,
} from '../src/group-project-engine.js';
import { runLocalCastTurn, nextCastChoice } from '../src/group-cast.js';

const fresh = () => createGroupProject({ seed: 'cast-policy-test' });
const art = project => [project.gait, project.rhythm, project.harmony, project.timbre];

test('same direction, contrasting approaches produce different legal visible artifacts immediately', () => {
  for (const intention of ['wander', 'delight']) {
    const project = fresh(), source = encodeGroupShare(project);
    const cautious = runLocalCastTurn(project, { intention, approach: 'cautious' });
    const experimental = runLocalCastTurn(project, { intention, approach: 'experimental' });
    assert.notDeepEqual(art(cautious.project), art(experimental.project));
    assert.notDeepEqual(cautious.project.rhythm, experimental.project.rhythm);
    assert.notEqual(cautious.project.gait, experimental.project.gait);
    for (const result of [cautious, experimental]) {
      assert.equal(result.events.length, 3);
      assert.equal(result.project.completed, true);
      assert.equal(result.remainingEvents, 0);
      assert.equal(result.stopReason, 'chapter-budget');
      assert.equal(result.relationshipChange.pairs.length, 3);
      assert.equal(result.relationshipChange.newProgress, true);
      assert.equal(result.nextChoice.experienceType, 'rhythm-garden');
      assert.deepEqual(result.project.base, project.base);
      assert.equal(decodeGroupShare(encodeGroupShare(result.project)).id, result.project.id);
      let replay = project;
      result.events.forEach(event => {
        assert.equal(event.beforeId, replay.id);
        replay = applyContribution(replay, event.participantId, event.action);
        assert.equal(event.afterId, replay.id);
      });
      assert.equal(replay.id, result.project.id);
      assert.ok(Object.isFrozen(result) && Object.isFrozen(result.events));
      assert.ok(Object.isFrozen(result.relationshipChange.pairs));
    }
    assert.equal(encodeGroupShare(project), source);
  }
});

test('intention governs the details without mutating legacy base metadata or consuming time', () => {
  const project = fresh();
  for (const approach of ['cautious', 'experimental']) {
    const wander = runLocalCastTurn(project, { intention: 'wander', approach });
    const delight = runLocalCastTurn(project, { intention: 'delight', approach });
    assert.notDeepEqual(art(wander.project), art(delight.project));
    assert.deepEqual(runLocalCastTurn(project, { intention: 'wander', approach }), wander);
  }
  assert.equal(project.contributions.length, 0);
});

test('shared history changes future legal policy choice, and repeated types do not farm progress', () => {
  const first = runLocalCastTurn(fresh());
  const sameType = runLocalCastTurn(forkGroupProject(first.project), { history: first.history });
  assert.equal(sameType.events.length, 3);
  assert.equal(sameType.relationshipChange.newProgress, false);
  assert.deepEqual(sameType.history, first.history);
  const second = runLocalCastTurn(forkGroupProject(first.project, { experienceType: 'rhythm-garden' }), { history: first.history });
  assert.equal(second.relationshipChange.pairs.length, 3);
  assert.ok(second.relationshipChange.pairs.every(pair => pair.from === 1 && pair.to === 2 && pair.unlocks[0] === 'counterstep'));
  const chapter = forkGroupProject(second.project, { experienceType: 'harmony-garden' });
  const unlearned = runLocalCastTurn(chapter, { approach: 'experimental' });
  const learned = runLocalCastTurn(chapter, { approach: 'experimental', history: second.history });
  assert.notEqual(unlearned.project.gait, 'counterstep');
  assert.equal(learned.project.gait, 'counterstep');
  assert.match(learned.events[0].reason, /Two different shared experiences/);
  assert.ok(availableGroupGaits(second.history, chapter, chapter.participants[0].id).includes('counterstep'));
});

test('repeated turn and reloaded share cannot exceed the chapter budget or import relationship credit', () => {
  const first = runLocalCastTurn(fresh());
  const repeated = runLocalCastTurn(first.project, { history: first.history, approach: 'experimental' });
  assert.equal(repeated.project, first.project);
  assert.deepEqual(repeated.events, []);
  assert.deepEqual(repeated.history, first.history);
  assert.equal(repeated.relationshipChange.newProgress, false);
  const imported = decodeGroupShare(encodeGroupShare(first.project));
  const loaded = runLocalCastTurn(imported);
  assert.equal(loaded.events.length, 0);
  assert.deepEqual(loaded.history, EMPTY_GROUP_HISTORY);
  assert.deepEqual(recordGroupExperience(EMPTY_GROUP_HISTORY, loaded.project), EMPTY_GROUP_HISTORY);
});

test('manual and imported contributions reduce the budget, and exact source remains immutable', () => {
  let source = fresh();
  source = applyContribution(source, source.participants[0].id, { type: 'movement', gait: 'glide' });
  const encoded = encodeGroupShare(source), imported = decodeGroupShare(encoded);
  const result = runLocalCastTurn(imported, { approach: 'experimental' });
  assert.equal(result.events.length, 2);
  assert.equal(result.project.contributions.length, 3);
  assert.equal(result.project.completed, true);
  assert.equal(encodeGroupShare(source), encoded);
  assert.equal(encodeGroupShare(imported), encoded);
  assert.equal(imported.contributions.length, 1);
  assert.equal(result.events[0].role, 'rhythm');
  assert.equal(result.events[1].role, 'harmony');
});

test('only fictional NPC roles act; neither shared nor local participant claims are impersonated', () => {
  const project = createGroupProject({ seed: 'mixed-cast', participants: [
    { name: 'Mine', role: 'movement', kind: 'local' },
    { name: 'A Visitor', role: 'rhythm', kind: 'shared' },
    { name: 'Luma', role: 'harmony', kind: 'npc' },
  ] });
  const imported = decodeGroupShare(encodeGroupShare(project));
  const result = runLocalCastTurn(imported);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].participantId, project.participants[2].id);
  assert.equal(result.project.completed, false);
  assert.equal(result.relationshipChange.newProgress, false);
  assert.deepEqual(result.history, EMPTY_GROUP_HISTORY);
  const noCast = createGroupProject({ participants: [{ name: 'Mine', role: 'guest', kind: 'local' }] });
  const stopped = runLocalCastTurn(noCast);
  assert.equal(stopped.project, noCast);
  assert.equal(stopped.events.length, 0);
  assert.equal(stopped.stopReason, 'no-legal-cast-action');
});

test('partial/manual chapters choose non-noops and bounded legal role contributions', () => {
  for (const kind of ['npc', 'local', 'shared']) for (const role of ['movement', 'rhythm', 'harmony', 'guest']) {
    const project = createGroupProject({ seed: `${kind}-${role}`, participants: [{ name: 'A Dot', role, kind }] });
    const result = runLocalCastTurn(project);
    assert.ok(result.events.length <= 3);
    assert.equal(result.events.length, kind === 'npc' ? 1 : 0);
    assert.equal(result.project.completed, false);
    assert.deepEqual(result.history, EMPTY_GROUP_HISTORY);
  }
  let project = fresh();
  project = applyContribution(project, project.participants[0].id, { type: 'movement', gait: 'glide' });
  project = applyContribution(project, project.participants[0].id, { type: 'movement', gait: 'hop' });
  const turn = runLocalCastTurn(project);
  assert.equal(turn.events.length, 1);
  assert.equal(turn.events[0].role, 'rhythm');
  assert.equal(turn.project.completed, false);
  assert.equal(turn.remainingEvents, 0);
});

test('policy rejects invalid inputs and suggestions never perform or award anything', () => {
  const project = fresh(), before = encodeGroupShare(project);
  assert.throws(() => runLocalCastTurn(project, { approach: 'impersonate' }), /direction and approach/);
  assert.throws(() => runLocalCastTurn(project, { intention: 'grant-counterstep' }), /direction and approach/);
  assert.throws(() => runLocalCastTurn({ ...project, completed: true }), /Derived project/);
  assert.throws(() => runLocalCastTurn(project, { history: { v: 2, pairs: [], unlocks: ['counterstep'] } }), /history fields/);
  assert.equal(nextCastChoice(project).type, 'linked-chapter');
  assert.equal(encodeGroupShare(project), before);
  assert.deepEqual(recordGroupExperience(EMPTY_GROUP_HISTORY, project), EMPTY_GROUP_HISTORY);
});

function choiceFixture() {
  const project = createGroupProject({ seed: 'remember-a-partner', participants: [
    { name: 'Clover', role: 'movement', kind: 'npc' },
    { name: 'Pip', role: 'rhythm', kind: 'npc' },
    { name: 'Rowan', role: 'rhythm', kind: 'npc' },
    { name: 'Luma', role: 'harmony', kind: 'npc' },
  ] });
  const baseline = runLocalCastTurn(project);
  const baselineId = baseline.events.find(event => event.role === 'rhythm').participantId;
  const familiar = project.participants.find(person => person.role === 'rhythm' && person.id !== baselineId);
  let performed = applyContribution(project, project.participants[0].id, { type: 'movement', gait: 'sway' });
  performed = applyContribution(performed, familiar.id, { type: 'rhythm', rhythm: [1, 0, 1, 0, 1, 0, 1, 0] });
  performed = applyContribution(performed, project.participants[3].id, { type: 'harmony', harmony: 'sunrise', timbre: 'bell' });
  return { project, baseline, baselineId, familiar, performed, history: recordGroupExperience(EMPTY_GROUP_HISTORY, performed) };
}

// A public checksum is not a signature. Reordering a valid snapshot retains the
// same participant IDs, letting us test that presentation order is not policy.
function reversedRoster(project) {
  const payload = JSON.parse(Buffer.from(encodeGroupShare(project), 'base64url').toString());
  payload.participants.reverse(); payload.id = '';
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(JSON.stringify(payload))) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  payload.id = hash.toString(16).padStart(16, '0');
  return decodeGroupShare(Buffer.from(JSON.stringify(payload)).toString('base64url'));
}

test('engine-earned shared experience changes collaborator choice before any recipe unlock', () => {
  const { project, baselineId, familiar, history } = choiceFixture();
  assert.ok(history.pairs.every(pair => pair.completed.length === 1));
  const cautious = runLocalCastTurn(project, { history, approach: 'cautious' });
  const experimental = runLocalCastTurn(project, { history, approach: 'experimental' });
  const chosen = cautious.events.find(event => event.role === 'rhythm');
  assert.equal(chosen.participantId, familiar.id);
  assert.notEqual(chosen.participantId, baselineId);
  assert.equal(chosen.selection.policy, 'familiar-complement');
  assert.equal(chosen.selection.context, 'contributor');
  assert.equal(chosen.selection.partnerId, project.participants[0].id);
  assert.deepEqual(chosen.selection.completedTypes, ['walking-flower']);
  assert.match(chosen.selection.reason, /alongside Clover.*1 different shared experience/);
  assert.equal(experimental.events.find(event => event.role === 'rhythm').participantId, baselineId);
  assert.match(experimental.events.find(event => event.role === 'rhythm').selection.reason, /no shared experience.*newer pairings/);
  assert.equal(cautious.project.completed, true);
  assert.ok(!availableGroupGaits(history, project, familiar.id).includes('counterstep'));
});

test('presentation order does not replace evidence-backed selection or deterministic empty-history ties', () => {
  const { project, familiar, history } = choiceFixture(), reversed = reversedRoster(project);
  for (const approach of ['cautious', 'experimental']) {
    assert.deepEqual(runLocalCastTurn(project, { approach }).events.map(event => event.participantId),
      runLocalCastTurn(reversed, { approach }).events.map(event => event.participantId));
    assert.deepEqual(runLocalCastTurn(project, { history, approach }).events.map(event => event.participantId),
      runLocalCastTurn(reversed, { history, approach }).events.map(event => event.participantId));
  }
  assert.equal(runLocalCastTurn(reversed, { history }).events.find(event => event.role === 'rhythm').participantId, familiar.id);
});

test('selection receipts quote only pre-turn pair types and bind to each actual contribution', () => {
  const { project, history } = choiceFixture();
  const result = runLocalCastTurn(project, { history, approach: 'experimental' });
  let reconstructed = project;
  for (const event of result.events) {
    const evidence = event.selection, [a, b] = [event.participantId, evidence.partnerId].sort();
    const previous = history.pairs.find(pair => pair.scope === project.rootId && pair.a === a && pair.b === b);
    assert.equal(evidence.scope, project.rootId);
    assert.deepEqual(evidence.completedTypes, previous?.completed ?? []);
    assert.equal(event.beforeId, reconstructed.id);
    reconstructed = applyContribution(reconstructed, event.participantId, event.action, history);
    assert.equal(event.afterId, reconstructed.id);
    assert.equal(event.recordId, reconstructed.contributions.at(-1).id);
    assert.ok(Object.isFrozen(evidence) && Object.isFrozen(evidence.completedTypes));
  }
  assert.equal(reconstructed.id, result.project.id);
  assert.equal(result.events[0].selection.context, 'prospective');
  assert.match(result.events[0].selection.reason, /prospective partner/);
  // A new relationship may be earned by the end, but never retroactively used
  // as evidence that the policy remembered it before the turn.
  assert.ok(result.relationshipChange.newProgress);
  assert.ok(result.events.some(event => event.selection.completedTypes.length === 0));
});

test('cross-root, absent-person and legacy memories do not influence this cast', () => {
  const { project, history } = choiceFixture();
  const foreignRoot = createGroupProject({ seed: 'another-root' }).rootId;
  const absent = createGroupProject({ seed: 'absent-partner' }).participants[0].id;
  const [a, b] = [project.participants[1].id, absent].sort();
  const irrelevant = { v: 2, pairs: [
    ...history.pairs.map(pair => ({ ...pair, scope: foreignRoot })),
    { scope: project.rootId, a, b, completed: ['walking-flower', 'rhythm-garden', 'harmony-garden'] },
    { scope: 'legacy-v1', a: 'legacy-gardener', b: 'legacy-player', completed: ['grow-walk', 'teach-step'] },
  ] };
  for (const approach of ['cautious', 'experimental']) {
    const plain = runLocalCastTurn(project, { approach }), noisy = runLocalCastTurn(project, { approach, history: irrelevant });
    assert.deepEqual(noisy.events, plain.events);
    assert.ok(noisy.events.every(event => event.selection.completedTypes.length === 0));
  }
});

test('imported recipes cannot provide remembered experience credit or partner-selection evidence', () => {
  const { project, baseline, performed } = choiceFixture();
  const imported = decodeGroupShare(encodeGroupShare(project));
  const result = runLocalCastTurn(imported);
  assert.deepEqual(result.events.map(event => event.participantId), baseline.events.map(event => event.participantId));
  assert.ok(result.events.every(event => event.selection.completedTypes.length === 0));
  const completed = decodeGroupShare(encodeGroupShare(performed));
  const stopped = runLocalCastTurn(completed);
  assert.equal(stopped.events.length, 0);
  assert.deepEqual(stopped.history, EMPTY_GROUP_HISTORY);
  assert.deepEqual(recordGroupExperience(EMPTY_GROUP_HISTORY, completed), EMPTY_GROUP_HISTORY);
});

test('complementary specialists reserve the flexible actor for the missing part', () => {
  const project = createGroupProject({ seed: 'reserve-flexible-partner', participants: [
    { name: 'Any Part', role: 'guest', kind: 'npc' },
    { name: 'Mover', role: 'movement', kind: 'npc' },
    { name: 'Drummer', role: 'rhythm', kind: 'npc' },
  ] });
  for (const approach of ['cautious', 'experimental']) {
    const result = runLocalCastTurn(project, { approach });
    assert.equal(result.project.completed, true);
    assert.equal(result.events.find(event => event.role === 'harmony').participantId, project.participants[0].id);
    assert.equal(result.events.length, 3);
  }
});

test('all 233 coverable three- and four-character role rosters complete within three changes', () => {
  const roles = ['movement', 'rhythm', 'harmony', 'guest'];
  let coverable = 0;
  function covers(roster, wanted = roles.slice(0, 3), used = []) {
    if (!wanted.length) return true;
    return roster.some((role, index) => !used.includes(index) && (role === wanted[0] || role === 'guest') &&
      covers(roster, wanted.slice(1), [...used, index]));
  }
  for (const size of [3, 4]) for (let n = 0; n < 4 ** size; n++) {
    const roster = Array.from({ length: size }, (_, index) => roles[(n >> (index * 2)) & 3]);
    if (!covers(roster)) continue;
    coverable++;
    const project = createGroupProject({ seed: `coverage-${size}-${n}`, participants: roster.map((role, index) => ({ name: `Dot ${index}`, role, kind: 'npc' })) });
    for (const approach of ['cautious', 'experimental']) {
      const result = runLocalCastTurn(project, { approach });
      assert.equal(result.project.completed, true, `${approach}: ${roster.join(',')}`);
      assert.equal(result.events.length, 3);
      assert.equal(new Set(result.events.map(event => event.participantId)).size, 3);
    }
  }
  assert.equal(coverable, 233);
});
