import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVoxelArtwork} from '../src/scene.js';
test('the room has one articulated dot and one movable chair',()=>{const scene=new THREE.Scene();const {rig}=createVoxelArtwork(scene);rig.controller.update('focused',0,{reducedMotion:true});let dots=0,chairs=0;scene.traverse(n=>{if(n.name==='dot')dots++;if(n.name==='dot-chair')chairs++;});assert.equal(dots,1);assert.equal(chairs,1);assert.equal(rig.controller.getDiagnostics().action,'seated-working');});
test('original room and action rig remain batched and texture-free',()=>{const scene=new THREE.Scene();createVoxelArtwork(scene);let batches=0,cells=0;scene.traverse(node=>{if(node.isMesh){assert.equal(node.isInstancedMesh,true);batches++;cells+=node.count;assert.equal(node.material.map,null);}});assert.ok(batches<=25,`${batches} batches`);assert.ok(cells<6000,`${cells} blocks`);});
