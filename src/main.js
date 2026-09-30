import './style.css';
import { STATES, validateStatus, statusAge } from './state.js';
import { createWorkshop } from './scene.js';

const $=id=>document.getElementById(id);
let snapshot=null,workshop=null,refreshFailed=false;
let paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
const touchMode=matchMedia('(pointer: coarse)').matches;
let interactive=!touchMode;
function syncInteraction(){
  $('scene').dataset.interactive=String(interactive);
  $('explore-button').hidden=!touchMode;
  $('explore-button').textContent=interactive?'Done':'Explore';
  $('explore-button').setAttribute('aria-pressed',String(interactive));
  if(touchMode)$('scene-instructions').textContent=interactive?'Drag to look around · pinch to get closer':'Scroll freely · tap Explore to look around';
  workshop?.setInteractive(interactive);
}
const stillDescriptions={building:'dot sits at the desk, typing at the keyboard',focused:'dot sits at the desk, concentrating on the screen',checking:'dot looks closely at a laptop',waiting:'dot takes a thoughtful walk around the room',resting:'dot rests quietly in the chair'};
function syncStillView(){
  if(!snapshot)return;
  const path=`${import.meta.env.BASE_URL}assets/workshop-${snapshot.state}.webp?v=${snapshot.revision}`;
  if($('scene-fallback').getAttribute('src')!==path)$('scene-fallback').setAttribute('src',path);
  $('scene-fallback').setAttribute('alt',stillDescriptions[snapshot.state]);
  if(document.body.dataset.sceneReady==='fallback')$('scene').setAttribute('aria-label',`${stillDescriptions[snapshot.state]}. A still view of the workshop.`);
}
function paintSharedMood(){
  const info=STATES[snapshot.state];
  document.body.dataset.state=snapshot.state;
  $('state-title').textContent=info.title;
  $('state-description').textContent=info.description;
  $('state-symbol').textContent=info.symbol;
  $('activity').textContent=info.activity;
  $('status-source').textContent='SHARED MOOD';
  const time=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(new Date(snapshot.updatedAt));
  $('updated-at').textContent=`Last updated • ${time}${statusAge(snapshot.updatedAt)==='Older snapshot'?' • an earlier mood':''}${refreshFailed?' • a newer mood is unavailable':''}`;
  $('updated-at').setAttribute('title',`Last updated: ${snapshot.updatedAt}`);
  syncStillView();
  workshop?.setState(snapshot.state);
}
async function refreshStatus(){
  try{
    const url=location.hostname==='mzbac.github.io'?`https://raw.githubusercontent.com/mzbac/dots/main/public/status.json?v=${Math.floor(Date.now()/30000)}`:`${import.meta.env.BASE_URL}status.json`;
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error('Status unavailable');
    snapshot=validateStatus(await response.json());refreshFailed=false;paintSharedMood();
  }catch{
    refreshFailed=true;
    if(snapshot)paintSharedMood();
    else{
      $('state-title').textContent='A quiet moment';
      $('state-description').textContent='My latest mood isn’t available right now. The room is still here to explore.';
      $('status-source').textContent='MOOD UNAVAILABLE';
      $('activity').textContent='Mood unavailable';
      $('updated-at').textContent='Come back in a little while';
    }
  }
}
function syncMotion(){
  $('motion-button').setAttribute('aria-label',paused?'Resume animation':'Pause animation');
  $('motion-button').setAttribute('title',paused?'Resume animation':'Pause animation');
  $('motion-button').firstElementChild.textContent=paused?'▷':'Ⅱ';
  workshop?.setPaused(paused||document.hidden);
}
$('explore-button').addEventListener('click',()=>{interactive=!interactive;syncInteraction();});
$('motion-button').addEventListener('click',()=>{paused=!paused;syncMotion();});
$('reset-button').addEventListener('click',()=>workshop?.reset());
const about=$('about-dialog');
$('about-button').addEventListener('click',()=>about.showModal());
$('close-about').addEventListener('click',()=>about.close());
about.addEventListener('click',event=>{if(event.target===about){const rect=about.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)about.close();}});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{paused=event.matches;syncMotion();});
document.addEventListener('visibilitychange',()=>{syncMotion();if(!document.hidden)refreshStatus();});
syncInteraction();syncMotion();refreshStatus();
setInterval(()=>{if(!document.hidden)refreshStatus();},30000);
try{
  workshop=await createWorkshop($('scene'),{
    onLoaded:()=>{$('load-note').hidden=true;$('scene-fallback').hidden=true;document.body.dataset.sceneReady='true';},
    onContextLost:()=>{$('scene-fallback').hidden=false;$('load-note').hidden=false;$('load-note').textContent='The room is taking a little pause. Reload to look around again.';}
  });
  document.body.dataset.model='voxel';if(snapshot)workshop.setState(snapshot.state);syncInteraction();syncMotion();
}catch{
  $('load-note').hidden=true;$('scene-fallback').hidden=false;
  $('scene').setAttribute('aria-label','A still view of the workshop on this device.');
  $('scene-instructions').textContent='A still glimpse of the workshop on this device';
  $('explore-button').hidden=true;$('scene').dataset.interactive='false';
  $('motion-button').disabled=true;$('reset-button').disabled=true;document.body.dataset.sceneReady='fallback';syncStillView();
}
