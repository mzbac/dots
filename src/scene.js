import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STATES } from './state.js';
import {createVoxelCharacter} from './character-animation.js';
import {createGardenArtwork} from './garden.js';

// All art is original code-native voxel geometry. No model files or asset services.
const C={floor:0xcbd2ad,edge:0x809883,wall:0x49765f,side:0xbcc5a2,wood:0xc49a63,darkwood:0x92704b,ink:0x263e31,cream:0xffdaa0,orange:0xe97828,flame:0xffac29,yellow:0xffdd59};
function voxelBatch(parent, cells, emissive=false) {
  if(!cells.length)return null;
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,metalness:0,emissive:emissive?0xffffff:0x000000,emissiveIntensity:emissive?.16:0});
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,cells.length);
  const object=new THREE.Object3D();const color=new THREE.Color();
  cells.forEach((cell,i)=>{const [x,y,z,w,h,d,tint]=cell;object.position.set(x,y,z);object.scale.set(w,h,d);object.updateMatrix();mesh.setMatrixAt(i,object.matrix);mesh.setColorAt(i,color.setHex(tint));});
  mesh.castShadow=!emissive;mesh.receiveShadow=true;mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;parent.add(mesh);return mesh;
}
function painter(parent){const cells=[];return{add(x,y,z,w,h,d,c){cells.push([x,y,z,w,h,d,c]);},solid(x,y,z,w,h,d,c,s=.16){const nx=Math.max(1,Math.round(w/s)),ny=Math.max(1,Math.round(h/s)),nz=Math.max(1,Math.round(d/s));for(let ix=0;ix<nx;ix++)for(let iy=0;iy<ny;iy++)for(let iz=0;iz<nz;iz++){// Only the outer skin is needed for opaque block forms.
  if(ix>0&&ix<nx-1&&iy>0&&iy<ny-1&&iz>0&&iz<nz-1)continue;
  cells.push([x-w/2+(ix+.5)*w/nx,y-h/2+(iy+.5)*h/ny,z-d/2+(iz+.5)*d/nz,w/nx*.985,h/ny*.985,d/nz*.985,c]);}},finish(emissive=false){return voxelBatch(parent,cells,emissive);}};}


