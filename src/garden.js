import * as THREE from 'three';
import {giftToInstances} from './gifts.js';

// The garden shares the gift renderer's bounded, local box data.
export function createGardenCells(community){
  const cells=[];const add=(x,y,z,w,h,d,c)=>cells.push([x,y,z,w,h,d,c]);
  add(0,-.08,6.65,6.8,.28,5.3,0x809883);
  for(let x=0;x<23;x++)for(let z=0;z<18;z++)add(-3.25+x*.29,.075,4.15+z*.29,.286,.09,.286,(x+z)%7?0xb9c79b:0xa6bb8c);
  for(let z=0;z<13;z++)add(0,.13,4.65+z*.34,.88,.08,.29,z%2?0xe1c995:0xd7bc84);
  for(let x=0;x<18;x++)add(-3.18+x*.375,.62,4.03,.16,1.02,.13,0xc49a63);
  add(0,.42,4.06,6.7,.10,.12,0x9a8053);add(0,.87,4.06,6.7,.10,.12,0x9a8053);
  for(const x of [-3.28,3.28]){for(let z=0;z<12;z++)add(x,.49,4.35+z*.41,.13,.76,.15,0xd3b37d);add(x,.56,6.62,.12,.10,5.1,0xaf935e);}
  for(const x of [-1.75,-.95])add(x,.31,4.75,.13,.39,.50,0x6f7a55);
  for(let z=0;z<3;z++)add(-1.35,.55,4.60+z*.15,1.22,.13,.13,0xc49a63);
  for(const x of [-1.88,-.82])add(x,.83,4.48,.12,.65,.12,0x92704b);
  add(-1.35,1.03,4.48,1.23,.16,.12,0xd3b37d);add(-1.35,.82,4.48,1.23,.14,.12,0xd3b37d);
  for(const [x,z] of [[2.45,4.82],[-2.70,8.44]]){
    add(x,.54,z,.16,.82,.16,0x8d7450);
    add(x,1.16,z,.64,.60,.64,0x78965c);add(x,1.57,z,.45,.30,.45,0x91aa6d);
    add(x,.17,z,.75,.11,.75,0x9baf79);
  }
  for(const slot of [...community.placements.map(p=>p.slot),...community.emptySlots]){
    const [x,y,z]=slot.origin;const [w,,d]=slot.size.map(v=>v*.1);
    add(x+w/2,y-.020,z+d/2,w,.032,d,0xd5bb82);
    add(x+w/2,y-.004,z+d/2,w-.10,.012,d-.10,0x9a885b);
  }
  for(const p of community.placements)cells.push(...giftToInstances(p.gift,p.origin));
  return cells;
}
export function createGardenArtwork(scene,community){
  const group=new THREE.Group();group.name='front-garden';const cells=createGardenCells(community);
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95}),cells.length);
  const obj=new THREE.Object3D(),color=new THREE.Color();
  cells.forEach(([x,y,z,w,h,d,tint],i)=>{obj.position.set(x,y,z);obj.scale.set(w,h,d);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);mesh.setColorAt(i,color.setHex(tint));});
  mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);group.visible=false;scene.add(group);return{group,cells,dispose(){scene.remove(group);mesh.geometry.dispose();mesh.material.dispose();}};
}
export function drawGardenStill(canvas,cells){
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const width=900,height=720;canvas.width=width;canvas.height=height;ctx.clearRect(0,0,width,height);
  const camera=new THREE.PerspectiveCamera(33,width/height,.1,60);camera.position.set(8.1,7.1,17.35);camera.lookAt(0,1.05,6.65);camera.updateMatrixWorld();
  const project=(x,y,z)=>{const p=new THREE.Vector3(x,y,z).project(camera);return[(p.x+1)*width/2,(1-p.y)*height/2];};
  const faces=[];const shade=(hex,amount)=>{const c=new THREE.Color(hex);c.multiplyScalar(amount);return`#${c.getHexString()}`;};
  for(const [x,y,z,w,h,d,c] of cells){const a=x-w/2,b=x+w/2,l=y-h/2,t=y+h/2,n=z-d/2,f=z+d/2;
    for(const [vertices,light] of [[[[a,t,n],[a,t,f],[b,t,f],[b,t,n]],1.08],[[[a,l,f],[b,l,f],[b,t,f],[a,t,f]],.90],[[[b,l,n],[b,t,n],[b,t,f],[b,l,f]],.73]]){
      const middle=vertices.reduce((v,p)=>v.add(new THREE.Vector3(...p)),new THREE.Vector3()).multiplyScalar(.25).applyMatrix4(camera.matrixWorldInverse);
      faces.push({ground:y+h/2<=.201,height:y+h/2,platform:w>6&&d>5,depth:middle.z,points:vertices.map(p=>project(...p)),fill:shade(c,light)});
    }
  }
  faces.sort((a,b)=>Number(b.platform)-Number(a.platform)||Number(b.ground)-Number(a.ground)||(a.ground&&b.ground?a.height-b.height:0)||a.depth-b.depth);for(const face of faces){ctx.beginPath();face.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=face.fill;ctx.fill();}
}
