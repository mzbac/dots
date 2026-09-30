import * as THREE from 'three';

// Original voxel art. Only this compact rig and its rolling chair are dynamic.
// +Z is the character's forward direction. Room coordinates are metres, Y-up.
export const CHARACTER_LAYOUT = Object.freeze({
  floor: .12, rug: .1465, seatTop: .93, footrestTop: .65,
  seat: {x: -.69, z: .18}, parkedChairZ: .78,
  entry: {x: -.69, z: .10}, gate: {x: .48, z: .10},
  checking: {x: 1.57, z: .32},
  walkLoop: [{x:1.55,z:.35},{x:2.12,z:.58},{x:2.13,z:1.25},{x:1.67,z:1.76},{x:1.10,z:1.29},{x:1.16,z:.64}],
  radius: .29, speed: .36, stride: .26,
});
const TAU = Math.PI * 2;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const V=(x=0,y=0,z=0)=>({x,y,z});
const pointMix=(a,b,t)=>V(mix(a.x,b.x,t),mix(a.y,b.y,t),mix(a.z,b.z,t));
const validState=s=>['building','focused','checking','waiting','resting'].includes(s);
const seatedState=s=>s==='building'||s==='focused'||s==='resting';
const angleMix=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const copy=p=>structuredClone(p);
function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
export function groundHeight(x,z){return x> -1.845&&x<-.195&&z>-.205&&z<1.445?CHARACTER_LAYOUT.rug:CHARACTER_LAYOUT.floor;}
function world(root,x,y,z){const s=Math.sin(root.yaw),c=Math.cos(root.yaw);return V(root.x+x*c+z*s,y,root.z-x*s+z*c);}
function local(root,p){const x=p.x-root.x,z=p.z-root.z,s=Math.sin(root.yaw),c=Math.cos(root.yaw);return V(x*c-z*s,p.y-root.y,x*s+z*c);}

function seatedPose(state,time=0,chairZ=CHARACTER_LAYOUT.seat.z,still=false){
  const rest=state==='resting',typing=still?0:Math.sin(time*(state==='building'?8:5));
  const root={x:CHARACTER_LAYOUT.seat.x,y:1.025,z:chairZ,yaw:Math.PI};
  const pose={state,action:rest?'seated-rest':'seated-working',root,chairZ,torsoLean:rest?-.045:.22,headPitch:rest?.14:.09,headYaw:0,headRoll:rest?.04:0,blink:rest?.24:(!still&&Math.sin(time*.73)>.997?.12:1),flame:rest?.74:1+(still?0:Math.sin(time*3)*.018),laptop:0};
  pose.feet=[-1,1].map(side=>world(root,side*.145,.73,.365));
  pose.knees=[-1,1].map(side=>world(root,side*.145,1.025,.335));
  pose.hands=rest?[-1,1].map(side=>world(root,side*.24,1.12,.15)):[-1,1].map(side=>world(root,side*.18,1.494+Math.max(0,side*typing)*.038,.76+(side*typing)*.006));
  pose.elbows=[-1,1].map(side=>world(root,side*.37,rest?1.22:1.48,rest?.03:.38));
  return pose;
}
function standingPose(state,root,time=0,still=false){
  const p={state,action:state==='checking'?'laptop-check':'standing-pause',root:{...root,y:groundHeight(root.x,root.z)+.66},chairZ:CHARACTER_LAYOUT.parkedChairZ,torsoLean:state==='checking'?.04:0,headPitch:state==='checking'?.19:0,headYaw:state==='waiting'?(still?.14:Math.sin(time*.6)*.18):state==='checking'&&!still?Math.sin(time*.65)*.045:0,headRoll:state==='checking'?-.045:0,blink:!still&&Math.sin(time*.73)>.997?.12:1,flame:1+(still?0:Math.sin(time*3)*.018),laptop:state==='checking'?1:0};
  p.feet=[-1,1].map(side=>{const foot=world(p.root,side*.145,0,.025);foot.y=groundHeight(foot.x,foot.z)+.08;return foot;});
  p.knees=p.feet.map((foot,i)=>pointMix(world(p.root,(i?1:-1)*.145,p.root.y,0),foot,.47));
  p.hands=[-1,1].map(side=>world(p.root,side*(state==='checking'?.245:.34),p.root.y+(state==='checking'?.215:.07),state==='checking'?.47:.035));
  p.elbows=[-1,1].map(side=>world(p.root,side*.36,p.root.y+.22,state==='checking'?.19:.015));
  if(state==='checking'&&!still){const tap=Math.pow(Math.max(0,Math.sin(time*2.2)),4);p.hands[1].y+=tap*.025;p.headPitch+=Math.sin(time*.65+.6)*.018;}
  solveLegs(p);return p;
}

