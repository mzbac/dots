import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createGroupProject, decodeGroupShare, encodeGroupShare } from '../../src/group-project-engine.js';

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
    await page.getByRole('button', { name: 'Try the example cast', exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute('data-contribution-count', '0');
    await page.getByLabel('The cast’s approach for this turn').selectOption('experimental');
    await page.getByRole('button', { name: 'Let the local cast try' }).click();
    await expect(page.locator('#cast-result li')).toHaveCount(3);
    await expect(page.locator('body')).toHaveAttribute('data-project-complete', 'true');
    await expect(page.getByRole('button', { name: 'Let the local cast try' })).toBeDisabled();
    await expect(page.locator('#relationship-list .relationship-card')).toHaveCount(3);
    mkdirSync('qa-production', { recursive: true });
    await page.locator('#cast-panel').screenshot({ path: `qa-production/live-cast-${name}-result.png` });
    await page.locator('.art-panel').screenshot({ path: `qa-production/live-cast-${name}-art.png` });
    await page.getByRole('button', { name: 'Next: A rhythm garden', exact: true }).click();
    await page.getByRole('button', { name: 'Let the local cast try' }).click();
    await expect(page.locator('.cast-relationship')).toContainText('Counterstep opened');
    await page.getByRole('button', { name: 'Next: A harmony garden', exact: true }).click();
    await page.getByRole('button', { name: 'Let the local cast try' }).click();
    await expect(page.locator('#cast-result li').first()).toContainText('counterstep');
    await expect(page.locator('.cast-relationship')).toContainText('already open');
    await page.getByRole('button', { name: 'Pass this version along' }).click();
    const resultURL = await page.locator('#group-share-link').inputValue();
    const result = decodeGroupShare(new URL(resultURL).hash.slice(9));
    expect(result.gait).toBe('counterstep');
    expect(result.contributions).toHaveLength(3);
    const beforeHistory = await page.evaluate(() => JSON.parse(localStorage.getItem('dot.group-project.v2')).history);
    await page.goto(resultURL);
    await page.getByRole('button', { name: 'Try the example cast', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Let the local cast try' })).toBeDisabled();
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
