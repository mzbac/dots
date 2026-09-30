import { test, expect } from '@playwright/test';
import { createGroupProject, encodeGroupShare, decodeGroupShare } from '../../src/group-project-engine.js';
import { runLocalCastTurn } from '../../src/group-cast.js';

const KEY = 'dot.group-project.v2';
async function share(page) {
  await page.getByRole('button', { name: 'Pass this version along' }).click();
  return decodeGroupShare(new URL(await page.locator('#group-share-link').inputValue()).hash.slice(9));
}

for (const [name, width, height] of [['desktop', 1440, 1000], ['phone', 375, 667]]) {
  test(`${name}: opt-in cast stops at three, saves a real artifact and grows through distinct chapters`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.goto('/group.html');
    await expect(page.locator('body')).toHaveAttribute('data-contribution-count', '0');
    await expect(page.getByRole('button', { name: 'Play motion', exact: true })).toBeVisible();
    await expect(page.locator('#cast-capacity')).toContainText('3 cast changes');
    await expect(page.locator('#cast-result')).toBeHidden();
    await page.getByLabel('The direction', { exact: true }).selectOption('delight');
    await page.getByLabel('The cast’s approach for this turn').selectOption('experimental');
    await page.getByRole('button', { name: 'Let the local cast try' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-contribution-count', '3');
    await expect(page.locator('body')).toHaveAttribute('data-project-complete', 'true');
    await expect(page.locator('#cast-result-title')).toBeFocused();
    await expect(page.locator('#cast-result li')).toHaveCount(3);
    await expect(page.locator('.cast-relationship')).toContainText('3 local project pairs');
    await expect(page.getByRole('button', { name: 'Let the local cast try' })).toBeDisabled();
    const first = await share(page);
    expect(first.contributions).toHaveLength(3);
    expect(first.gait).toBe('hop');
    expect(first.rhythm).toEqual([1, 1, 0, 1, 0, 0, 1, 0]);
    const saved = JSON.parse(await page.evaluate(key => localStorage.getItem(key), KEY));
    expect(decodeGroupShare(saved.projects[0]).id).toBe(first.id);
    expect(saved.history.pairs).toHaveLength(3);
    await page.locator('#cast-panel').screenshot({ path: `qa/cast-${name}-result.png` });
    await page.screenshot({ path: `qa/cast-${name}-page.png`, fullPage: true });

    await page.getByRole('button', { name: 'Next: A rhythm garden', exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute('data-contribution-count', '0');
    await expect(page.locator('#chapter-label')).toContainText('Chapter 2');
    await page.getByRole('button', { name: 'Let the local cast try' }).click();
    await expect(page.locator('.cast-relationship')).toContainText('Counterstep opened');
    await expect(page.locator('#relationship-list')).toContainText('2 different shared experiences');
    await page.getByRole('button', { name: 'Next: A harmony garden', exact: true }).click();
    await page.getByRole('button', { name: 'Let the local cast try' }).click();
    await expect(page.locator('#cast-result li').first()).toContainText('counterstep');
    await expect(page.locator('.cast-relationship')).toContainText('already open');
    const learned = await share(page);
    expect(learned.gait).toBe('counterstep');
    const id = learned.id;
    await page.getByRole('button', { name: 'How it works', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveAttribute('data-project-id', id);
    await page.reload();
    await page.locator('#saved-projects button').first().click();
    await expect(page.locator('body')).toHaveAttribute('data-project-id', id);
    await expect(page.getByRole('button', { name: 'Let the local cast try' })).toBeDisabled();
    await expect(page.locator('#relationship-list')).toContainText('3 different shared experiences');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await page.locator('#cast-panel button:visible').all()) {
      const box = await button.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    expect(requests.every(url => url.startsWith('http://127.0.0.1:4173/') || url.startsWith('data:'))).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('same received recipe, same intention and two approaches produce different visible copies', async ({ page }) => {
  const source = createGroupProject({ seed: 'browser-cast-comparison' });
  const url = '/group.html#project=' + encodeGroupShare(source);
  await page.goto(url);
  await expect(page.locator('#cast-intention')).toBeHidden();
  await page.getByRole('button', { name: 'Try the example cast', exact: true }).click();
  await page.getByRole('button', { name: 'Let the local cast try' }).click();
  const cautious = await share(page);
  await page.reload();
  await page.getByRole('button', { name: 'Try the example cast', exact: true }).click();
  await page.getByLabel('The cast’s approach for this turn').selectOption('experimental');
  await page.getByRole('button', { name: 'Let the local cast try' }).click();
  const experimental = await share(page);
  expect(cautious.gait).not.toBe(experimental.gait);
  expect(cautious.rhythm).not.toEqual(experimental.rhythm);
  expect(cautious.harmony).not.toBe(experimental.harmony);
  await expect(page.locator('.cast-relationship')).toContainText('No new relationship progress');
  await page.getByRole('button', { name: 'Exact received copy', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-project-id', source.id);
  await expect(page.locator('body')).toHaveAttribute('data-contribution-count', '0');
  await expect(page.locator('#cast-result')).toBeHidden();
});

test('imported complete recipe grants nothing and mixed cast leaves guest and local roles alone', async ({ page }) => {
  const completed = runLocalCastTurn(createGroupProject({ seed: 'no-imported-credit' })).project;
  await page.goto('/group.html#project=' + encodeGroupShare(completed));
  await page.getByRole('button', { name: 'Try the example cast', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Let the local cast try' })).toBeDisabled();
  await expect(page.locator('#relationship-list .relationship-card')).toHaveCount(0);
  const mixed = createGroupProject({ seed: 'mixed-browser-cast', participants: [
    { name: 'Mine', kind: 'local', role: 'movement' },
    { name: 'A Visitor', kind: 'shared', role: 'rhythm' },
    { name: 'Luma', kind: 'npc', role: 'harmony' },
  ] });
  await page.goto('/group.html#project=' + encodeGroupShare(mixed));
  await page.getByRole('button', { name: 'Try this cast locally', exact: true }).click();
  await page.getByRole('button', { name: 'Let the local cast try' }).click();
  await expect(page.locator('#cast-result li')).toHaveCount(1);
  await expect(page.locator('#cast-result li')).toContainText('Luma');
  await expect(page.locator('body')).toHaveAttribute('data-project-complete', 'false');
  await expect(page.locator('#relationship-list .relationship-card')).toHaveCount(0);
  const result = await share(page);
  expect(result.contributions.every(record => record.participantId === mixed.participants[2].id)).toBe(true);
  await page.getByRole('button', { name: 'Exact received copy', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-project-id', mixed.id);
});

test('denied storage still gives an immediate bounded result; changing choices alone never runs a turn', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Storage.prototype, 'setItem', { value() { throw new DOMException('Denied', 'SecurityError'); } }));
  await page.goto('/group.html');
  await page.getByLabel('The cast’s approach for this turn').selectOption('experimental');
  await page.getByLabel('The direction', { exact: true }).selectOption('delight');
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-contribution-count', '0');
  await page.getByRole('button', { name: 'Let the local cast try' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-contribution-count', '3');
  await expect(page.locator('#cast-result li')).toHaveCount(3);
  await expect(page.locator('#save-notice')).toContainText('Saving is unavailable');
  await expect(page.getByRole('button', { name: 'Sound off', exact: true })).toHaveAttribute('aria-pressed', 'false');
});