// Deterministic fixtures use the same poses as the live controller. They never
// select the public state; they are for render/export/test tools only.
export function sampleCharacterPose(state,time=0,{reducedMotion=false}={}){
  if(!validState(state))throw new Error('Invalid character state');
  if(seatedState(state))return seatedPose(state,reducedMotion?0:time,CHARACTER_LAYOUT.seat.z,reducedMotion);
  if(state==='checking')return standingPose(state,{...CHARACTER_LAYOUT.checking,yaw:.35},reducedMotion?0:time,reducedMotion);
  if(reducedMotion)return standingPose(state,{...CHARACTER_LAYOUT.walkLoop[0],yaw:.65},0,true);
  const loop=CHARACTER_LAYOUT.walkLoop,period=23,phase=((time%period)+period)%period;
  if(phase<3)return standingPose(state,{...loop[0],yaw:.65},time);
  const lengths=loop.map((p,i)=>distance(p,loop[(i+1)%loop.length])),total=lengths.reduce((a,b)=>a+b,0);let d=(phase-3)/20*total,idx=0;
  while(d>lengths[idx]&&idx<lengths.length-1)d-=lengths[idx++];
  const a=loop[idx],b=loop[(idx+1)%loop.length],u=d/lengths[idx],root={x:mix(a.x,b.x,u),z:mix(a.z,b.z,u),yaw:Math.atan2(b.x-a.x,b.z-a.z)};
  const pose=standingPose(state,root,time);pose.action='walking';
  const stride=Math.sin((phase-3)*TAU*1.25),lift=Math.max(0,stride)*.07;
  pose.feet.forEach((f,i)=>{const sign=i===0?1:-1,step=world(pose.root,sign*-.145,0,sign*stride*.09);f.x=step.x;f.z=step.z;f.y=groundHeight(f.x,f.z)+.08+(i===0?lift:Math.max(0,-stride)*.07);});
  solveLegs(pose);pose.hands.forEach((hand,i)=>{const h=world(pose.root,(i?1:-1)*.34,pose.root.y+.07,(i?1:-1)*stride*.13);Object.assign(hand,h);});
  return pose;
}
function solveLegs(pose){
  // Analytic two-bone IK in the leg's vertical travel plane. The knee bends
  // forward; lengths stay constant instead of telescoping during each step.
  pose.knees=pose.feet.map((foot,i)=>{
    const hip=world(pose.root,(i?1:-1)*.145,pose.root.y,0),dx=foot.x-hip.x,dy=foot.y-hip.y,dz=foot.z-hip.z;
    const raw=Math.hypot(dx,dy,dz),d=Math.min(.6349,Math.max(.036,raw)),ux=dx/raw,uy=dy/raw,uz=dz/raw;
    const along=(.335*.335-.30*.30+d*d)/(2*d),height=Math.sqrt(Math.max(0,.335*.335-along*along));
    const fx=Math.sin(pose.root.yaw),fz=Math.cos(pose.root.yaw),dot=fx*ux+fz*uz;
    let px=fx-dot*ux,py=-dot*uy,pz=fz-dot*uz;const plen=Math.hypot(px,py,pz)||1;px/=plen;py/=plen;pz/=plen;
    return V(hip.x+ux*along+px*height,hip.y+uy*along+py*height,hip.z+uz*along+pz*height);
  });
}
function blendPose(a,b,t){
  const out=copy(b);out.root={...pointMix(a.root,b.root,t),yaw:angleMix(a.root.yaw,b.root.yaw,t)};
  for(const key of ['chairZ','torsoLean','headPitch','headYaw','headRoll','blink','flame','laptop'])out[key]=mix(a[key],b[key],t);
  for(const key of ['feet','knees','hands','elbows'])out[key]=a[key].map((v,i)=>pointMix(v,b[key][i],t));
  const transfer=(a.action.startsWith('seated')&&!b.action.startsWith('seated'))||(!a.action.startsWith('seated')&&b.action.startsWith('seated'));
  if(transfer){
    // Lift from the footrest before moving over the lip, then lower onto the
    // floor. Reversing this path seats the toy without stretching its legs.
    const leaving=a.action.startsWith('seated'),u=leaving?t:1-t,seat=leaving?a:b,stand=leaving?b:a;
    const raised=seat.root.y+.075;
    const y=u<.2?mix(seat.root.y,raised,smooth(u/.2)):u<.5?raised:mix(raised,stand.root.y,smooth((u-.5)/.5));
    const offset=y-out.root.y;out.root.y=y;out.hands.forEach(v=>v.y+=offset);out.elbows.forEach(v=>v.y+=offset);
    const footProgress=smooth((u-.2)/.8);out.feet.forEach((foot,i)=>{foot.y=mix(seat.feet[i].y,stand.feet[i].y,footProgress);});
    solveLegs(out);
  }
  out.action=t<1?'transition':b.action;return out;
}

