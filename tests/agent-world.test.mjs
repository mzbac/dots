import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,mkdirSync,cpSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {nextMood,formatGift} from '../src/agent-world.js';
import {parseGiftJson} from '../src/gifts.js';
import {decodeCreation} from '../src/experiment-engine.js';
import {decodeGroupShare} from '../src/group-project-engine.js';
import {createGroupGift,createGroupGiftProvenance} from '../src/group-gift.js';
import {validateGiftFile} from '../tools/validate-gifts.mjs';
import {run,experimentPlay,experimentRemix,groupCommand,mood} from '../tools/dot.mjs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
function home(){const root=mkdtempSync(join(tmpdir(),'dot-home-'));cpSync(new URL('../public',import.meta.url),join(root,'public'),{recursive:true});writeFileSync(join(root,'home.json'),read('home.json'));return root;}
const SITE='https://mzbac.github.io/dots/';
const decode=link=>decodeGroupShare(link.split('#project=')[1]);
function temporary(t){const root=mkdtempSync(join(tmpdir(),'dot-cli-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
const completeGroup=()=>groupCommand('cast',groupCommand('start',null,{},SITE).link,{approach:'experimental'},SITE).link;

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

test('a dot can play, share, remix and turn a group flower into a gift from the command line',async(t)=>{
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
  const directory=temporary(t),lines=[];
  await run(['gift','from-group',cast.link,'--out-dir',directory],{log:line=>lines.push(line)});
  const exported=JSON.parse(lines.pop());
  assert.equal(parseGiftJson(readFileSync(exported.file,'utf8')).size.join(','),'16,20,12');
  await run(['help'],{log:line=>lines.push(line)});
  for(const term of [/AGENTS\.md/,/--participant-id/,/--as <unique-name>/,/unverified/,/--out-dir/,/basename must/]) assert.match(lines[0],term);
});

test('join returns a stable, explicitly unverified participant ID usable in later CLI turns',async()=>{
  const lines=[];
  const start=groupCommand('start',null,{},SITE);
  await run(['group','join',start.link,'--name','Willow','--role','rhythm','--site',SITE],{log:line=>lines.push(line)});
  const joined=JSON.parse(lines.pop()),participant=decode(joined.link).participants.at(-1);
  assert.equal(joined.joined,'Willow');assert.equal(joined.participantId,participant.id);
  assert.match(joined.participantId,/^p[0-9a-f]{16}$/);assert.equal(joined.unverified,true);
  const later=groupCommand('join',joined.link,{name:'Rowan',role:'harmony'},SITE);
  await run(['group','play',later.link,'--participant-id',joined.participantId,'--rhythm','10011010','--site',SITE],{log:line=>lines.push(line)});
  const played=JSON.parse(lines.pop()),value=decode(played.link);
  assert.equal(played.participantId,joined.participantId);assert.equal(played.unverified,true);
  assert.deepEqual(value.participants.find(p=>p.id===joined.participantId),participant);
  assert.equal(value.contributions.at(-1).participantId,joined.participantId);
  assert.ok(value.participants.every(p=>p.unverified));
});

for(const duplicateName of ['Willow','willow']) test(`duplicate name ${duplicateName} cannot silently select the first participant`,()=>{
  const first=groupCommand('join',groupCommand('start',null,{},SITE).link,{name:'Willow',role:'rhythm'},SITE);
  const second=groupCommand('join',first.link,{name:duplicateName,role:'rhythm'},SITE);
  assert.notEqual(first.participantId,second.participantId);
  assert.throws(()=>groupCommand('play',second.link,{as:'WILLOW',rhythm:'10011010'},SITE),error=>{
    assert.match(error.message,/Ambiguous --as/);assert.match(error.message,/--participant-id/);
    assert.ok(error.message.includes(first.participantId));assert.ok(error.message.includes(second.participantId));return true;
  });
  for(const participantId of [first.participantId,second.participantId]) {
    const played=groupCommand('play',second.link,{'participant-id':participantId,rhythm:'10011010'},SITE);
    assert.equal(decode(played.link).contributions.at(-1).participantId,participantId);
  }
  assert.equal(decode(second.link).contributions.length,0);
});

test('a name colliding with an NPC requires an ID and credits the selected local participant',()=>{
  const joined=groupCommand('join',groupCommand('start',null,{},SITE).link,{name:'pip',role:'rhythm'},SITE);
  const npc=decode(joined.link).participants.find(p=>p.name==='Pip');
  assert.equal(npc.kind,'npc');assert.notEqual(npc.id,joined.participantId);
  assert.throws(()=>groupCommand('play',joined.link,{as:'PIP',rhythm:'10011010'},SITE),/Ambiguous --as/);
  const played=groupCommand('play',joined.link,{'participant-id':joined.participantId,rhythm:'10011010'},SITE);
  assert.equal(decode(played.link).contributions.at(-1).participantId,joined.participantId);
  assert.equal(decode(played.link).participants.find(p=>p.id===joined.participantId).kind,'local');
});

test('participant selectors reject missing, conflicting, malformed and absent IDs',async()=>{
  const joined=groupCommand('join',groupCommand('start',null,{},SITE).link,{name:'Willow',role:'rhythm'},SITE);
  for(const selectors of [{},{as:'Willow','participant-id':joined.participantId}]) {
    assert.throws(()=>groupCommand('play',joined.link,{...selectors,rhythm:'10011010'},SITE),/exactly one/);
  }
  for(const id of [true,'','Willow','p123','P1234567890abcdef','p1234567890abcdeg']) {
    assert.throws(()=>groupCommand('play',joined.link,{'participant-id':id,rhythm:'10011010'},SITE),/Invalid --participant-id/);
  }
  for(const name of [true,'',' ']) assert.throws(()=>groupCommand('play',joined.link,{as:name,rhythm:'10011010'},SITE),/--as needs/);
  const differentProject=groupCommand('start',null,{},SITE).link;
  assert.throws(()=>groupCommand('play',differentProject,{'participant-id':joined.participantId,rhythm:'10011010'},SITE),/No participant with ID/);
  await assert.rejects(run(['group','play',joined.link,'--participant-id','--rhythm','10011010']),/Invalid --participant-id/);
  await assert.rejects(run(['group','play',joined.link,'--as','Willow','--participant-id',joined.participantId,'--rhythm','10011010']),/exactly one/);
  assert.equal(decode(joined.link).contributions.length,0);
});

test('gift export chooses canonical filenames for directories, exact paths and default output',async(t)=>{
  const directory=temporary(t),link=completeGroup(),source=decode(link);
  const trustedRoot=join(directory,'trusted');mkdirSync(join(trustedRoot,'community'),{recursive:true});
  writeFileSync(join(trustedRoot,'community/world.json'),read('tests/fixtures/reference-world.json'));
  const expected=createGroupGift(source),provenance=createGroupGiftProvenance(source);
  const nested=join(directory,'new','gifts'),lines=[];
  await run(['gift','from-group',link,'--out-dir',nested],{log:line=>lines.push(line)});
  const exported=JSON.parse(lines.pop());
  assert.equal(exported.file,join(nested,`${expected.id}.json`));assert.equal(exported.id,expected.id);
  const validated=await validateGiftFile(exported.file,trustedRoot);
  assert.deepEqual(validated.gift,expected);assert.equal(validated.gift.id,provenance.giftId);
  const exact=join(directory,`${expected.id}.json`);
  await run(['gift','from-group',link,'--out',exact],{log:line=>lines.push(line)});
  assert.equal(JSON.parse(lines.pop()).file,exact);
  assert.equal(readFileSync(exact,'utf8'),readFileSync(exported.file,'utf8'));
  const defaultOutput=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('../tools/dot.mjs',import.meta.url)),'gift','from-group',link],{cwd:directory,encoding:'utf8'}));
  assert.equal(defaultOutput.file,`${expected.id}.json`);
  assert.deepEqual((await validateGiftFile(exact,trustedRoot)).gift,expected);
  assert.deepEqual(createGroupGiftProvenance(decode(link)),provenance);
});

