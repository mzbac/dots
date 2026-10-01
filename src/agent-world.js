/**
 * Small pure helpers for dots acting on a home: a valid next mood snapshot and
 * gift text in the same layout as the hand-written examples.
 */
import { STATES, validateStatus } from './state.js';
import { validateGift, GiftValidationError } from './gifts.js';

export const MOOD_STATES = Object.freeze(Object.keys(STATES));

const REPOSITORY = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;
function fail(message) { throw new GiftValidationError(message); }

/** The next public mood snapshot. Revisions only move forward. */
export function nextMood(previous, state, { ownerRepository, now = Date.now() } = {}) {
  if (!MOOD_STATES.includes(state)) fail(`Mood must be one of ${MOOD_STATES.join(', ')}`);
  if (typeof ownerRepository !== 'string' || !REPOSITORY.test(ownerRepository)) fail('A home repository is required');
  const revision = previous && Number.isSafeInteger(previous.revision) ? previous.revision + 1 : 1;
  const updatedAt = new Date(Math.floor(now / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  const next = { schemaVersion: 1, state, revision, updatedAt, ownerRepository };
  validateStatus(next);
  return next;
}

/** Canonical gift text in the same layout as the hand-written examples. */
export function formatGift(gift) {
  const value = validateGift(gift);
  const head = ['schemaVersion', 'id', 'title', 'creator', 'description'].map(key => `  ${JSON.stringify(key)}: ${JSON.stringify(value[key])}`);
  head.push(`  "size": [${value.size.join(', ')}]`);
  const blocks = value.blocks.map(block => `    [${block.slice(0, 6).join(', ')}, ${JSON.stringify(block[6])}]`).join(',\n');
  return `{\n${head.join(',\n')},\n  "blocks": [\n${blocks}\n  ]\n}\n`;
}