export function createVoxelArtwork(scene){
  const room=new THREE.Group();scene.add(room);const p=painter(room);
  // Two thousand-ish colored blocks, batched into one static draw call.
  p.add(0,-.15,0,6.8,.32,5.3,C.edge);p.add(0,-.31,0,6.65,.06,5.14,0x4f765d);
  for(let x=0;x<34;x++)for(let z=0;z<26;z++)p.add(-3.3+x*.2,.06,-2.5+z*.2,.197,.12,.197,((x*7+z*11)%17<4)?0xbfcaa2:C.floor);
  p.solid(0,1.62,-2.57,6.7,3.14,.16,C.wall,.2);p.solid(-3.32,1.62,0,.16,3.14,5.2,C.side,.2);
  p.add(0,.23,-2.43,6.6,.10,.13,0x2f5b43);p.add(-3.2,.23,0,.1,.1,5.1,0x91a282);
  // A pixel-circle window and its honey-colored crossbars.
  for(let x=-4;x<=4;x++)for(let y=-4;y<=4;y++){const dist=x*x+y*y;if(dist>19)continue;p.add(1.65+x*.15,2.05+y*.15,-2.45,.149,.149,.12,dist>12?0xddc58e:0xaec7a4);}
  p.add(1.65,2.05,-2.33,.06,1.24,.09,0xe3c992);p.add(1.65,2.05,-2.33,1.24,.06,.09,0xe3c992);
  p.add(1.9,2.3,-2.30,.22,.22,.035,0xffe4a0);
  // Floating shelf and chunky books.
  p.solid(-1.43,2.5,-2.16,1.86,.13,.46,C.wood,.12);
  [0xdaaa72,0xa7be8b,0xf0dca4,0x8ca489,0xce8b56].forEach((c,i)=>{p.solid(-2.11+i*.22,2.76,-2.13,.18,.38+i%2*.08,.29,c,.10);p.add(-2.11+i*.22,2.78,-1.978,.11,.028,.013,0xf8e6bb);});
  p.add(-.64,2.66,-2.1,.18,.21,.20,0xd6b789);p.add(-.64,2.86,-2.1,.19,.22,.18,0x85a368);
  // Tiny framed pixel spark on the side wall.
  p.add(-3.19,1.96,-.28,.12,.85,.70,C.wood);p.add(-3.12,1.96,-.28,.045,.70,.55,0xebdeba);
  for(const [dy,dz]of [[0,0],[.12,0],[-.12,0],[0,.12],[0,-.12]])p.add(-3.089,1.96+dy,-.28+dz,.022,.095,.095,0x8fa078);
  // Wooden desk and the drawers under it.
  p.solid(-.60,1.28,-1.0,3.40,.16,1.30,C.wood,.17);p.add(-.60,1.16,-1.0,3.25,.08,1.19,C.darkwood);
  for(const x of [-2.05,.85])for(const z of [-1.47,-.56])p.solid(x,.66,z,.13,1.04,.13,0x6d7456,.13);
  p.solid(-1.78,.83,-1.02,.67,.72,.85,0xb39a6d,.16);for(let i=0;i<2;i++){p.add(-1.78,.62+i*.31,-.578,.60,.026,.015,0x807553);p.add(-1.78,.75+i*.29,-.56,.20,.033,.04,0x6e7858);}
  // Computer, keyboard, notebook, pencil, all little blocks.
  p.add(-.69,1.4,-1.15,.66,.055,.38,0x3f5942);p.add(-.69,1.64,-1.17,.12,.42,.12,0x3f5942);
  p.solid(-.69,2.01,-1.12,1.55,.91,.12,0x2d4936,.15);p.add(-.69,2.035,-1.047,1.38,.74,.02,0x153124);
  const screenGroup=new THREE.Group();room.add(screenGroup);const sp=painter(screenGroup);
  const screenBars=[];for(let i=0;i<6;i++){const w=[.64,.94,.49,.80,.55,.98][i];screenBars.push([-.69-.48+w/2,2.30-i*.09,-1.028,w,.033,.021,i%2?0x9dce91:0xf0c176]);}const screen=voxelBatch(screenGroup,screenBars,true);
  p.add(-.69,1.40,-.65,.84,.05,.31,0x77906a);for(let x=0;x<9;x++)for(let z=0;z<3;z++)p.add(-1.02+x*.08,1.438,-.75+z*.09,.061,.017,.065,0xc9d6ab);
  p.add(-.03,1.42,-.65,.11,.055,.17,0x738b65);p.add(-1.82,1.405,-.72,.40,.07,.49,0x769273);p.add(-1.82,1.449,-.72,.35,.017,.43,0xf1dfb3);p.add(-1.66,1.47,-.72,.025,.024,.35,0xc18144);
  // A stair-stepped brass lamp, with a warm square of light.
  p.add(.67,1.4,-1.36,.32,.05,.29,0x9f925b);p.solid(.69,1.86,-1.36,.045,.85,.045,0xb7a567,.12);
  for(let i=0;i<4;i++)p.add(.68-i*.10,2.27+i*.045,-1.36,.12,.05,.07,0xb7a567);
  p.add(.34,2.35,-1.33,.23,.08,.23,0xe4c581);p.add(.34,2.27,-1.33,.37,.09,.35,0xe4c581);p.add(.34,2.20,-1.33,.47,.055,.41,0xe4c581);p.add(.34,2.16,-1.33,.29,.024,.25,0xffe9a7);
  const lamp=new THREE.PointLight(0xffda91,3,3,2);lamp.position.set(.34,2.05,-1.33);scene.add(lamp);
  // Woven square pixel rug and play blocks.
  for(let x=-5;x<=5;x++)for(let z=-5;z<=5;z++)p.add(-1.02+x*.15,.134,.62+z*.15,.148,.025,.148,(Math.abs(x)===5||Math.abs(z)===5||((x+z)%2===0))?0xddbf79:0xe8d18f);
  p.solid(.02,.25,1.8,.28,.28,.28,0x9fb582,.14);p.solid(.34,.25,1.82,.28,.28,.28,0xb88a54,.14);p.solid(.21,.53,1.82,.28,.28,.28,0xdbaa5f,.14);
  p.add(-.52,.142,1.69,.50,.025,.35,0xe8dfb9);for(let i=0;i<3;i++)p.add(-.55,.157,1.59+i*.09,.30,.008,.023,0xa4b78c);
  // A voxel succulent, never a downloaded model.
  const plantX=-2.40,plantZ=1.37;p.solid(plantX,.38,plantZ,.48,.47,.48,0xbf9969,.12);p.add(plantX,.66,plantZ,.55,.08,.55,0xd7b985);p.add(plantX,.70,plantZ,.41,.025,.41,0x6f6547);
  p.solid(plantX,1.01,plantZ,.11,.63,.11,0x5b8249,.10);
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const dx=Math.cos(a),dz=Math.sin(a);for(let j=1;j<=3;j++)p.add(plantX+dx*j*.11,.85+j*.075+(i%2)*.15,plantZ+dz*j*.11,.19,.18,.19,i%2?0x8ea761:0x739a52);}
  p.add(plantX,1.34,plantZ,.24,.25,.24,0xa2b477);
  // Side cabinet and an original miniature voxel 3D printer.
  p.solid(2.60,.54,-1.28,.82,.78,.65,0x90a680,.16);p.add(2.60,.99,-1.28,.94,.10,.75,0xcbb286);
  for(let i=0;i<2;i++){p.add(2.60,.48+i*.31,-.945,.68,.022,.02,0x648468);p.add(2.60,.61+i*.30,-.92,.14,.035,.035,0xd8bd7f);}
  p.add(2.60,1.10,-1.28,.62,.12,.58,0xe0d1a2);p.add(2.60,1.18,-1.24,.45,.07,.40,0x527764);
  for(const x of [2.34,2.86])p.solid(x,1.44,-1.48,.075,.65,.075,0x719079,.10);
  p.add(2.60,1.75,-1.48,.59,.08,.10,0x719079);p.add(2.60,1.58,-1.47,.51,.055,.07,0xd0bd80);p.add(2.60,1.53,-1.41,.14,.14,.15,0xe18b46);p.add(2.60,1.31,-1.23,.16,.20,.16,0xe5a556);
  p.add(2.86,1.19,-.99,.15,.13,.06,0x537766);p.add(2.86,1.20,-.951,.10,.06,.023,0xb7d895);
  p.finish();
  const rig=createVoxelCharacter(room);rig.controller.update('focused',0,{reducedMotion:true});
  const sparkGroup=new THREE.Group();room.add(sparkGroup);const sparkCells=Array.from({length:6},()=>[0,0,0,.045,.045,.045,0xffc342]);const sparks=voxelBatch(sparkGroup,sparkCells,true);const sparkTransform=new THREE.Object3D();
  room.name='workshop';
  return {room,rig,screen,sparks,sparkTransform,lamp};
}