function boxes(parent,cells,{emissive=false,name=''}={}){
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,emissive:emissive?0xffffff:0,emissiveIntensity:emissive?.16:0});
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat,cells.length);const obj=new THREE.Object3D(),color=new THREE.Color();
  cells.forEach(([x,y,z,w,h,d,tint],i)=>{obj.position.set(x,y,z);obj.scale.set(w,h,d);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);mesh.setColorAt(i,color.setHex(tint));});mesh.castShadow=!emissive;mesh.receiveShadow=true;mesh.name=name;parent.add(mesh);return mesh;
}
function blockSkin(x,y,z,w,h,d,color,unit=.075){
  const result=[],nx=Math.max(1,Math.round(w/unit)),ny=Math.max(1,Math.round(h/unit)),nz=Math.max(1,Math.round(d/unit));
  for(let i=0;i<nx;i++)for(let j=0;j<ny;j++)for(let k=0;k<nz;k++){if(i&&j&&k&&i<nx-1&&j<ny-1&&k<nz-1)continue;result.push([x-w/2+(i+.5)*w/nx,y-h/2+(j+.5)*h/ny,z-d/2+(k+.5)*d/nz,w/nx*.985,h/ny*.985,d/nz*.985,color]);}return result;
}
function group(parent,name){const g=new THREE.Group();g.name=name;parent.add(g);return g;}
function limb(parent,name,width,depth,color,length=1){const g=group(parent,name);g.userData.restLength=length;boxes(g,blockSkin(0,length/2,0,width,length,depth,color,length<1?.07:.13));return g;}
function segment(g,a,b){const start=new THREE.Vector3(a.x,a.y,a.z),end=new THREE.Vector3(b.x,b.y,b.z),dir=end.sub(start);g.position.copy(start);g.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());g.scale.set(1,dir.length()/(g.userData.restLength||1),1);}