test('invalid gift filenames and conflicting or missing output options fail before writing',async(t)=>{
  const directory=temporary(t),link=completeGroup(),gift=createGroupGift(decode(link));
  for(const filename of ['flower.json',`${gift.id}.JSON`,`${gift.id}.provenance.json`,'different-id.json']) {
    const file=join(directory,filename);writeFileSync(file,'keep this file');
    await assert.rejects(run(['gift','from-group',link,'--out',file]),error=>{
      assert.ok(error.message.includes(`${gift.id}.json`));assert.match(error.message,/--out-dir/);assert.match(error.message,/provenance/);return true;
    });
    assert.equal(readFileSync(file,'utf8'),'keep this file');
  }
  const uncreated=join(directory,'must-not-exist'),exact=join(directory,`${gift.id}.json`);
  await assert.rejects(run(['gift','from-group',link,'--out',exact,'--out-dir',uncreated]),/not both/);
  assert.equal(existsSync(uncreated),false);assert.equal(existsSync(exact),false);
  for(const option of ['--out','--out-dir']) {
    await assert.rejects(run(['gift','from-group',link,option]),/needs a/);
    await assert.rejects(run(['gift','from-group',link,option,'']),/needs a/);
  }
});

test('visits cost no CI runner: the only workflows are publishing and the manual gift preview',()=>{
  assert.deepEqual(readdirSync(new URL('../.github/workflows/',import.meta.url)).sort(),['pages.yml','preview-gift.yml']);
});
