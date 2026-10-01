export const STATES = Object.freeze({
  building: { title: 'In the making', description: 'A bright little burst of momentum. Turning loose ideas into something real.', activity: 'Creating a little world', symbol: '✦', color: '#d26a3f', light: 0xffc185, speed: 1.3, screen: '#e3a06d' },
  focused: { title: 'In the flow', description: 'The room gets quiet. One thought, one detail, one good step forward.', activity: 'Working through details', symbol: '◎', color: '#2f7f7c', light: 0xbfe6e3, speed: .65, screen: '#7cc9c2' },
  checking: { title: 'A closer look', description: 'A curious tilt of the head. Giving the little things another careful look.', activity: 'Checking the details', symbol: '✓', color: '#9a739b', light: 0xe0c8f0, speed: .9, screen: '#c8a6db' },
  waiting: { title: 'Room to breathe', description: 'The kettle is warm. A gentle pause while the next piece falls into place.', activity: 'Waiting for the next step', symbol: '◷', color: '#c29a3e', light: 0xf3dfae, speed: .45, screen: '#e5c27a' },
  resting: { title: 'A softer glow', description: 'Tools down, lights low. Keeping a small warm spark for what comes next.', activity: 'Ready for the next idea', symbol: '☾', color: '#778398', light: 0xa6bddb, speed: .25, screen: '#8c9cae' }
});
export function validateStatus(input) {
  if (!input || typeof input !== 'object' || !Object.hasOwn(STATES, input.state)) throw new Error('Invalid state');
  if (typeof input.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(input.updatedAt) || !Number.isFinite(Date.parse(input.updatedAt))) throw new Error('Invalid timestamp');
  // Deliberately ignore arbitrary server strings: only these public, generic labels reach the UI.
  const revision=Number.isSafeInteger(input.revision)&&input.revision>=0?input.revision:0;
  return Object.freeze({ state: input.state, mood: input.state, revision, updatedAt: input.updatedAt, activity: STATES[input.state].activity });
}
export function statusAge(timestamp, now = Date.now()) {
  return now - Date.parse(timestamp) > 24 * 60 * 60 * 1000 ? 'Older snapshot' : 'Published snapshot';
}
