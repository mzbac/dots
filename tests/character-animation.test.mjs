import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVoxelCharacter,sampleCharacterPose,applyCharacterPose,groundHeight,CHARACTER_LAYOUT} from '../src/character-animation.js';
const states=['building','focused','checking','waiting','resting'];
const finite=value=>{if(typeof value==='number')assert.ok(Number.isFinite(value));else if(Array.isArray(value))value.forEach(finite);else if(value&&typeof value==='object')Object.values(value).forEach(finite);};
const create=()=>{const scene=new THREE.Scene(),rig=createVoxelCharacter(scene);return {scene,rig,controller:rig.controller};};
const boxFor=(obj)=>new THREE.Box3().setFromObject(obj);
const desk=new THREE.Box3(new THREE.Vector3(-2.3,1.20,-1.65),new THREE.Vector3(1.1,1.359,-.35));
const monitor=new THREE.Box3(new THREE.Vector3(-1.465,1.555,-1.18),new THREE.Vector3(.085,2.465,-1.06));
const lamp=new THREE.Box3(new THREE.Vector3(.105,1.375,-1.535),new THREE.Vector3(.713,2.39,-1.125));

test('seated poses put pelvis on chair, feet on footrest, and hands over real keys',()=>{
 for(const state of ['building','focused','resting'])for(const t of [0,.3,2,7]){
  const p=sampleCharacterPose(state,t);assert.equal(p.action,state==='resting'?'seated-rest':'seated-working');assert.equal(p.root.x,CHARACTER_LAYOUT.seat.x);assert.equal(p.root.z,CHARACTER_LAYOUT.seat.z);assert.ok(Math.abs(p.root.y-.095-CHARACTER_LAYOUT.seatTop)<1e-9);
  p.feet.forEach(f=>assert.ok(Math.abs(f.y-.08-CHARACTER_LAYOUT.footrestTop)<1e-9));
  p.knees.forEach((k,i)=>{assert.ok(Math.abs(k.y-p.root.y)<.02);assert.ok(k.z<p.root.z-.3);assert.ok(k.y-p.feet[i].y>.28);});
  if(state!=='resting')p.hands.forEach(h=>{assert.ok(h.x> -1.11&&h.x<-.27);assert.ok(h.z>-.805&&h.z<-.495);assert.ok(h.y-.045>=1.440);assert.ok(h.y<1.54);});
 }
});
test('focused mesh arms, body and head clear desk, monitor and lamp',()=>{
 const {scene,rig}=create();for(let t=0;t<3;t+=.05){applyCharacterPose(rig,sampleCharacterPose('focused',t));scene.updateMatrixWorld(true);
 for(const part of [rig.body,rig.head,...rig.arms.flatMap(a=>[a.upper,a.lower,a.hand])])for(const obstacle of [desk,monitor,lamp])assert.equal(boxFor(part).intersectsBox(obstacle),false,part.name+' furniture collision');}
});
test('all deterministic states use finite transforms and supported feet',()=>{
 const {scene,rig}=create();for(const state of states)for(let t=0;t<25;t+=.125){const p=sampleCharacterPose(state,t);finite(p);applyCharacterPose(rig,p);scene.updateMatrixWorld(true);rig.mascot.traverse(o=>{o.matrixWorld.elements.forEach(n=>assert.ok(Number.isFinite(n)));});
 p.feet.forEach(f=>assert.ok(f.y-.08>=groundHeight(f.x,f.z)-1e-6));
 if(state==='waiting'){assert.ok(p.root.x> .8&&p.root.x<2.4);assert.ok(p.root.z>.1&&p.root.z<2);assert.equal(boxFor(rig.mascot).intersectsBox(monitor),false);}
 }
});
test('rig is compact instanced original geometry, with no textures or external assets',()=>{
 const {rig}=create();let batches=0,voxels=0;rig.mascot.traverse(o=>{if(o.isMesh){assert.ok(o.isInstancedMesh);assert.equal(o.material.map,null);batches++;voxels+=o.count;}});assert.ok(batches<=22,`${batches} batches`);assert.ok(voxels<3500,`${voxels} voxels`);assert.ok(rig.laptop.children.length>1);
});
test('every state transition finishes safely, including return from walking to sitting',()=>{
 for(const from of states)for(const to of states){const {rig,controller}=create();controller.setState(from,{immediate:true});let previous={...controller.pose.root},laptopSeen=false;
 for(let n=0;n<1600;n++){const p=controller.update(to,.025);finite(p);assert.ok(distance(previous,p.root)<.06,`${from}→${to} teleported`);previous={...p.root};p.feet.forEach(f=>assert.ok(f.y-.08>=groundHeight(f.x,f.z)-.018,`${from}→${to}: foot under surface ${f.y}`));
 assert.ok(p.root.x> -1.4&&p.root.x<2.5&&p.root.z>-.15&&p.root.z<2.1);if(p.laptop>.99)laptopSeen=true;
 }
 assert.equal(controller.state,to);if(['focused','building','resting'].includes(to)){assert.equal(controller.mode,'seated',`${from}→${to}`);assert.ok(Math.abs(controller.pose.root.z-.18)<1e-8);}if(to==='checking')assert.ok(laptopSeen,`${from}→${to}: no laptop`);
 }
});
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);}
test('reduced motion selects an appropriate deterministic static pose for every state',()=>{
 const {controller}=create();for(const state of states){controller.update(state,100,{reducedMotion:true});const before=structuredClone(controller.pose);controller.update(state,100,{reducedMotion:true});assert.deepEqual(controller.pose,before);assert.equal(controller.transition,null);assert.equal(controller.route,null);assert.equal(controller.pose.laptop,state==='checking'?1:0);}
});
test('large resume deltas are capped and rapid feed updates keep transforms continuous',()=>{
 const {controller}=create();for(let n=0;n<800;n++){const old={...controller.pose.root};const p=controller.update(states[Math.floor(n/17)%states.length],n%19===0?60:.025);finite(p);assert.ok(distance(old,p.root)<.1);}
});

