import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import * as THREE from 'three';
import {loadCommunityWorld} from '../src/gifts.js';
import {createGardenCells,createGardenArtwork} from '../src/garden.js';
import {previewFile,giftPreviewSvg} from '../tools/preview-gift.mjs';
import {validateNeighbors} from '../src/neighbors.js';
const raw=readFileSync(new URL('../community/gifts/welcome-planter.json',import.meta.url),'utf8');
const community=loadCommunityWorld(readFileSync(new URL('../community/world.json',import.meta.url),'utf8'),{'community/gifts/welcome-planter.json':raw});
test('the original welcome gift is rendered through accepted data in a single garden batch',()=>{const scene=new THREE.Scene();const art=createGardenArtwork(scene,community);assert.equal(art.group.children.length,1);assert.equal(art.group.children[0].isInstancedMesh,true);assert.ok(art.cells.length<650);assert.ok(art.cells.every(cell=>cell.every(Number.isFinite)));assert.equal(community.placements.length,1);assert.equal(community.emptySlots.length,1);assert.equal(art.group.visible,false);});
test('garden and room bounds stay apart',()=>{const cells=createGardenCells(community);for(const[x,y,z,w,h,d]of cells)assert.ok(z-d/2>=3.8);});
test('trusted gift preview contains only static safe SVG',()=>{const svg=giftPreviewSvg(community.placements[0].gift);assert.match(svg,/<polygon/);assert.match(svg,/A little welcome/);assert.doesNotMatch(svg,/<script|href=|onload=|foreignObject|<image/);});
test('local preview refuses symlinks, oversized and malicious gifts',async()=>{const dir=mkdtempSync(join(tmpdir(),'gift-preview-'));const source=join(dir,'gift.json'),out=join(dir,'image.svg');writeFileSync(source,raw);await previewFile(source,out);assert.match(readFileSync(out,'utf8'),/<svg/);symlinkSync(source,join(dir,'link.json'));await assert.rejects(()=>previewFile(join(dir,'link.json'),out));writeFileSync(source,' '.repeat(65537));await assert.rejects(()=>previewFile(source,out));writeFileSync(source,raw.replace('A little welcome','<script>'));await assert.rejects(()=>previewFile(source,out));});
test('neighbours begin empty and links cannot execute or embed remote content',()=>{assert.deepEqual(validateNeighbors(JSON.parse(readFileSync(new URL('../community/neighbors.json',import.meta.url),'utf8'))),[]);const entry={id:'friend',name:'A friend',repository:'https://github.com/example/home',site:'https://example.github.io/home/',invitation:'https://github.com/example/home/issues/1'};assert.equal(validateNeighbors([entry]).length,1);for(const site of ['javascript:alert(1)','https://user:secret@example.com/','http://example.com/','https://127.0.0.1/','https://example.com/?token=x'])assert.throws(()=>validateNeighbors([{...entry,site}]));assert.throws(()=>validateNeighbors([{...entry,script:'run'}]));assert.throws(()=>validateNeighbors([entry,entry]));});
test('preview workflow is manual, read-only and never checks out a contribution',()=>{const workflow=readFileSync(new URL('../.github/workflows/preview-gift.yml',import.meta.url),'utf8');assert.match(workflow,/workflow_dispatch/);assert.match(workflow,/contents: read/);assert.match(workflow,/ref: main/);assert.match(workflow,/persist-credentials: false/);assert.doesNotMatch(workflow,/pull_request_target|workflow_run|secrets\.|pull-requests: write|pages: write|checkout.*head/);});

test('PR preview reads only pinned JSON blobs and writes inert artifacts',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pr-gift-preview-'));const tool=new URL('../tools/preview-pull-request.mjs',import.meta.url).href;const sha='a'.repeat(40),blob='b'.repeat(40);
 const responses={
  '/pulls/7':{state:'open',head:{sha,repo:{full_name:'example/home'}},changed_files:2},
  '/pulls/7/files?per_page=100':[{filename:'community/gifts/welcome-planter.json',status:'added',sha:blob},{filename:'package.json',status:'modified',sha:'c'.repeat(40)}],
  ['/git/commits/'+sha]:{tree:{sha:'d'.repeat(40)}},
  ['/git/trees/'+'d'.repeat(40)+'?recursive=1']:{truncated:false,tree:[{path:'community/gifts/welcome-planter.json',type:'blob',mode:'100644',sha:blob}]},
  ['/git/blobs/'+blob]:{encoding:'base64',size:Buffer.byteLength(raw),content:Buffer.from(raw).toString('base64')}
 };
 const harness=`const responses=${JSON.stringify(responses)};const calls=[];globalThis.fetch=async(url,options)=>{if(options.redirect!=='error')throw new Error('Redirects must be disabled');const path=String(url).split('repos/example/home')[1];if(!Object.hasOwn(responses,path))throw new Error('Unexpected resource '+path);calls.push(path);return new Response(JSON.stringify(responses[path]),{status:200});};await import(${JSON.stringify(tool)});if(calls.filter(p=>p.startsWith('/git/blobs/')).length!==1)throw new Error('Unexpected blob read');`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',harness],{cwd:dir,env:{...process.env,GITHUB_REPOSITORY:'example/home',PR_NUMBER:'7'},encoding:'utf8'});assert.equal(result.status,0,result.stderr);const report=JSON.parse(readFileSync(join(dir,'gift-preview/review.json'),'utf8'));assert.equal(report.headSha,sha);assert.deepEqual(report.otherChangedFiles,['package.json']);assert.doesNotMatch(readFileSync(join(dir,'gift-preview/welcome-planter.svg'),'utf8'),/<script|href=/);
});
