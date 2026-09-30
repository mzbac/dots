import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STATES,validateStatus,statusAge} from '../src/state.js';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const code=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replaceAll('import.meta.env.BASE_URL',JSON.stringify('./'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(){
 const elements=new Map();const make=id=>({id,tagName:'DIV',dataset:{},hidden:false,firstElementChild:{},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){},showModal(){},close(){},getBoundingClientRect(){return{};}});
 const get=id=>{if(!elements.has(id))elements.set(id,make(id));return elements.get(id);};
 const buttons=Object.keys(STATES).map(state=>({...make(state),tagName:'BUTTON',dataset:{state}}));
 const doc={hidden:false,body:{dataset:{}},getElementById:get,querySelectorAll:()=>buttons,listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}};
 const requests=[];let value={schemaVersion:1,state:'checking',revision:2,updatedAt:'2026-09-30T09:21:51Z'};let interval;
 await new AsyncFunction('STATES','validateStatus','statusAge','createWorkshop','document','matchMedia','fetch','setInterval','location',code)(STATES,validateStatus,statusAge,async()=>({setState(){},setPaused(){},setInteractive(){}}),doc,()=>({matches:false,addEventListener(){}}),async(url,options)=>{requests.push({url,options});return{ok:true,json:async()=>value};},fn=>{interval=fn;},{hostname:'mzbac.github.io'});
 await tick();return{get,buttons,doc,requests,set:valueNew=>{value=valueNew;},poll:async()=>{interval();await tick();}};
}
test('visible Pages view refreshes from the public repository without reload',async()=>{const s=await setup();assert.equal(s.get('state-title').textContent,'A closer look');s.set({state:'waiting',revision:3,updatedAt:'2026-09-30T09:28:54Z'});await s.poll();assert.equal(s.get('state-title').textContent,'Room to breathe');assert.equal(s.requests.length,2);assert.match(s.requests[1].url,/^https:\/\/raw\.githubusercontent\.com\/mzbac\/dots\/main\/public\/status\.json\?v=\d+$/);assert.equal(s.requests[1].options.cache,'no-store');});
test('visitors have no mood selectors or state override controls',()=>{const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.doesNotMatch(html,/state-option|return-button|preview-label|Every state has a spark/);assert.doesNotMatch(code,/URLSearchParams|location.search|isPreview/);});
test('hidden pages pause polling and refresh when shown',async()=>{const s=await setup();s.doc.hidden=true;await s.poll();assert.equal(s.requests.length,1);s.doc.hidden=false;s.doc.listeners.visibilitychange();await tick();assert.equal(s.requests.length,2);});
