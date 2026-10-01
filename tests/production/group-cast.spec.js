import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createGroupProject, decodeGroupShare, encodeGroupShare, applyContribution, recordGroupExperience, EMPTY_GROUP_HISTORY } from '../../src/group-project-engine.js';
import { runLocalCastTurn } from '../../src/group-cast.js';

for (const [name, width, height] of [['desktop', 1440, 1000], ['phone', 375, 667]]) {
  test(`live ${name}: an opt-in local cast changes the recipe and learns through distinct chapters`, async ({ browser }) => {
    if (!process.env.LIVE_URL) throw Error('LIVE_URL required');
    const source = createGroupProject({ seed: `live-cast-${name}` });
    const url = new URL('group.html', process.env.LIVE_URL);
    url.searchParams.set('v', process.env.GITHUB_SHA || 'live');
    url.hash = 'project=' + encodeGroupShare(source);
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() !== 'GET') writes.push(request.method()); });
    await page.goto(url.href);
    await expect(page.locator('#guest-welcome')).toBeVisible();
    await expect(page.locator('#cast-intention')).toBeHidden();
    await page.getByRole('button', { name: 'Play with the workshop characters', exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute('data-contribution-count', '0');
    await page.getByLabel('How shall we try it?', { exact: true }).selectOption('experimental');
    await page.getByRole('button', { name: 'Try a shared creation' }).click();
    await expect(page.locator('#cast-result li')).toHaveCount(3);
    await expect(page.locator('body')).toHaveAttribute('data-project-complete', 'true');
    await expect(page.getByRole('button', { name: 'Try a shared creation' })).toBeDisabled();
    await expect(page.locator('#relationship-list .relationship-card')).toHaveCount(3);
    mkdirSync('qa-production', { recursive: true });
    await page.locator('#cast-panel').screenshot({ path: `qa-production/live-cast-${name}-result.png` });
    await page.locator('.art-panel').screenshot({ path: `qa-production/live-cast-${name}-art.png` });
    await page.getByRole('button', { name: 'Next: A rhythm garden', exact: true }).click();
    await page.getByRole('button', { name: 'Try a shared creation' }).click();
    await expect(page.locator('.cast-relationship')).toContainText('Counterstep opened');
    await page.getByRole('button', { name: 'Next: A harmony garden', exact: true }).click();
    await page.getByRole('button', { name: 'Try a shared creation' }).click();
    await expect(page.locator('#cast-result li').first()).toContainText('counterstep');
    await expect(page.locator('.cast-relationship')).toContainText('already open');
    await page.getByRole('button', { name: 'Pass this version along' }).click();
    const resultURL = await page.locator('#group-share-link').inputValue();
    const result = decodeGroupShare(new URL(resultURL).hash.slice(9));
    expect(result.gait).toBe('counterstep');
    expect(result.contributions).toHaveLength(3);
    const beforeHistory = await page.evaluate(() => JSON.parse(localStorage.getItem('dot.group-project.v2')).history);
    await page.goto(resultURL);
    await page.getByRole('button', { name: 'Play with the workshop characters', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Try a shared creation' })).toBeDisabled();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dot.group-project.v2')).history)).toEqual(beforeHistory);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Sound off', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect(errors).toEqual([]); expect(writes).toEqual([]);
    writeFileSync(`qa-production/live-cast-${name}-verification.json`, JSON.stringify({
      commit: process.env.GITHUB_SHA, url: page.url(), sourceId: source.id, resultId: result.id,
      contributions: result.contributions.length, gait: result.gait,
      completedExperienceCounts: beforeHistory.pairs.map(pair => pair.completed.length),
      importedCreditUnchanged: true, errors, writes,
    }, null, 2));
    await context.close();
  });
}

test('live phone: local shared experience changes partner selection and exposes exact contribution evidence', async ({ browser }) => {
  if (!process.env.LIVE_URL) throw Error('LIVE_URL required');
  const project = createGroupProject({ seed: 'live-remembered-cast', participants: [
    { name: 'Clover', role: 'movement', kind: 'npc' },
    { name: 'Pip', role: 'rhythm', kind: 'npc' },
    { name: 'Rowan', role: 'rhythm', kind: 'npc' },
    { name: 'Luma', role: 'harmony', kind: 'npc' },
  ] });
  const baselineId = runLocalCastTurn(project).events[1].participantId;
  const known = project.participants.find(person => person.role === 'rhythm' && person.id !== baselineId);
  let completed = applyContribution(project, project.participants[0].id, { type: 'movement', gait: 'sway' });
  completed = applyContribution(completed, known.id, { type: 'rhythm', rhythm: [1, 0, 1, 0, 1, 0, 1, 0] });
  completed = applyContribution(completed, project.participants[3].id, { type: 'harmony', harmony: 'sunrise', timbre: 'bell' });
  const history = recordGroupExperience(EMPTY_GROUP_HISTORY, completed), results = [];
  const url = new URL('group.html', process.env.LIVE_URL);
  url.searchParams.set('v', process.env.GITHUB_SHA || 'live');
  url.hash = 'project=' + encodeGroupShare(project);
  for (const approach of ['cautious', 'experimental']) {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
    await context.addInitScript(history => localStorage.setItem('dot.group-project.v2', JSON.stringify({ v: 2, history, projects: [] })), history);
    const page = await context.newPage(), errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() !== 'GET') writes.push(request.method()); });
    await page.goto(url.href);
    await page.getByRole('button', { name: 'Play with the workshop characters', exact: true }).click();
    await page.getByLabel('How shall we try it?', { exact: true }).selectOption(approach);
    await page.getByRole('button', { name: 'Try a shared creation' }).click();
    const event = page.locator('#cast-result li').nth(1), expected = runLocalCastTurn(project, { history, approach }).events[1];
    await expect(event.locator('.cast-selection')).toContainText(approach === 'cautious'
      ? '1 different shared experience is recorded' : 'no shared experience is recorded');
    await event.locator('summary').click();
    for (const value of [expected.recordId, expected.beforeId, expected.afterId]) await expect(event.locator('dl')).toContainText(value);
    mkdirSync('qa-production', { recursive: true });
    await page.locator('#cast-result').screenshot({ path: `qa-production/live-cast-phone-${approach}-memory.png` });
    await page.getByRole('button', { name: 'Pass this version along' }).click();
    const copy = decodeGroupShare(new URL(await page.locator('#group-share-link').inputValue()).hash.slice(9));
    expect(copy.contributions[1].participantId).toBe(approach === 'cautious' ? known.id : baselineId);
    expect(copy.contributions[1].id).toBe(expected.recordId);
    expect(copy.completed).toBe(true);
    expect(copy.contributions).toHaveLength(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]); expect(writes).toEqual([]);
    results.push({ approach, selectedId: copy.contributions[1].participantId, event: expected, copyId: copy.id, errors, writes });
    await context.close();
  }
  expect(results[0].selectedId).not.toBe(results[1].selectedId);
  writeFileSync('qa-production/live-cast-memory-verification.json', JSON.stringify({
    commit: process.env.GITHUB_SHA, sourceId: project.id, priorHistory: history, results,
  }, null, 2));
});
