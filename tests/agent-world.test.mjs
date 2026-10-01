import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,cpSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {nextMood,formatGift} from '../src/agent-world.js';
import {parseGiftJson} from '../src/gifts.js';
import {decodeCreation} from '../src/experiment-engine.js';
import {decodeGroupShare} from '../src/group-project-engine.js';
import {run,experimentPlay,experimentRemix,groupCommand,mood} from '../tools/dot.mjs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
function home(){const root=mkdtempSync(join(tmpdir(),'dot-home-'));cpSync(new URL('../public',import.meta.url),join(root,'public'),{recursive:true});writeFileSync(join(root,'home.json'),read('home.json'));return root;}
const SITE='https://mzbac.github.io/dots/';

test('moods only move forward and must be a known state',()=>{
  const next=nextMood({revision:22},'focused',{ownerRepository:'mzbac/dots',now:Date.UTC(2026,9,1,1,2,3,456)});
  assert.deepEqual(next,{schemaVersion:1,state:'focused',revision:23,updatedAt:'2026-10-01T01:02:03Z',ownerRepository:'mzbac/dots'});
  assert.throws(()=>nextMood({revision:1},'partying',{ownerRepository:'mzbac/dots'}));
  assert.throws(()=>nextMood({revision:1},'resting',{ownerRepository:'not a repo'}));
  const root=home();const before=JSON.parse(readFileSync(join(root,'public/status.json'),'utf8'));
  assert.equal(mood('resting',{root}).revision,before.revision+1);assert.throws(()=>mood('sleepy',{root}));
});

test('gift text keeps the hand-written layout',()=>{
  assert.equal(formatGift(parseGiftJson(read('community/gifts/welcome-planter.json'))),read('community/gifts/welcome-planter.json'));
});

test('a dot can play, share, remix and turn a group flower into a gift from the command line',async()=>{
  const played=experimentPlay({intention:'wander',rhythm:'10100110'},SITE);
  assert.deepEqual(played.experiences,['grow-walk','compose-beat']);
  const flower=decodeCreation(played.link.split('#flower=')[1]);
  const remix=decodeCreation(experimentRemix(played.link,{rhythm:'11001010'},SITE).link.split('#flower=')[1]);
  assert.equal(remix.stage,'remix');assert.equal(remix.parentId,flower.id);
  let link=groupCommand('start',null,{},SITE).link;
  link=groupCommand('join',link,{name:'Willow',role:'rhythm'},SITE).link;
  link=groupCommand('play',link,{as:'willow',rhythm:'10011010'},SITE).link;
  const cast=groupCommand('cast',link,{approach:'experimental'},SITE);
  assert.equal(cast.completed,true);
  assert.ok(decodeGroupShare(cast.link.split('#project=')[1]).participants.some(p=>p.name==='Willow'));
  assert.throws(()=>groupCommand('play',link,{as:'Nobody',rhythm:'10011010'},SITE),/No participant/);
  assert.throws(()=>experimentRemix(played.link,{rhythm:'12'},SITE),/eight steps/);
  const out=join(mkdtempSync(join(tmpdir(),'dot-gift-')),'flower.json');
  await run(['gift','from-group',cast.link,'--out',out],{log:()=>{}});
  assert.equal(parseGiftJson(readFileSync(out,'utf8')).size.join(','),'16,20,12');
  const lines=[];await run(['help'],{log:line=>lines.push(line)});assert.match(lines[0],/AGENTS\.md/);
});

test('visits cost no CI runner: the only workflows are publishing and the manual gift preview',()=>{
  assert.deepEqual(readdirSync(new URL('../.github/workflows/',import.meta.url)).sort(),['pages.yml','preview-gift.yml']);
});
