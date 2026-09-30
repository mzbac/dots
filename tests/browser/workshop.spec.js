import { test, expect } from '@playwright/test';

for(const [name,width,height,touch] of [['desktop',1440,1000,false],['ipad',768,1024,true],['ipad-landscape',1024,768,true],['phone',390,844,true],['small-phone',375,667,true]]){
  test(`${name}: rendered room, controls, previews, status recovery`,async({browser})=>{
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,deviceScaleFactor:1});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-scene-ready','true');await expect(page.locator('body')).toHaveAttribute('data-model','hunyuan',{timeout:30000});
    await expect(page.locator('#status-source')).toHaveText('PUBLISHED STATUS');
    await expect(page.locator('#updated-at')).toContainText(/(Published|Older) snapshot/);
    await expect(page.locator('#updated-at')).toHaveAttribute('title', /^Last updated: \d{4}-\d{2}-\d{2}T/);
    if(touch){await expect(page.locator('#scene')).toHaveAttribute('data-interactive','false');await page.locator('#explore-button').click();await expect(page.locator('#scene')).toHaveAttribute('data-interactive','true');await page.locator('#explore-button').click();await expect(page.locator('#scene')).toHaveAttribute('data-interactive','false');}
    for(const state of ['focused','checking','waiting','resting','building']){await page.locator(`[data-state="${state}"].state-option`).click();await expect(page.locator('body')).toHaveAttribute('data-state',state);await expect(page.locator('#status-source')).toHaveText('STATE PREVIEW');await expect(page.locator('#updated-at')).toHaveText('Preview only • published status is unchanged');}
    await page.locator('#return-button').click();await expect(page.locator('#status-source')).toHaveText('PUBLISHED STATUS');await expect(page.locator('#return-button')).toBeHidden();
    await page.getByRole('button',{name:'Pause animation',exact:true}).click();await expect(page.getByRole('button',{name:'Resume animation',exact:true})).toBeVisible();await page.getByRole('button',{name:'Resume animation',exact:true}).click();
    await page.locator('#scene').focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('+');await page.keyboard.press('Home');
    await page.getByRole('button',{name:'Reset view',exact:true}).click();await expect(page.locator('body')).toHaveAttribute('data-scene-ready','true');await expect(page.locator('#status-source')).toHaveText('PUBLISHED STATUS');await expect(page.locator('#scene canvas')).toBeVisible();
    await page.locator('#about-button').click();await expect(page.locator('#about-dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#about-dialog')).toBeHidden();await page.locator('#about-button').click();await page.locator('#close-about').click();await expect(page.locator('#about-dialog')).toBeHidden();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
    const checkTouchTargets=async()=>{for(const target of await page.locator('button:visible,a:visible').all()){const bounds=await target.boundingBox();expect(bounds.width,await target.innerText()).toBeGreaterThanOrEqual(44);expect(bounds.height,await target.innerText()).toBeGreaterThanOrEqual(44);}};
    await checkTouchTargets();
    await page.locator('#about-button').click();await checkTouchTargets();await page.locator('#close-about').click();
    await page.screenshot({path:`qa/${name}.png`,fullPage:true});await context.close();
  });
}
test('reduced motion starts paused',async({page})=>{await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await expect(page.getByRole('button',{name:'Resume animation',exact:true})).toBeVisible();});
test('WebGL unavailable keeps illustration and usable state controls',async({browser})=>{const c=await browser.newContext();const p=await c.newPage();await p.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.startsWith('webgl'))return null;return original.call(this,type,...args);};});await p.goto('/');await expect(p.locator('body')).toHaveAttribute('data-scene-ready','fallback');await expect(p.locator('#scene-fallback')).toBeVisible();await p.locator('[data-state="waiting"].state-option').click();await expect(p.locator('#state-title')).toHaveText('Room to breathe');await c.close();});
test('status failure is explicit, still allows previews',async({page})=>{await page.route('**/status.json',route=>route.fulfill({status:503,body:'unavailable'}));await page.goto('/');await expect(page.locator('#status-source')).toHaveText('STATUS UNAVAILABLE');await page.locator('[data-state="focused"].state-option').click();await expect(page.locator('#status-source')).toHaveText('STATE PREVIEW');await page.locator('#return-button').click();await expect(page.locator('#status-source')).toHaveText('STATUS UNAVAILABLE');});
test('model failure is disclosed without blanking the room',async({page})=>{await page.route('**/dot-hunyuan.glb',route=>route.abort());await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-model','fallback');await page.locator('#about-button').click();await expect(page.locator('#asset-credit')).toContainText('could not load');});

test('phone touch gestures scroll normally, then orbit and pinch in Explore 3D',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-model','hunyuan',{timeout:30000});
  const session=await context.newCDPSession(page);
  const send=async(type,points)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((point,id)=>({...point,id,radiusX:2,radiusY:2}))});
  const gesture=async(start,end)=>{await send('touchStart',start);for(let step=1;step<=8;step++){await send('touchMove',start.map((point,index)=>({x:point.x+(end[index].x-point.x)*step/8,y:point.y+(end[index].y-point.y)*step/8})));await page.waitForTimeout(24);}await send('touchEnd',[]);await page.waitForTimeout(200);};
  const frameScene=async()=>{await page.locator('#scene').evaluate(element=>window.scrollTo(0,element.getBoundingClientRect().top+window.scrollY-160));return page.locator('#scene').boundingBox();};
  let box=await frameScene();const initialScroll=await page.evaluate(()=>scrollY);
  await expect(page.locator('#scene')).toHaveAttribute('data-interactive','false');
  await gesture([{x:box.x+box.width/2,y:box.y+box.height-45}],[{x:box.x+box.width/2,y:box.y+55}]);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(initialScroll+20);
  await page.locator('#explore-button').tap();await expect(page.locator('#scene')).toHaveAttribute('data-interactive','true');
  box=await frameScene();const exploreScroll=await page.evaluate(()=>scrollY);const canvas=page.locator('#scene canvas');const beforeOrbit=await canvas.screenshot();
  await gesture([{x:box.x+box.width*.3,y:box.y+box.height*.55}],[{x:box.x+box.width*.7,y:box.y+box.height*.4}]);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(exploreScroll);expect(Buffer.compare(beforeOrbit,await canvas.screenshot())).not.toBe(0);
  const center={x:box.x+box.width/2,y:box.y+box.height/2};const beforePinch=await canvas.screenshot();
  await gesture([{x:center.x-22,y:center.y},{x:center.x+22,y:center.y}],[{x:center.x-65,y:center.y},{x:center.x+65,y:center.y}]);
  expect(Buffer.compare(beforePinch,await canvas.screenshot())).not.toBe(0);await expect(page.locator('body')).toHaveAttribute('data-scene-ready','true');await expect(page.locator('body')).toHaveAttribute('data-model','hunyuan');
  await page.getByRole('button',{name:'Reset view',exact:true}).tap();await page.locator('#explore-button').tap();await expect(page.locator('#scene')).toHaveAttribute('data-interactive','false');expect(errors).toEqual([]);
  await page.screenshot({path:'qa/touch-exploration.png',fullPage:true});await context.close();
});