export function createVoxelCharacter(parent){
  const mascot=group(parent,'dot'),body=group(mascot,'dot-body'),pelvis=group(mascot,'dot-pelvis');
  boxes(pelvis,blockSkin(0,-.015,0,.36,.16,.28,0xe8ba78));
  boxes(body,[...blockSkin(0,.22,0,.45,.42,.30,0xffdaa0),...blockSkin(0,.28,-.01,.52,.17,.28,0xf6d395),[0,.23,.157,.22,.22,.025,0x5c3c22],[-.052,.23,.177,.04,.17,.02,0xff9426],[.04,.23,.177,.038,.17,.02,0xffbd33]]);
  const head=group(mascot,'dot-head'),cells=[],grid=.064;
  for(let x=-6;x<=6;x++)for(let y=-4;y<=4;y++)for(let z=-3;z<=3;z++){if(Math.abs(x)===6&&Math.abs(y)===4)continue;if(Math.abs(x)<6&&Math.abs(y)<4&&Math.abs(z)<3)continue;let c=0xffdaa0;if(z===3)c=Math.abs(x)>=5||Math.abs(y)>=3?0xe17f30:0xffdda1;else c=Math.abs(x)===6||z===-3?0xe68533:0xf6bc62;cells.push([x*grid,y*grid,z*grid,grid*.985,grid*.985,grid*.985,c]);}
  cells.push([-.205,-.084,.232,.14,.075,.018,0xf89968],[.205,-.084,.232,.14,.075,.018,0xf89968],[0,-.146,.235,.13,.036,.02,0xa8562b],[0,-.127,.247,.07,.015,.006,0x683626]);boxes(head,cells);
  const eyes=group(head,'dot-eyes');boxes(eyes,[-.151,.151].flatMap(x=>[[x,.025,.236,.105,.15,.025,0x352720],[x-.024,.065,.253,.029,.031,.008,0x9a6344]]));
  const flame=group(head,'dot-flame'),flames=[],rows=[[-5,5],[-6,6],[-6,5],[-5,5],[-4,4],[-4,4],[-3,3],[-3,3],[-2,2],[-2,1],[-2,1],[-2,0],[-2,-1],[-2,-2]];
  rows.forEach(([lo,hi],row)=>{for(let x=lo;x<=hi;x++)for(let z=-2;z<=2;z++){let c=x===lo||x===hi||row>10?0xf18c25:0xffbb32;if(row<7&&x>=-2+Math.floor(row/4)&&x<=2-Math.floor(row/3))c=0xffe16a;flames.push([x*.053,.32+row*.045,z*.055,.052,.044,.054,c]);}});boxes(flame,flames,{emissive:true});
  const arms=[-1,1].map(side=>({upper:limb(mascot,`dot-${side<0?'left':'right'}-upper-arm`,.135,.15,0xffdaa0),lower:limb(mascot,`dot-${side<0?'left':'right'}-forearm`,.125,.14,0xf4c982),hand:group(mascot,`dot-${side<0?'left':'right'}-hand`)}));
  arms.forEach(a=>boxes(a.hand,blockSkin(0,0,.015,.15,.09,.16,0xf4c982)));
  const legs=[-1,1].map(side=>({upper:limb(mascot,`dot-${side<0?'left':'right'}-thigh`,.215,.18,0xe8ba78,.335),lower:limb(mascot,`dot-${side<0?'left':'right'}-shin`,.195,.19,0xf0c78c,.30),knee:group(mascot,`dot-${side<0?'left':'right'}-knee`),foot:group(mascot,`dot-${side<0?'left':'right'}-boot`)}));
  legs.forEach(l=>{boxes(l.knee,[[0,0,0,.225,.17,.21,0xe9bd7c]]);boxes(l.foot,[[0,-.025,.04,.26,.11,.31,0xd89446],[0,.045,-.005,.22,.07,.22,0xedb968]]);});
  const chair=group(parent,'dot-chair');chair.position.x=CHARACTER_LAYOUT.seat.x;
  boxes(chair,[...blockSkin(0,.86,0,.87,.14,.48,0xc78957,.15),...blockSkin(-.32,1.16,.24,.21,.43,.13,0xd29560,.14),...blockSkin(.32,1.16,.24,.21,.43,.13,0xd29560,.14),[0,1.39,.24,.87,.07,.13,0xd29560],[0,.50,0,.10,.58,.10,0x6f7a55],[0,.20,0,.72,.07,.11,0x63714d],[0,.20,0,.11,.07,.72,0x63714d],...[[ -.34,0],[.34,0],[0,-.34],[0,.34]].map(([x,z])=>[x,.13,z,.13,.12,.13,0x48633f]),[0,.62,-.38,.60,.06,.36,0x778661],[-.24,.60,-.20,.07,.05,.40,0x6f7a55],[.24,.60,-.20,.07,.05,.40,0x6f7a55]]);
  const laptop=group(mascot,'dot-laptop'),lid=group(laptop,'dot-laptop-lid');
  boxes(laptop,[[0,0,0,.56,.045,.36,0x667b70],[0,.026,0,.49,.012,.29,0xbbc6ac],...Array.from({length:5},(_,i)=>[-.18+i*.09,.035,-.025,.055,.011,.12,0x718673]),[0,.036,.095,.14,.01,.07,0x91a08a]]);
  lid.position.set(0,.01,.17);lid.rotation.x=.55;boxes(lid,[[0,.18,0,.56,.36,.045,0x4c685b],[0,.18,-.028,.48,.28,.014,0x1c392d],[-.05,.245,-.04,.29,.026,.01,0xc4e5b7],[.015,.19,-.04,.36,.019,.01,0xe3c17d],[-.09,.14,-.04,.21,.019,.01,0xa7cda1]]);
  const rig={mascot,body,pelvis,head,eyes,flame,arms,legs,chair,laptop,leftArm:arms[0].upper,rightArm:arms[1].upper};rig.controller=new CharacterController(rig);return rig;
}
export function applyCharacterPose(rig,p){
  const {mascot,body,head,eyes,flame,arms,legs,chair,laptop}=rig;mascot.position.set(p.root.x,p.root.y,p.root.z);mascot.rotation.y=p.root.yaw;body.rotation.x=p.torsoLean;
  head.position.set(0,.735,Math.sin(p.torsoLean)*.63);head.rotation.set(p.headPitch,p.headYaw,p.headRoll);eyes.scale.y=p.blink;flame.scale.y=p.flame;chair.position.z=p.chairZ;
  arms.forEach((arm,i)=>{const side=i?1:-1,start=V(side*.29,.425,Math.sin(p.torsoLean)*.42),elbow=local(p.root,p.elbows[i]),hand=local(p.root,p.hands[i]);segment(arm.upper,start,elbow);segment(arm.lower,elbow,hand);arm.hand.position.set(hand.x,hand.y,hand.z);arm.hand.rotation.x=p.laptop?-.05:.15;});
  legs.forEach((leg,i)=>{const start=V((i?1:-1)*.145,0,0),knee=local(p.root,p.knees[i]),foot=local(p.root,p.feet[i]);segment(leg.upper,start,knee);segment(leg.lower,knee,foot);leg.knee.position.set(knee.x,knee.y,knee.z);leg.foot.position.set(foot.x,foot.y,foot.z);});
  laptop.visible=p.laptop>.005;laptop.scale.setScalar(Math.max(.001,p.laptop));laptop.position.set(0,.18,.45);laptop.rotation.x=.08;
  mascot.updateMatrixWorld(true);rig.pose=p;
}

