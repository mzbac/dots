import {expect} from '@playwright/test';

// The initial card already says SHARED MOOD. Wait for the actual validated
// feed fields before taking a snapshot for an unchanged-mood assertion.
export async function readPublishedMood(page){
 await expect(page.locator('body')).toHaveAttribute('data-state',/^(building|focused|checking|waiting|resting)$/,{timeout:15000});
 await expect(page.locator('#updated-at')).toHaveAttribute('title',/^Mood updated: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,{timeout:15000});
 await expect(page.locator('#status-source')).toHaveText('SHARED MOOD');
 return page.evaluate(()=>({mood:document.body.dataset.state,timestamp:document.getElementById('updated-at').getAttribute('title')}));
}
