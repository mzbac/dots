import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCommunityWorld,areaBounds,GIFT_LIMITS} from '../src/gifts.js';
import {createGardenCells,gardenCameraFrame,gardenCaption} from '../src/garden.js';
import * as THREE from 'three';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const before=JSON.parse(read('./fixtures/reference-world.json'));
const manifest=JSON.parse(read('../community/world.json'));
const registry=world=>Object.fromEntries(world.accepted.map(item=>[item.path,read('../'+item.path)]));
const baseline=loadCommunityWorld(JSON.stringify(before),registry(before));
const current=loadCommunityWorld(JSON.stringify(manifest),registry(manifest));
test('the reviewed nook grows the garden without moving original zones, slots or gifts',()=>{
 for(const key of ['zones','slots','protectedAreas','accepted'])assert.deepEqual(manifest[key].filter(item=>before[key].some(original=>original.id===item.id)),before[key]);
 const zone=manifest.zones.find(item=>item.id==='test-garden-nook');const slot=manifest.slots.find(item=>item.id==='test-nook-plot');assert.deepEqual(zone,{id:'test-garden-nook',origin:[-5.4,0,5.1],size:[20,32,20]});assert.deepEqual(slot,{id:'test-nook-plot',zone:'test-garden-nook',origin:[-5.2,.12,5.5],size:[16,20,12]});
 const originalBounds=areaBounds(before.zones[0]),newBounds=areaBounds(zone);assert.ok(Math.abs(originalBounds.min[0]-newBounds.max[0])<1e-9);
 assert.ok(manifest.zones.length<=GIFT_LIMITS.zones);assert.ok(manifest.slots.length<=GIFT_LIMITS.slots);
});
test('nook rendering is additive, finite, and stays in the existing garden budget',()=>{
 const oldCells=createGardenCells(baseline),newCells=createGardenCells(current);const counts=new Map();for(const cell of newCells){assert.ok(cell.every(Number.isFinite));const key=JSON.stringify(cell);counts.set(key,(counts.get(key)||0)+1);}
 for(const cell of oldCells){const key=JSON.stringify(cell);assert.ok(counts.get(key)>0,'Original cell preserved');counts.set(key,counts.get(key)-1);}
 assert.ok(newCells.length-current.totalBlocks<650,`${newCells.length-current.totalBlocks} trusted garden cells`);assert.ok(current.totalBlocks<=GIFT_LIMITS.visibleBlocks);assert.ok(newCells.length<650+GIFT_LIMITS.visibleBlocks);assert.ok(newCells.some(cell=>cell[0]===-4.4&&cell[2]===6.1&&cell[3]===2));
 assert.deepEqual(baseline.placements.map(p=>({id:p.gift.id,origin:p.origin})),current.placements.filter(p=>before.accepted.some(g=>g.id===p.gift.id)).map(p=>({id:p.gift.id,origin:p.origin})));
});

test('expanded garden framing reveals the side bed and fits desktop phone and fallback views',()=>{
 const original=gardenCameraFrame(createGardenCells(baseline));assert.deepEqual(original,{target:[0,1.05,6.65],position:[8.1,7.1,17.35]});
 const cells=createGardenCells(current);
 for(const [aspect,narrow]of[[1.25,false],[.90,true]]){
  const frame=gardenCameraFrame(cells,narrow);assert.deepEqual(frame.target,[-.7,1.05,6.65]);
  const camera=new THREE.PerspectiveCamera(33,aspect,.1,60);camera.position.set(...frame.position);camera.lookAt(...frame.target);camera.updateMatrixWorld();
  assert.ok(camera.position.distanceTo(new THREE.Vector3(...frame.target))<=18);
  for(const[x,y,z,w,h,d]of cells)for(const a of[-1,1])for(const b of[-1,1])for(const c of[-1,1]){const point=new THREE.Vector3(x+a*w/2,y+b*h/2,z+c*d/2).project(camera);assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1,'All geometry fits the default view');}
  const flower=new THREE.Vector3(-4.4,1.12,6.1).project(camera),tree=new THREE.Vector3(-2.7,1.16,8.44).project(camera);assert.ok(tree.x-flower.x>.15,'Side flower separates visibly from the original foreground tree');
 }
});
test('garden caption identifies every accepted gift without counting local previews',()=>{
 const single=gardenCaption(baseline);assert.equal(single.title,'A little welcome');
 const caption=gardenCaption(current);assert.equal(caption.title,'A garden made together');assert.equal(caption.byline,'2 gifts have a place here');
 for(const p of current.placements){assert.ok(caption.description.includes(p.gift.title));assert.ok(caption.description.includes(p.gift.creator));}
});
