import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCommunityWorld,areaBounds,GIFT_LIMITS} from '../src/gifts.js';
import {createGardenCells} from '../src/garden.js';
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
