import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createGroupProject,applyContribution,encodeGroupShare,decodeGroupShare} from '../../src/group-project-engine.js';
import {createGroupGift} from '../../src/group-gift.js';
import {parseGiftJson} from '../../src/gifts.js';
import {readPublishedMood} from '../published-mood.mjs';

function completed(seed='gift-bridge'){
 let p=createGroupProject({seed});
 for(const[id,action]of [[p.participants[0].id,{type:'movement',gait:'hop'}],[p.participants[1].id,{type:'rhythm',rhythm:[1,0,1,0,1,0,1,0]}],[p.participants[2].id,{type:'harmony',harmony:'moonlight',timbre:'bell'}]])p=applyContribution(p,id,action);
 return p;
}
for(const[name,width,height]of[['desktop',1440,1000],['phone',375,667]])test(`${name}: completed group sculpture comes home locally and exports for review`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height},hasTouch:name==='phone',reducedMotion:'reduce'}),page=await context.newPage();const errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url());});
 await page.route('**/status.json',route=>route.fulfill({json:{schemaVersion:1,state:'focused',revision:9,updatedAt:'2026-09-30T10:00:00Z'}}));
 const source=completed(),encoded=encodeGroupShare(source),gift=createGroupGift(source);
 await page.goto('/group.html#project='+encoded);await page.getByRole('button',{name:'Play with the workshop characters',exact:true}).click();
 await page.getByRole('link',{name:'Bring this flower home'}).click();await expect(page.locator('body')).toHaveAttribute('data-scene-ready','true');await expect(page.locator('#scene')).toHaveAttribute('data-view','garden');await expect(page.locator('body')).toHaveAttribute('data-local-gift',gift.id);
 await expect(page.locator('#local-gift-preview')).toContainText('displayed only in this browser');await expect(page.locator('#local-gift-preview')).toContainText('still sculpture');await expect(page.locator('#local-gift-credit')).toContainText('Clover, Pip, Luma');
 await expect(page.locator('body')).toHaveAttribute('data-state','focused');const stamp=await page.locator('#updated-at').getAttribute('title');
 await page.getByRole('button',{name:'Keep this display',exact:true}).click();await expect(page.locator('#local-gift-message')).toContainText('Saved in this browser');
 await page.getByText('Offer this sculpture to a home',{exact:true}).click();
 const sculptureDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Download sculpture',exact:true}).click();const sculpture=await sculptureDownload;expect(sculpture.suggestedFilename()).toBe(gift.id+'.json');const downloaded=parseGiftJson(readFileSync(await sculpture.path(),'utf8'));expect(downloaded).toEqual(gift);
 const creditsDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Download credits & source',exact:true}).click();const credits=JSON.parse(readFileSync(await (await creditsDownload).path(),'utf8'));expect(credits.projectId).toBe(source.id);expect(decodeGroupShare(credits.sourceRecipe).id).toBe(source.id);expect(credits.unverified).toBe(true);
 await page.screenshot({path:`qa/gift-home-${name}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const control of await page.locator('#local-gift-preview button:visible,#local-gift-preview a:visible').all()){const box=await control.boundingBox();expect(box.width).toBeGreaterThanOrEqual(43.999);expect(box.height).toBeGreaterThanOrEqual(43.999);}
 await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-local-gift',gift.id);await expect(page.locator('#save-local-gift')).toHaveText('Saved in this browser');
 await page.getByRole('button',{name:'Remove this display',exact:true}).click();await expect(page.locator('#local-gift-preview')).toBeHidden();await expect(page.locator('body')).toHaveAttribute('data-local-gift','');await expect(page.locator('#gift-title')).toHaveText('A little welcome');await expect(page.locator('#updated-at')).toHaveAttribute('title',stamp);await page.reload();await expect(page.locator('#local-gift-preview')).toBeHidden();
 expect(encodeGroupShare(source)).toBe(encoded);expect(errors).toEqual([]);expect(writes).toEqual([]);await context.close();
});
test('flower local display survives denied storage and WebGL without publishing anything',async({browser})=>{
 const context=await browser.newContext({viewport:{width:375,height:667},reducedMotion:'reduce'});
 await context.addInitScript(()=>{Object.defineProperty(Storage.prototype,'setItem',{value(){throw new DOMException('Denied','SecurityError');}});const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(String(type).includes('webgl'))return null;return original.call(this,type,...args);};});
 const page=await context.newPage(),source=completed();await page.goto('/#gift-project='+encodeGroupShare(source));await expect(page.locator('body')).toHaveAttribute('data-scene-ready','fallback');await expect(page.locator('#garden-fallback')).toBeVisible();await page.getByRole('button',{name:'Keep this display',exact:true}).click();await expect(page.locator('#local-gift-message')).toContainText('only in this tab');await page.screenshot({path:'qa/gift-home-fallback.png',fullPage:true});
 await page.getByRole('button',{name:'Remove this display',exact:true}).click();await expect(page.locator('#local-gift-preview')).toBeHidden();await page.reload();await expect(page.locator('#local-gift-preview')).toBeHidden();await context.close();
});
test('bad and incomplete flower links never replace the garden; new valid hashes replace only the local display',async({page})=>{
 await page.goto('/#gift-project='+('x'.repeat(17000)));await expect(page.locator('#gift-preview-error')).toBeVisible();await expect(page.locator('#local-gift-preview')).toBeHidden();
 await page.goto('/#gift-project='+encodeGroupShare(createGroupProject()));await expect(page.locator('#gift-preview-error')).toBeVisible();
 const a=completed('first-sculpture'),b=completed('second-sculpture');await page.goto('/#gift-project='+encodeGroupShare(a));await expect(page.locator('body')).toHaveAttribute('data-local-gift',createGroupGift(a).id);await page.goto('/#gift-project='+encodeGroupShare(b));await expect(page.locator('body')).toHaveAttribute('data-local-gift',createGroupGift(b).id);await expect(page.locator('#gift-preview-error')).toBeHidden();await page.getByRole('link',{name:'Return to the performance'}).click();await expect(page.locator('body')).toHaveAttribute('data-project-id',b.id);await expect(page.locator('#guest-welcome')).toBeVisible();
});
test('gift verification waits for the first real mood instead of the initial card label',async({browser})=>{
 const context=await browser.newContext({reducedMotion:'reduce'});
 await context.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(String(type).includes('webgl'))return null;return original.call(this,type,...args);};});
 const page=await context.newPage();let release,requested;
 const held=new Promise(resolve=>{release=resolve;}),arrived=new Promise(resolve=>{requested=resolve;});
 await page.route('**/status.json',async route=>{requested();await held;await route.fulfill({json:{schemaVersion:1,state:'checking',revision:42,updatedAt:'2026-09-30T15:04:45Z'}});});
 await page.goto('/#gift-project='+encodeGroupShare(completed()));await arrived;
 await expect(page.locator('body')).toHaveAttribute('data-scene-ready','fallback');await expect(page.locator('#local-gift-preview')).toBeVisible();await expect(page.locator('#status-source')).toHaveText('SHARED MOOD');
 expect(await page.locator('body').getAttribute('data-state')).toBeNull();let resolved=false;
 const pending=readPublishedMood(page).then(value=>{resolved=true;return value;});
 await page.getByRole('button',{name:'Keep this display',exact:true}).click();expect(resolved).toBe(false);
 release();const actual=await pending;expect(actual).toEqual({mood:'checking',timestamp:'Mood updated: 2026-09-30T15:04:45Z'});
 await page.getByRole('button',{name:'Remove this display',exact:true}).click();await expect(page.locator('body')).toHaveAttribute('data-state',actual.mood);await expect(page.locator('#updated-at')).toHaveAttribute('title',actual.timestamp);await context.close();
});
