import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {STATES,validateStatus} from '../../src/state.js';

for(const [name,width,height,touch] of [['desktop',1440,1000,false],['phone',375,667,true]]){
  test(`live ${name}: workshop and actual published feed`,async({browser})=>{
    if(!process.env.LIVE_URL)throw new Error('LIVE_URL is required for production verification');
    const url=new URL(process.env.LIVE_URL);if(process.env.GITHUB_SHA)url.searchParams.set('v',process.env.GITHUB_SHA);
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,deviceScaleFactor:1,reducedMotion:'no-preference'});
    const page=await context.newPage();const errors=[],writes=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.url().includes('/public/status.json')&&request.method()!=='GET')writes.push(request.method());});
    const responsePromise=page.waitForResponse(response=>response.url().startsWith('https://raw.githubusercontent.com/mzbac/dots/main/public/status.json')&&response.ok(),{timeout:45000});
    await page.goto(url.toString(),{waitUntil:'domcontentloaded'});const feedResponse=await responsePromise;
    const published=validateStatus(await feedResponse.json());
    const expectedActions={building:/^seated-working$/,focused:/^seated-working$/,checking:/^laptop-check$/,waiting:/^(standing-pause|walking)$/,resting:/^seated-rest$/};
    await expect(page.locator('body')).toHaveAttribute('data-scene-ready','true',{timeout:45000});
    await expect(page.locator('body')).toHaveAttribute('data-model','voxel');
    await expect(page.locator('#scene-fallback')).toBeHidden();await expect(page.locator('#scene canvas')).toBeVisible();await expect(page.getByRole('button',{name:'Pause animation',exact:true})).toBeVisible();
    await expect(page.locator('#status-source')).toHaveText('SHARED MOOD');
    await expect(page.locator('#state-title')).toHaveText(STATES[published.state].title);
    await expect(page.locator('#updated-at')).toHaveAttribute('title',`Mood updated: ${published.updatedAt}`);
    await expect(page.locator('#scene')).toHaveAttribute('data-action',expectedActions[published.state],{timeout:2000});
    await expect(page.locator('#updated-at')).toContainText('Mood updated');await expect(page.locator('.activity-label')).toHaveText('What I’m doing');
    await expect(page.locator('.state-option,.states-section,#return-button,#preview-label,button[data-state],select[data-state]')).toHaveCount(0);
    const copy=await page.locator('body').innerText();expect(copy).not.toMatch(/\b(voxel|hunyuan|blender|webgl|javascript|three\.js)\b|Every state has a spark|Try a different rhythm/i);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);expect(writes).toEqual([]);
    mkdirSync('qa-production',{recursive:true});await page.screenshot({path:`qa-production/live-${name}.png`,fullPage:true});const frameOne=await page.locator('#scene canvas').screenshot({path:`qa-production/live-${name}-scene.png`});await page.waitForTimeout(1200);const frameTwo=await page.locator('#scene canvas').screenshot({path:`qa-production/live-${name}-scene-motion.png`});const framesDiffer=Buffer.compare(frameOne,frameTwo)!==0;expect(framesDiffer,'The live scene should continue moving').toBe(true);
    writeFileSync(`qa-production/live-${name}-verification.json`,JSON.stringify({url:page.url(),expectedDeploymentCommit:process.env.GITHUB_SHA||null,viewport:{width,height},webglRendered:true,published:{state:published.state,revision:published.revision,updatedAt:published.updatedAt},displayedTitle:await page.locator('#state-title').innerText(),displayedTimestamp:await page.locator('#updated-at').getAttribute('title'),noMoodSelectors:true,renderedAction:await page.locator('#scene').getAttribute('data-action'),motionEnabled:true,framesDiffer,statusWriteRequests:writes,errors},null,2));
    await context.close();
  });
}
