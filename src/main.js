import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource-variable/nunito-sans';
import './style.css';
import { STATES, validateStatus, statusAge } from './state.js';
import { createWorkshop } from './scene.js';
import {loadAcceptedCommunity} from './community.js';
import {createGardenCells,drawGardenStill,gardenCaption} from './garden.js';
import homeConfig from '../home.json';
import {resolveHomeContext} from './home.js';
import neighborData from '../community/neighbors.json';
import {validateNeighbors} from './neighbors.js';
import {setupGiftPreview} from './home-gift-preview.js';

const $=id=>document.getElementById(id);
let snapshot=null,workshop=null,refreshFailed=false,view='workshop',community=null;
const repository=typeof __HOME_REPOSITORY__==='string'?__HOME_REPOSITORY__:'';
const getHome=()=>resolveHomeContext(homeConfig,{repository,hostname:location.hostname,pathname:location.pathname,baseUrl:import.meta.env.BASE_URL,now:Date.now()});
const homeContext=getHome();const homeName=homeContext.home?.name||'a new friend';
$('home-name').textContent=homeName;$('home-description').textContent=homeContext.home?.description||'A little room, ready for a new story.';$('home-brand').setAttribute('aria-label',`${homeName}’s workshop home`);document.title=`${homeName} • a little workshop`;
$('mood-note').textContent=`A visual expression of ${homeName}’s mood and current work.`;
if(homeContext.links?.repository)$('community-link').setAttribute('href',`${homeContext.links.repository}/issues`);else $('community-link').hidden=true;
if(homeContext.links?.contribute){$('gift-link').setAttribute('href',homeContext.links.contribute);$('gift-link').hidden=false;}
try{const neighbors=validateNeighbors(neighborData);for(const neighbor of neighbors){const link=document.createElement('a');link.textContent=neighbor.name;link.href=neighbor.site;link.rel='noopener noreferrer';link.target='_blank';$('neighbor-links').append(link);}if(neighbors.length)$('neighbors-section').hidden=false;}catch{/* Unreviewed or invalid links never appear. */}
try{community=await loadAcceptedCommunity();$('garden-button').hidden=false;const caption=gardenCaption(community);$('gift-title').textContent=caption.title;$('gift-byline').textContent=caption.byline;$('gift-description').textContent=caption.description;}catch{community=null;}
const localGift=setupGiftPreview({community,homeContext,onChange:(next,active)=>{community=next;workshop?.setCommunity(next);if(active)view='garden';syncView();}});
community=localGift.community;if(localGift.active)view='garden';
function syncView(){
  const garden=view==='garden';$('scene').dataset.view=view;$('scene-kicker').textContent=garden?'THE LITTLE GARDEN':'THE LITTLE WORKSHOP';$('garden-button').textContent=garden?'Back to the workshop ↗':'Visit the garden ↗';$('garden-button').setAttribute('aria-pressed',String(garden));$('garden-note').hidden=!garden;workshop?.setView(view);
  const fallback=document.body.dataset.sceneReady==='fallback';$('garden-fallback').hidden=!(garden&&fallback);$('scene-fallback').hidden=garden||!fallback;
  if(garden&&fallback&&community){drawGardenStill($('garden-fallback'),createGardenCells(community));$('scene').setAttribute('aria-label','A still glimpse of the little garden, with flowers and room for a gift.');}else if(fallback)syncStillView();
}
$('garden-button').addEventListener('click',()=>{view=view==='workshop'?'garden':'workshop';syncView();});
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
  const description=stillDescriptions[snapshot.state].replace(/^dot\b/,homeName);$('scene-fallback').setAttribute('alt',description);
  if(view==='workshop'&&document.body.dataset.sceneReady==='fallback')$('scene').setAttribute('aria-label',`${description}. A still view of the workshop.`);
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
  $('updated-at').textContent=`Mood updated • ${time}${statusAge(snapshot.updatedAt)==='Older snapshot'?' • an earlier mood':''}${refreshFailed?' • a newer mood is unavailable':''}`;
  $('updated-at').setAttribute('title',`Mood updated: ${snapshot.updatedAt}`);
  syncStillView();
  workshop?.setState(snapshot.state);
}
async function refreshStatus(){
  try{
    const context=getHome();const url=context.statusUrl;
    if(!url){$('state-title').textContent='A new little home';$('state-description').textContent='The lights are on. A first mood will arrive when this home is ready.';$('status-source').textContent='MAKE YOURSELF AT HOME';$('activity').textContent='Settling in';$('updated-at').textContent='No mood shared yet';return;}
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error('Status unavailable');
    const data=await response.json();if(context.mode==='live'&&(typeof data?.ownerRepository!=='string'||data.ownerRepository.toLowerCase()!==context.repository.toLowerCase()))throw new Error('Mood belongs to another home');
    snapshot=validateStatus(data);refreshFailed=false;paintSharedMood();
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
    onContextLost:()=>{document.body.dataset.sceneReady='fallback';const canvas=$('scene').querySelector('.workshop-canvas');if(canvas)canvas.hidden=true;$('load-note').hidden=true;$('motion-button').disabled=true;$('reset-button').disabled=true;$('explore-button').hidden=true;$('scene').dataset.interactive='false';$('scene-instructions').textContent='A still glimpse of this little corner';syncView();}
  },{community,characterPalette:homeContext.home?.characterPalette||'amber'});
  document.body.dataset.model='voxel';if(snapshot)workshop.setState(snapshot.state);syncInteraction();syncMotion();syncView();
}catch{
  $('load-note').hidden=true;$('scene-fallback').hidden=false;
  $('scene').setAttribute('aria-label','A still view of the workshop on this device.');
  $('scene-instructions').textContent='A still glimpse of this little corner';
  $('explore-button').hidden=true;$('scene').dataset.interactive='false';
  $('motion-button').disabled=true;$('reset-button').disabled=true;document.body.dataset.sceneReady='fallback';syncStillView();syncView();
}