export class CharacterController {
  constructor(rig){this.rig=rig;this.state='building';this.mode='seated';this.time=0;this.pose=sampleCharacterPose(this.state);this.transition=null;this.route=null;this.travel=0;this.pause=1.5;this.loopIndex=0;this.feet=null;this.settled=true;applyCharacterPose(rig,this.pose);}
  setState(state,{immediate=false}={}){if(!validState(state))return false;this.state=state;if(immediate){this.transition=null;this.route=null;this.feet=null;this.pose=sampleCharacterPose(state,0,{reducedMotion:true});this.mode=seatedState(state)?'seated':'standing';this.settled=true;applyCharacterPose(this.rig,this.pose);}return true;}
  tween(target,duration,onEnd){this.transition={from:copy(this.pose),target,duration,elapsed:0,onEnd};this.settled=false;}
  walk(points,onEnd){const route=[{x:this.pose.root.x,z:this.pose.root.z},...points];this.route={points:route,index:1,onEnd};this.mode='walking';this.feet=null;this.travel=0;this.settled=false;}
  update(state,delta,{reducedMotion=false}={}){
    if(state!==this.state)this.setState(state);const dt=clamp(Number.isFinite(delta)?delta:0,0,.05);this.time+=reducedMotion?0:dt;
    if(reducedMotion){this.setState(this.state,{immediate:true});return this.pose;}
    if(this.transition){const tr=this.transition;tr.elapsed+=dt;this.pose=blendPose(tr.from,tr.target,smooth(tr.elapsed/tr.duration));if(tr.elapsed>=tr.duration){this.transition=null;tr.onEnd?.();}}
    else if(this.route)this.advanceWalk(dt);
    else if(this.mode==='seated'){
      if(seatedState(this.state)){const target=seatedPose(this.state,this.time);if(this.pose.state!==this.state)this.tween(target,.65);else this.pose=target;this.settled=true;}
      else {const back=seatedPose('focused',this.time,CHARACTER_LAYOUT.parkedChairZ);this.tween(back,1.05,()=>{const stand=standingPose(this.state,{...CHARACTER_LAYOUT.entry,yaw:Math.PI},this.time);stand.laptop=0;this.tween(stand,1.15,()=>{this.mode='standing';this.feet=null;});});}
    }else if(seatedState(this.state)){
      const atEntry=distance(this.pose.root,CHARACTER_LAYOUT.entry)<.025;
      if(!atEntry)this.walk([CHARACTER_LAYOUT.gate,CHARACTER_LAYOUT.entry],()=>{this.mode='standing';});
      else if(Math.abs(Math.atan2(Math.sin(this.pose.root.yaw-Math.PI),Math.cos(this.pose.root.yaw-Math.PI)))>.04){const facing=standingPose(this.state,{...CHARACTER_LAYOUT.entry,yaw:Math.PI},this.time);facing.laptop=0;this.tween(facing,.5);}
      else {const sit=seatedPose(this.state,this.time,CHARACTER_LAYOUT.parkedChairZ);this.tween(sit,1.15,()=>{this.tween(seatedPose(this.state,this.time),1.05,()=>{this.mode='seated';});});}
    }else if(this.state==='checking'){
      if(distance(this.pose.root,CHARACTER_LAYOUT.checking)>.025)this.walk([...(this.pose.root.x<.2?[CHARACTER_LAYOUT.gate]:[]),CHARACTER_LAYOUT.checking],()=>{this.mode='standing';});
      else {const target=standingPose(this.state,{...CHARACTER_LAYOUT.checking,yaw:.35},this.time);if(this.pose.state!=='checking'||this.pose.laptop<.99||Math.abs(this.pose.root.yaw-.35)>.1)this.tween(target,.7);else this.pose=target;this.settled=true;}
    }else{
      if(this.pose.state!=='waiting'||this.pose.laptop>.01){const target=standingPose('waiting',{...this.pose.root},this.time);this.tween(target,.55);}
      else if(this.pause>0){this.pause-=dt;this.pose=standingPose('waiting',{...this.pose.root},this.time);this.settled=true;}
      else {const target=CHARACTER_LAYOUT.walkLoop[this.loopIndex];this.loopIndex=(this.loopIndex+1)%CHARACTER_LAYOUT.walkLoop.length;this.walk([...(this.pose.root.x<.2?[CHARACTER_LAYOUT.gate]:[]),target],()=>{this.mode='standing';this.pause=this.loopIndex%2===0?1.3:.15;});}
    }
    applyCharacterPose(this.rig,this.pose);return this.pose;
  }
  advanceWalk(dt){
    const r=this.route,target=r.points[r.index],old=this.pose.root,d=distance(old,target),step=Math.min(d,CHARACTER_LAYOUT.speed*dt),yaw=Math.atan2(target.x-old.x,target.z-old.z),root={x:mix(old.x,target.x,d?step/d:1),z:mix(old.z,target.z,d?step/d:1),yaw:angleMix(old.yaw,yaw,Math.min(1,dt*7))};
    this.travel+=step;const p=standingPose(this.state,root,this.time);p.action='walking';p.laptop=0;
    // Two alternating stance/swing feet. Planted feet remain fixed in world space
    // throughout contact; only the swinging boot follows its next footprint.
    if(!this.feet)this.feet=this.pose.feet.map((point,i)=>{const cycle=this.travel/CHARACTER_LAYOUT.stride+i*.5,phase=cycle-Math.floor(cycle);const to=phase<.5?world({...root,yaw},(i?1:-1)*.145,0,.105):{...point};to.y=groundHeight(to.x,to.z)+.08;return{point:{...point},from:{...point},to,cycle:Math.floor(cycle)};});
    this.feet.forEach((foot,i)=>{
      const cycle=this.travel/CHARACTER_LAYOUT.stride+i*.5,whole=Math.floor(cycle),phase=cycle-whole;
      if(foot.cycle!==whole){foot.cycle=whole;foot.from={...foot.point};const next=world({...root,yaw},(i?1:-1)*.145,0,.105);next.y=groundHeight(next.x,next.z)+.08;foot.to=next;}
      if(phase<.5){foot.point=pointMix(foot.from,foot.to,smooth(phase*2));foot.point.y+=Math.sin(phase*2*Math.PI)*.07;}else foot.point={...foot.to};
      p.feet[i]={...foot.point};
    });
    // A small knee flex at a turn keeps planted feet reachable with compact
    // limbs. Never elongate a shin merely because the body turns first.
    const previousY=p.root.y;
    p.feet.forEach((foot,i)=>{const hip=world(p.root,(i?1:-1)*.145,p.root.y,0),horizontal=Math.hypot(foot.x-hip.x,foot.z-hip.z);p.root.y=Math.min(p.root.y,foot.y+Math.sqrt(Math.max(.01,.631*.631-horizontal*horizontal)));});
    p.elbows.forEach(v=>v.y+=p.root.y-previousY);solveLegs(p);
    const swing=Math.sin(this.travel/CHARACTER_LAYOUT.stride*TAU);p.hands.forEach((h,i)=>Object.assign(h,world(p.root,(i?1:-1)*.34,p.root.y+.07,(i?1:-1)*swing*.12)));
    this.pose=p;if(d<=step+.0001){r.index++;if(r.index>=r.points.length){this.route=null;this.feet=null;const settled=standingPose(this.state,{...p.root},this.time);settled.laptop=0;this.tween(settled,.18,()=>r.onEnd?.());}}
  }
  getDiagnostics(){return{state:this.state,action:this.pose.action,mode:this.mode,transitioning:!!(this.transition||this.route),position:{...this.pose.root},feet:this.pose.feet.map(p=>({...p})),chairZ:this.pose.chairZ,laptop:this.pose.laptop};}
}
