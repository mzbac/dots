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
