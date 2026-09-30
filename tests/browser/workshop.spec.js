import { test, expect } from '@playwright/test';
import { STATES } from '../../src/state.js';

const timestamp='2026-09-30T09:30:00Z';
const status=(state='checking',revision=1,updatedAt=timestamp)=>({schemaVersion:1,state,revision,updatedAt});
async function fixture(page,getValue=()=>status()){
  await page.route('**/status.json*',route=>route.fulfill({json:getValue()}));
}
async function ready(page){
  await expect(page.locator('body')).toHaveAttribute('data-scene-ready','true');
  await expect(page.locator('body')).toHaveAttribute('data-model','voxel');
}
async function readOnlyView(page){
  await expect(page.locator('.state-option,.states-section,#return-button,#preview-label,button[data-state],select[data-state]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Every state has a spark');
  await expect(page.locator('body')).not.toContainText('Try a different rhythm');
  expect(await page.evaluate(()=>['setMood','setState','previewMood','previewState'].filter(name=>typeof window[name]==='function'))).toEqual([]);
}
async function touchTargets(page){
  for(const target of await page.locator('button:visible,a:visible').all()){
    const bounds=await target.boundingBox();const label=await target.innerText();
    expect(bounds.width,label).toBeGreaterThanOrEqual(44);expect(bounds.height,label).toBeGreaterThanOrEqual(44);
  }
}
async function visitorCopy(page){
  const technical=/\b(voxel|hunyuan|blender|webgl|javascript|three\.js)\b|100%\s*voxel/i;
  expect(await page.locator('body').innerText()).not.toMatch(technical);
  expect(await page.locator('[alt],[aria-label]').evaluateAll(elements=>elements.map(element=>`${element.getAttribute('alt')||''} ${element.getAttribute('aria-label')||''}`).join(' '))).not.toMatch(technical);
}

for(const [name,width,height,touch] of [['desktop',1440,1000,false],['ipad',768,1024,true],['ipad-landscape',1024,768,true],['phone',390,844,true],['small-phone',375,667,true]]){
  test(`${name}: watch-only workshop, accessible camera and About`,async({browser})=>{
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,deviceScaleFactor:1});
    const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await fixture(page);
    await page.goto('/');await ready(page);await readOnlyView(page);await visitorCopy(page);
    await expect(page.locator('#status-source')).toHaveText('SHARED MOOD');
    await expect(page.locator('#state-title')).toHaveText(STATES.checking.title);
    await expect(page.locator('.activity-label')).toHaveText('What I’m doing');
    await expect(page.locator('#updated-at')).toContainText('Last updated');
    await expect(page.locator('#updated-at')).toHaveAttribute('title',`Last updated: ${timestamp}`);
    if(touch){await expect(page.locator('#scene')).toHaveAttribute('data-interactive','false');await page.locator('#explore-button').tap();await expect(page.locator('#scene')).toHaveAttribute('data-interactive','true');await page.locator('#explore-button').tap();await expect(page.locator('#scene')).toHaveAttribute('data-interactive','false');}
    await page.getByRole('button',{name:'Pause animation',exact:true}).click();await expect(page.getByRole('button',{name:'Resume animation',exact:true})).toBeVisible();await page.getByRole('button',{name:'Resume animation',exact:true}).click();
    await page.locator('#scene').focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('+');await page.keyboard.press('Home');
    await page.getByRole('button',{name:'Reset view',exact:true}).click();await ready(page);await expect(page.locator('#state-title')).toHaveText(STATES.checking.title);
    await touchTargets(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('#about-button').click();await expect(page.locator('#about-dialog')).toBeVisible();await visitorCopy(page);await touchTargets(page);
    await page.screenshot({path:`qa/${name}-about.png`,fullPage:true});await page.keyboard.press('Escape');await expect(page.locator('#about-dialog')).toBeHidden();
    await page.locator('#about-button').click();await page.locator('#close-about').click();await expect(page.locator('#about-dialog')).toBeHidden();
    expect(errors).toEqual([]);await page.screenshot({path:`qa/${name}.png`,fullPage:true});await context.close();
  });
}