export async function createWorkshop(host,callbacks,{community=null,characterPalette='amber'}={}){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  host.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-hidden','true');renderer.domElement.className='workshop-canvas';
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();renderer.setAnimationLoop(null);callbacks.onContextLost();});
  const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(33,1,.1,60);const target=new THREE.Vector3(0,1.15,0);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(target);controls.enableDamping=true;controls.dampingFactor=.1;controls.enablePan=false;controls.minDistance=8;controls.maxDistance=18;controls.minPolarAngle=Math.PI*.19;controls.maxPolarAngle=Math.PI*.47;controls.minAzimuthAngle=-Math.PI*.17;controls.maxAzimuthAngle=Math.PI*.46;controls.rotateSpeed=.65;controls.zoomSpeed=.7;
  const ambient=new THREE.HemisphereLight(0xfff6d7,0x65856f,2.5);scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xffe1b5,3.8);sun.position.set(-3,8,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-5;sun.shadow.camera.right=5;sun.shadow.camera.top=5;sun.shadow.camera.bottom=-5;sun.shadow.normalBias=.03;scene.add(sun);
  const fill=new THREE.DirectionalLight(0xc6eac5,1.7);fill.position.set(5,5,-2);scene.add(fill);
  const moodLight=new THREE.PointLight(0xffba70,5,6,2);moodLight.position.set(.63,2.7,-.3);scene.add(moodLight);
  const {room,rig,screen,sparks,sparkTransform,lamp}=createVoxelArtwork(scene);
  let garden=community?createGardenArtwork(scene,community):null;let view='workshop';
  if(characterPalette!=='amber'){const offset=characterPalette==='rose'?-.12:.32;const color=new THREE.Color();rig.mascot.traverse(object=>{if(!object.isInstancedMesh||!object.instanceColor)return;for(let i=0;i<object.count;i++){object.getColorAt(i,color);const hsl={};color.getHSL(hsl);if(hsl.s>.22&&hsl.l>.12){color.offsetHSL(offset,0,0);object.setColorAt(i,color);}}object.instanceColor.needsUpdate=true;});}
  const flameTip=new THREE.Vector3();let initialStateApplied=false;
  let state='focused',paused=false,dirty=true,elapsed=0,lastTime=0;controls.addEventListener('change',()=>{dirty=true;});
  function reset(){const narrow=host.clientWidth<440;target.set(0,view==='garden'?1.05:1.15,view==='garden'?6.65:0);camera.position.set(narrow?8.8:8.1,narrow?7.7:7.1,(narrow?11.7:10.7)+target.z);controls.target.copy(target);sun.position.set(target.x-3,8,target.z+5);sun.target.position.copy(target);scene.add(sun.target);controls.update();dirty=true;}
  function resize(){renderer.setSize(host.clientWidth,host.clientHeight,false);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();dirty=true;}
  new ResizeObserver(resize).observe(host);resize();reset();
  host.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(event.key))return;event.preventDefault();if(event.key==='Home'){reset();return;}const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));if(event.key==='ArrowLeft')spherical.theta-=.1;if(event.key==='ArrowRight')spherical.theta+=.1;if(event.key==='ArrowUp')spherical.phi-=.07;if(event.key==='ArrowDown')spherical.phi+=.07;if(event.key==='+'||event.key==='=')spherical.radius*=.92;if(event.key==='-')spherical.radius*=1.08;spherical.phi=THREE.MathUtils.clamp(spherical.phi,controls.minPolarAngle,controls.maxPolarAngle);spherical.theta=THREE.MathUtils.clamp(spherical.theta,controls.minAzimuthAngle,controls.maxAzimuthAngle);spherical.radius=THREE.MathUtils.clamp(spherical.radius,controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();dirty=true;});
  const stateColor=new THREE.Color(STATES[state].light),targetColor=new THREE.Color();
  renderer.setAnimationLoop(time=>{
    if(document.hidden){lastTime=time;return;}controls.update();if(paused&&!dirty){lastTime=time;return;}if(time-lastTime<32&&!dirty)return;dirty=false;const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;if(!paused)elapsed+=dt;
    const t=elapsed*STATES[state].speed,resting=state==='resting',focused=state==='focused',checking=state==='checking',waiting=state==='waiting';
    if(!paused)rig.controller.update(state,dt,{reducedMotion:false});
    flameTip.set(0,.93,0);rig.flame.localToWorld(flameTip);
    moodLight.position.set(flameTip.x,flameTip.y-.15,flameTip.z+.30);
    targetColor.set(STATES[state].light);stateColor.lerp(targetColor,paused?1:.04);moodLight.color.copy(stateColor);moodLight.intensity=resting?1.8:4.5+Math.sin(t*2)*.2;
    sun.intensity=THREE.MathUtils.lerp(sun.intensity,resting?2.2:3.8,paused?1:.04);ambient.intensity=THREE.MathUtils.lerp(ambient.intensity,resting?1.9:2.5,paused?1:.04);lamp.intensity=view==='garden'?0:resting?1.8:3;
    screen.material.emissive.set(STATES[state].screen);screen.material.emissiveIntensity=resting?.05:.2;
    for(let i=0;i<6;i++){const phase=(t*.2+i/6)%1;sparkTransform.position.set(flameTip.x+Math.sin(i*6+t*.3)*(.12+phase*.15),flameTip.y+phase*.3,flameTip.z+Math.cos(i*3)*.1);sparkTransform.scale.setScalar(waiting?0:.045*Math.sin(phase*Math.PI)*(resting?.15:1));sparkTransform.updateMatrix();sparks.setMatrixAt(i,sparkTransform.matrix);}sparks.instanceMatrix.needsUpdate=true;
    renderer.render(scene,camera);
    if(host.dataset.action!==rig.pose.action)host.dataset.action=rig.pose.action;
    host.dataset.renderedState=state;
  });
  renderer.render(scene,camera);callbacks.onLoaded();
  return{setCommunity(next){garden?.dispose();garden=next?createGardenArtwork(scene,next):null;if(garden)garden.group.visible=view==='garden';dirty=true;},setView(next){if(next!=='workshop'&&next!=='garden'||next==='garden'&&!garden)return false;view=next;room.visible=view==='workshop';if(garden)garden.group.visible=view==='garden';host.dataset.view=view;reset();return true;},setState(next){if(STATES[next]&&(!initialStateApplied||next!==state)){state=next;rig.controller.setState(next,{immediate:paused||!initialStateApplied});initialStateApplied=true;dirty=true;}},setPaused(value){paused=value;dirty=true;},setInteractive(value){controls.enabled=value;renderer.domElement.style.touchAction=value?'none':'pan-y';dirty=true;},reset,getDiagnostics(){return{state,paused,model:'voxel',character:rig.controller.getDiagnostics(),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};}};
}
