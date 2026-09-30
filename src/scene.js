import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { STATES } from './state.js';

export async function createWorkshop(host, callbacks) {
  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.2;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden','true');
  renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); renderer.setAnimationLoop(null); callbacks.onContextLost(); });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33,1,.1,80);
  const target = new THREE.Vector3(0,1.12,0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping=true; controls.dampingFactor=.08;
  controls.enablePan=false; controls.minDistance=8; controls.maxDistance=18;
  controls.minPolarAngle=Math.PI*.19; controls.maxPolarAngle=Math.PI*.47;
  controls.minAzimuthAngle=-Math.PI*.17; controls.maxAzimuthAngle=Math.PI*.46;
  controls.rotateSpeed=.65; controls.zoomSpeed=.7;
  const ambient = new THREE.HemisphereLight(0xfff3d7,0x718779,2.5); scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffe1b6,4); sun.position.set(-3,8,5); sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-5;sun.shadow.camera.right=5;sun.shadow.camera.top=5;sun.shadow.camera.bottom=-5;sun.shadow.normalBias=.025;sun.shadow.bias=-.0004;scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc5ecdb,2);fill.position.set(5,4,-2);scene.add(fill);
  const accentLight = new THREE.PointLight(0xffb56b,7,7,2);accentLight.position.set(1.2,2.3,1.4);scene.add(accentLight);
  const room = new THREE.Group();scene.add(room);
  const material=(color, opts={})=>new THREE.MeshStandardMaterial({color,roughness:.78,metalness:0,...opts});
  function box(w,h,d,color,x,y,z,r=.035,parent=room) {
    const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)),typeof color==='string'||typeof color==='number'?material(color):color);
    mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function cylinder(rt,rb,h,color,x,y,z,parent=room,segments=32){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,segments),typeof color==='string'||typeof color==='number'?material(color):color);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  function sphere(radius,color,x,y,z,parent=room){const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,20,12),typeof color==='string'||typeof color==='number'?material(color):color);mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;}
  function rod(a,b,r,color,parent=room){const mid=new THREE.Vector3().addVectors(a,b).multiplyScalar(.5);const o=cylinder(r,r,a.distanceTo(b),color,mid.x,mid.y,mid.z,parent,12);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return o;}
  function diskShadow(x,z,scale,opacity=.17){const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d');const g=ctx.createRadialGradient(64,64,1,64,64,64);g.addColorStop(0,`rgba(32,65,47,${opacity})`);g.addColorStop(1,'rgba(32,65,47,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);const plane=new THREE.Mesh(new THREE.PlaneGeometry(scale,scale),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false}));plane.rotation.x=-Math.PI/2;plane.position.set(x,.06,z);room.add(plane);}
  // Quiet celadon platform with warm timber edges.
  box(6.8,.3,5.3,0x769887,0,-.16,0,.14);
  box(6.64,.13,5.16,0xb7cbb6,0,.045,0,.11);
  box(6.7,.08,5.21,0x446f5e,0,-.24,0,.04);
  box(6.55,3.14,.13,0x3c6a5e,0,1.57,-2.51,.04);
  box(.13,3.14,5.1,0xc7c8a4,-3.26,1.57,0,.04);
  // Trim and wall panel lines.
  box(6.6,.08,.18,0x254f44,0,.2,-2.4,.015);
  box(.18,.08,5.05,0xa7b194,-3.16,.2,0,.015);
  for(let i=0;i<7;i++) box(.012,2.98,.025,0x416f61,-2.9+i*.95,1.63,-2.423,.003);
  // Round window: an abstract sky, not an external feed.
  const windowFrame=cylinder(.76,.76,.08,0xd4c391,1.45,2.0,-2.405);windowFrame.rotation.x=Math.PI/2;
  const skyMat=material(0xa9c8b3,{emissive:0xbed6b9,emissiveIntensity:.3});
  const sky=cylinder(.65,.65,.09,skyMat,1.45,2.0,-2.36);sky.rotation.x=Math.PI/2;
  const moon=sphere(.19,0xffe7a7,1.6,2.17,-2.27);moon.scale.z=.15;
  box(.045,1.32,.09,0xd4c391,1.45,2.0,-2.27,.01);
  box(1.32,.045,.09,0xd4c391,1.45,2.0,-2.27,.01);
  // Floating oak shelf, books, small pottery.
  box(1.65,.12,.37,0xaa7a4c,-1.47,2.5,-2.13,.04);
  [0xc9945c,0xbbcbaa,0xe4d0a3,0x7e9584,0xcc8b65].forEach((c,i)=>{const b=box(.16,.37+i%2*.06,.24,c,-2.05+i*.19,2.73,-2.13,.009);b.rotation.z=i===0?.09:0;box(.08,.015,.01,0xf8eac5,-2.05+i*.19,2.73,-1.999,.003);});
  cylinder(.12,.09,.2,0xebd9b0,-.98,2.67,-2.11);sphere(.12,0x8ba574,-.98,2.85,-2.11).scale.set(.85,1.3,.85);
  // Left wall framed sketches, made entirely from geometry.
  box(.09,.88,.69,0xa57e51,-3.13,1.9,-.4,.03);
  box(.095,.73,.55,0xf0e4c3,-3.08,1.9,-.4,.015);
  const sketch=new THREE.Mesh(new THREE.TorusGeometry(.18,.012,6,32),material(0x829671));sketch.rotation.y=Math.PI/2;sketch.position.set(-3.025,1.94,-.4);room.add(sketch);
  box(.012,.02,.26,0xcfa273,-3.015,1.62,-.4,.002);
  // A real little desk, cable and two generous drawers.
  box(3.38,.17,1.28,0xc69a65,-.58,1.27,-.97,.09);
  box(3.30,.07,1.24,0x9a6c46,-.58,1.17,-.97,.02);
  for(const x of [-1.98,.81])for(const z of [-1.42,-.55])box(.11,1.03,.11,0x6c7159,x,.64,z,.025);
  box(.68,.73,.92,0xb49a72,-1.78,.85,-1.01,.04);
  for(let i=0;i<2;i++){box(.7,.015,.01,0x837454,-1.78,.77+i*.27,-.541,.002);box(.21,.025,.04,0x6c735a,-1.78,.93-i*.28,-.51,.005);}
  // Monitor and generous frosted screen.
  box(.66,.05,.37,0x354e42,-.66,1.39,-1.06,.07);
  box(.12,.43,.11,0x354e42,-.66,1.6,-1.14,.03);
  const monitor=new THREE.Group();monitor.position.set(-.65,1.99,-1.08);monitor.rotation.x=-.07;room.add(monitor);
  box(1.57,.94,.10,0x2a463c,0,0,0,.06,monitor);
  const screenMat=material(0x102a26,{emissive:0x193e35,emissiveIntensity:.5});
  box(1.4,.76,.014,screenMat,0,.015,.06,.02,monitor);
  const screenLines=[];
  for(let i=0;i<6;i++){
    const width=[.64,.98,.48,.77,.54,.92][i];
    const line=box(width,.025,.013,material(i%2?0xb5caa0:0xf1c68a,{emissive:i%2?0x6fa185:0xdf9c55,emissiveIntensity:.4}),-.51+width/2,.255-i*.085,.075,.006,monitor);screenLines.push(line);
    if(i<3)box(.045,.025,.013,0x7ca783,-.6,.255-i*.085,.075,.005,monitor);
  }
  box(.78,.045,.28,0x597664,-.60,1.39,-.42,.04);
  for(let row=0;row<3;row++)for(let col=0;col<9;col++)box(.061,.016,.042,0xaec1a0,-.89+col*.072,1.422,-.51+row*.073,.006);
  const mouse=sphere(.09,0x82967b,.03,1.4,-.37);mouse.scale.set(.65,.35,1);
  // Notes and pencil, no real or private text.
  const notebook=box(.39,.06,.5,0x617e71,.62,1.395,-.52,.015);notebook.rotation.y=-.15;
  box(.34,.018,.43,0xe9debd,.62,1.43,-.52,.009).rotation.y=-.15;
  rod(new THREE.Vector3(.6,1.455,-.66),new THREE.Vector3(.72,1.455,-.35),.013,0xbb7950);
  // Brass desk lamp.
  cylinder(.2,.24,.05,0x9b8b55,.67,1.4,-1.28);
  rod(new THREE.Vector3(.67,1.43,-1.28),new THREE.Vector3(.73,2.18,-1.28),.026,0xb9a567);
  rod(new THREE.Vector3(.73,2.18,-1.28),new THREE.Vector3(.30,2.44,-1.18),.026,0xb9a567);
  const shade=cylinder(.12,.32,.25,0xdfba72,.27,2.37,-1.17);shade.rotation.z=.15;
  const bulb=sphere(.1,material(0xffe8b8,{emissive:0xffd28b,emissiveIntensity:2}),.27,2.24,-1.17);bulb.scale.y=.2;
  const lamp=new THREE.PointLight(0xffd591,4,3,2);lamp.position.set(.27,2.15,-1.17);scene.add(lamp);
  // A terracotta swivel chair.
  const chair=new THREE.Group();chair.position.set(-1.06,0,.72);chair.rotation.y=-.28;room.add(chair);
  cylinder(.31,.35,.08,0x5c6755,0,.19,0,chair);
  cylinder(.055,.055,.58,0x68755e,0,.5,0,chair);
  box(.93,.17,.83,0xbc7756,0,.86,0,.12,chair);
  box(.93,.66,.15,0xc4815a,0,1.25,.32,.10,chair);
  for(const x of [-.37,.37])box(.055,.4,.055,0x6e7155,x,1.0,.23,.015,chair);
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;rod(new THREE.Vector3(0,.24,0),new THREE.Vector3(Math.cos(a)*.48,.18,Math.sin(a)*.48),.03,0x5c6755,chair);sphere(.066,0x445c49,Math.cos(a)*.48,.13,Math.sin(a)*.48,chair);}
  // Circular jute rug and fine rings around the character.
  const rug=cylinder(1.03,1.03,.018,0xd9bd79,1.42,.132,.82,room,64);
  for(const r of [.82,.88,.95]){const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.008,4,80),material(0xc4a56c));ring.rotation.x=Math.PI/2;ring.position.set(1.42,.147,.82);room.add(ring);}
  // Side cabinet and cup.
  box(.85,.76,.65,0x789080,2.57,.53,-1.27,.07);
  box(.93,.10,.72,0xc8ad7e,2.57,.94,-1.27,.03);
  for(const y of [.43,.72]){box(.73,.015,.01,0x4d725f,2.57,y,-.936,.003);sphere(.03,0xd8bd7f,2.57,y+.1,-.92);}
  cylinder(.105,.09,.18,0xe0c28c,2.48,1.09,-1.22);const cupHandle=new THREE.Mesh(new THREE.TorusGeometry(.068,.02,8,16),material(0xe0c28c));cupHandle.position.set(2.59,1.09,-1.22);room.add(cupHandle);
  cylinder(.08,.08,.002,0x78583d,2.48,1.184,-1.22);
  box(.25,.07,.32,0xc98358,2.82,1.025,-1.28,.013);
  // Leafy plant with deliberately low-poly leaves.
  cylinder(.28,.22,.45,0xbb9067,-2.36,.35,1.42);
  cylinder(.26,.26,.07,0xd0ad7b,-2.36,.6,1.42);
  cylinder(.23,.23,.015,0x726248,-2.36,.639,1.42);
  rod(new THREE.Vector3(-2.36,.64,1.42),new THREE.Vector3(-2.33,1.71,1.41),.022,0x557c4c);
  for(let i=0;i<7;i++){const a=i*2.4;const y=.88+i*.13;const end=new THREE.Vector3(-2.35+Math.cos(a)*.3,y+.14,1.42+Math.sin(a)*.25);rod(new THREE.Vector3(-2.34,y,1.42),end,.011,0x557c4c);const leaf=sphere(.16,i%2?0x8da569:0x6e965d,end.x,end.y,end.z);leaf.scale.set(.5,1.45,.85);leaf.rotation.z=Math.cos(a)*.9;leaf.rotation.x=Math.sin(a)*.6;}
  // Tiny blocks give the workbench a playful, tactile edge.
  const blocks=[];
  [[.09,.1,1.88,0x94a987],[.45,.09,1.9,0xb28255],[.26,.38,1.91,0xdba669]].forEach(([x,y,z,c])=>blocks.push(box(.26,.26,.26,c,x,y+.16,z,.035)));
  box(.62,.04,.47,0xe7dcbc,-.41,.14,1.74,.015).rotation.y=.2;
  for(let i=0;i<3;i++)box(.37-i*.05,.008,.015,0xa9b795,-.4,.169,1.63+i*.08,.002).rotation.y=.2;
  diskShadow(0,.5,8,.14);diskShadow(1.42,.82,1.8,.24);diskShadow(-1,.7,1.8,.2);
  // Character anchor accepts the actual HY 3D GLB, including its authored node rotation.
  const mascot=new THREE.Group();mascot.position.set(1.42,.16,.82);mascot.rotation.y=.12;room.add(mascot);
  const placeholder=new THREE.Group();mascot.add(placeholder);
  box(.63,.61,.45,0xe7b466,0,.72,0,.16,placeholder);
  box(.55,.42,.29,0xffdda0,0,.77,.2,.12,placeholder);
  box(.38,.40,.31,0xead0a0,0,.24,0,.09,placeholder);
  for(const x of [-.16,.16]){box(.10,.14,.045,0x483227,x,.78,.361,.025,placeholder);box(.13,.17,.18,0xe2ba83,x,.07,.025,.035,placeholder);sphere(.09,0xeac995,x*1.65,.29,.015,placeholder);}
  box(.10,.03,.02,0x995032,0,.64,.36,.008,placeholder);
  const flame=new THREE.Mesh(new THREE.ConeGeometry(.24,.55,6),material(0xec8730,{emissive:0xe76b19,emissiveIntensity:.3}));flame.position.y=1.27;flame.rotation.z=-.16;placeholder.add(flame);
  const innerFlame=new THREE.Mesh(new THREE.ConeGeometry(.14,.38,6),material(0xffd756,{emissive:0xffaa30,emissiveIntensity:.4}));innerFlame.position.set(.02,1.18,.12);placeholder.add(innerFlame);
  const sparks=[];
  for(let i=0;i<7;i++){const spark=sphere(.021+i%2*.005,material(0xffd183,{emissive:0xffae4b,emissiveIntensity:1.3}),1.42,.0,.82);spark.castShadow=false;room.add(spark);sparks.push(spark);}
  let state='building', paused=false, elapsed=0, lastTime=0, modelLoaded=false, dirty=true;
  controls.addEventListener('change',()=>{dirty=true;});
  let mixer=null;
  const stateColor=new THREE.Color(STATES[state].light);
  const clockColor=new THREE.Color();
  function reset(){const narrow=host.clientWidth<440;camera.position.set(narrow?8.8:8.1,narrow?7.7:7.1,narrow?11.7:10.7);controls.target.copy(target);controls.update();}
  function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;}
  new ResizeObserver(resize).observe(host);resize();reset();
  host.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(event.key))return;
    event.preventDefault();const offset=camera.position.clone().sub(controls.target);const spherical=new THREE.Spherical().setFromVector3(offset);
    if(event.key==='Home'){reset();return;}
    if(event.key==='ArrowLeft')spherical.theta-=.1;
    if(event.key==='ArrowRight')spherical.theta+=.1;
    if(event.key==='ArrowUp')spherical.phi-=.07;
    if(event.key==='ArrowDown')spherical.phi+=.07;
    if(event.key==='+'||event.key==='=')spherical.radius*=.92;
    if(event.key==='-')spherical.radius*=1.08;
    spherical.phi=THREE.MathUtils.clamp(spherical.phi,controls.minPolarAngle,controls.maxPolarAngle);
    spherical.theta=THREE.MathUtils.clamp(spherical.theta,controls.minAzimuthAngle,controls.maxAzimuthAngle);
    spherical.radius=THREE.MathUtils.clamp(spherical.radius,controls.minDistance,controls.maxDistance);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();
  });
  renderer.setAnimationLoop(time=>{
    if(document.hidden) { lastTime=time; return; }
    controls.update();
    if(paused && !dirty) { lastTime=time; return; }
    if(time-lastTime<32 && !dirty) return;
    dirty=false;
    const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;
    if(!paused)elapsed+=dt;
    const t=elapsed*STATES[state].speed;
    const resting=state==='resting', waiting=state==='waiting';
    mascot.position.y=.16+(resting?0:Math.sin(t*2)*.022);
    mascot.rotation.z=state==='checking'?Math.sin(t*.8)*.075:Math.sin(t)*.012;
    mascot.rotation.y=.12+(state==='building'?Math.sin(t*.7)*.08:state==='focused'?-.30:waiting?Math.sin(t*.5)*.18:0);
    mascot.scale.setScalar(resting?.97:1);
    const targetColor=new THREE.Color(STATES[state].light);stateColor.lerp(targetColor,paused?1:.03);accentLight.color.copy(stateColor);
    accentLight.intensity=resting?2.4:5+Math.sin(t*2)*.4;
    sun.intensity=THREE.MathUtils.lerp(sun.intensity,resting?2.0:4,paused?1:.025);
    ambient.intensity=THREE.MathUtils.lerp(ambient.intensity,resting?1.8:2.5,paused?1:.025);
    lamp.intensity=resting?2.2:4;
    clockColor.set(STATES[state].screen);
    screenLines.forEach((line,i)=>{line.material.color.lerp(clockColor,.05);line.scale.x=resting?.45:1+(state==='building'?Math.sin(t*1.6-i)*.1:0);});
    sparks.forEach((spark,i)=>{const phase=(t*.22+i/7)%1;spark.position.set(1.42+Math.sin(i*6+t*.3)*(.2+phase*.3),1.66+phase*.7,.82+Math.cos(i*4+t*.25)*.18);spark.scale.setScalar(Math.sin(phase*Math.PI)*(resting?.25:1));spark.visible=!waiting;});
    if(state==='building')blocks[2].rotation.y=t*.25;
    if(mixer&&!paused)mixer.update(dt);
    controls.update();renderer.render(scene,camera);
  });
  renderer.render(scene,camera);
  callbacks.onLoaded();
  new GLTFLoader().load(`${import.meta.env.BASE_URL}assets/dot-hunyuan.glb`,gltf=>{
    const model=gltf.scene;model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model);const size=bounds.getSize(new THREE.Vector3());const center=bounds.getCenter(new THREE.Vector3());
    if(!Number.isFinite(size.y)||size.y<=0){callbacks.onModelError();return;}
    const normalizer=new THREE.Group();normalizer.add(model);const s=1.7/size.y;normalizer.scale.setScalar(s);model.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));
    // Texture colors are authored by HY 3D; preserve them and its model orientation.
    model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
    mascot.remove(placeholder);mascot.add(normalizer);modelLoaded=true;dirty=true;
    if(gltf.animations.length){mixer=new THREE.AnimationMixer(model);mixer.clipAction(gltf.animations[0]).play();}
    callbacks.onModelLoaded();
  },undefined,()=>callbacks.onModelError());
  return {
    setState(next){if(!STATES[next])return;state=next;dirty=true;},
    setPaused(value){paused=value;dirty=true;},
    setInteractive(value){controls.enabled=value;renderer.domElement.style.touchAction=value?'none':'pan-y';dirty=true;},reset,
    getDiagnostics(){return {state,paused,modelLoaded,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};}
  };
}