test('walking restarts smoothly and stance feet stay planted through contact',()=>{
 const {controller}=create();let previous=structuredClone(controller.pose),contacts=0;
 for(let n=0;n<3000;n++){
  const p=controller.update('waiting',.025);
  p.feet.forEach((f,i)=>{const old=previous.feet[i],delta=distance(f,old);assert.ok(delta<.06,`Foot popped by ${delta}`);if(p.action==='walking'&&previous.action==='walking'&&Math.abs(f.y-groundHeight(f.x,f.z)-.08)<1e-7&&delta<1e-10)contacts++;});
  previous=structuredClone(p);
 }
 assert.ok(contacts>1000,`${contacts} planted-foot samples`);
});

test('stand and sit transitions do not pass leg voxels through the seat',async()=>{
 const {OBB}=await import('three/addons/math/OBB.js');const {scene,rig,controller}=create();const instance=new THREE.Matrix4(),world=new THREE.Matrix4();
 for(const state of ['waiting','focused','checking','resting'])for(let t=0;t<15;t+=.025){
  const p=controller.update(state,.025);scene.updateMatrixWorld(true);
  const seat=new THREE.Box3(new THREE.Vector3(-1.125,.79,p.chairZ-.24),new THREE.Vector3(-.255,.929,p.chairZ+.24));
  for(const part of [rig.pelvis,...rig.legs.flatMap(l=>[l.upper,l.lower,l.knee,l.foot])]){
   if(!boxFor(part).intersectsBox(seat))continue;
   part.traverse(mesh=>{if(!mesh.isInstancedMesh)return;for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,instance);world.multiplyMatrices(mesh.matrixWorld,instance);const cell=new OBB(new THREE.Vector3(),new THREE.Vector3(.5,.5,.5)).applyMatrix4(world);assert.equal(cell.intersectsBox3(seat,1e-7),false,`${state} at ${t}: ${part.name} clips seat`);}});
  }
 }
});


test('compact toy legs keep their lengths through a full action cycle',()=>{
 const {controller,rig}=create();assert.equal(rig.legs[0].upper.userData.restLength,.335);assert.equal(rig.legs[0].lower.userData.restLength,.30);
 for(const state of ['waiting','checking','focused','resting'])for(let i=0;i<1000;i++){const p=controller.update(state,.025);p.feet.forEach((foot,j)=>{const knee=p.knees[j],shin=distance(foot,knee);assert.ok(shin<.306,`${state}: stretched shin ${shin}`);});}
});