test('all five states arrive only through the read-only published feed',async({browser})=>{
  const context=await browser.newContext({viewport:{width:375,height:667},hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage();let current=status('building');const writes=[];
  page.on('request',request=>{if(request.url().includes('status.json')&&request.method()!=='GET')writes.push(request.method());});
  await page.clock.install({time:new Date('2026-09-30T09:40:00Z')});await fixture(page,()=>current);
  await page.goto('/?state=resting&mood=resting#focused');await ready(page);
  let revision=0;
  for(const state of ['building','focused','checking','waiting','resting']){
    if(revision){current=status(state,revision+1,new Date(Date.parse(timestamp)+revision*60000).toISOString());await page.clock.fastForward(31000);}
    await expect(page.locator('body')).toHaveAttribute('data-state',state);await expect(page.locator('#state-title')).toHaveText(STATES[state].title);
    await expect(page.locator('#status-source')).toHaveText('SHARED MOOD');await expect(page.locator('#updated-at')).toHaveAttribute('title',`Last updated: ${current.updatedAt}`);
    await readOnlyView(page);await page.clock.runFor(64);await page.screenshot({path:`qa/published-${state}-375.png`,fullPage:true});revision++;
  }
  expect(writes).toEqual([]);await context.close();
});

test('reduced motion starts paused',async({page})=>{await page.emulateMedia({reducedMotion:'reduce'});await fixture(page);await page.goto('/');await expect(page.getByRole('button',{name:'Resume animation',exact:true})).toBeVisible();});

test('WebGL unavailable keeps a readable still view and feed',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});const page=await context.newPage();await fixture(page,()=>status('waiting'));
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.startsWith('webgl'))return null;return original.call(this,type,...args);};});
  await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-scene-ready','fallback');await expect(page.locator('#scene-fallback')).toBeVisible();
  await expect(page.locator('#state-title')).toHaveText(STATES.waiting.title);await expect(page.locator('#motion-button')).toBeDisabled();await expect(page.locator('#reset-button')).toBeDisabled();await expect(page.locator('#explore-button')).toBeHidden();
  await readOnlyView(page);await visitorCopy(page);await page.screenshot({path:'qa/phone-webgl-fallback.png',fullPage:true});await context.close();
});

test('feed failure is clear without offering local mood overrides',async({page})=>{
  await page.route('**/status.json*',route=>route.fulfill({status:503,body:'unavailable'}));await page.goto('/');
  await expect(page.locator('#status-source')).toHaveText('MOOD UNAVAILABLE');await readOnlyView(page);await visitorCopy(page);await ready(page);
});

test('room is available without external model downloads',async({page})=>{
  const downloads=[];page.on('request',request=>{if(/\.(glb|gltf)(?:[?#]|$)/i.test(request.url()))downloads.push(request.url());});await fixture(page);await page.goto('/');await ready(page);await expect(page.locator('#scene canvas')).toBeVisible();expect(downloads).toEqual([]);
});

test('phone touch scrolls normally, then orbits and pinches without changing mood',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await fixture(page);await page.goto('/');await ready(page);
  const session=await context.newCDPSession(page);
  const send=async(type,points)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((point,id)=>({...point,id,radiusX:2,radiusY:2}))});
  const gesture=async(start,end)=>{await send('touchStart',start);for(let step=1;step<=8;step++){await send('touchMove',start.map((point,index)=>({x:point.x+(end[index].x-point.x)*step/8,y:point.y+(end[index].y-point.y)*step/8})));await page.waitForTimeout(24);}await send('touchEnd',[]);await page.waitForTimeout(200);};
  await page.evaluate(()=>window.scrollTo(0,0));let box=await page.locator('#scene').boundingBox();const initialScroll=await page.evaluate(()=>scrollY);
  await expect(page.locator('#scene')).toHaveAttribute('data-interactive','false');
  await gesture([{x:box.x+box.width/2,y:Math.min(box.y+box.height-35,790)}],[{x:box.x+box.width/2,y:box.y+35}]);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(initialScroll+20);
  await page.locator('#explore-button').tap();await expect(page.locator('#scene')).toHaveAttribute('data-interactive','true');
  await page.locator('#scene').evaluate(element=>window.scrollTo(0,element.getBoundingClientRect().top+window.scrollY-160));box=await page.locator('#scene').boundingBox();
  const exploreScroll=await page.evaluate(()=>scrollY);const canvas=page.locator('#scene canvas');const beforeOrbit=await canvas.screenshot();
  await gesture([{x:box.x+box.width*.3,y:box.y+box.height*.55}],[{x:box.x+box.width*.7,y:box.y+box.height*.4}]);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(exploreScroll);expect(Buffer.compare(beforeOrbit,await canvas.screenshot())).not.toBe(0);
  const center={x:box.x+box.width/2,y:box.y+box.height/2};const beforePinch=await canvas.screenshot();
  await gesture([{x:center.x-22,y:center.y},{x:center.x+22,y:center.y}],[{x:center.x-65,y:center.y},{x:center.x+65,y:center.y}]);
  expect(Buffer.compare(beforePinch,await canvas.screenshot())).not.toBe(0);await ready(page);
  await page.getByRole('button',{name:'Reset view',exact:true}).tap();await page.locator('#explore-button').tap();await expect(page.locator('#scene')).toHaveAttribute('data-interactive','false');
  await expect(page.locator('#state-title')).toHaveText(STATES.checking.title);await readOnlyView(page);expect(errors).toEqual([]);
  await page.screenshot({path:'qa/touch-exploration.png',fullPage:true});await context.close();
});
