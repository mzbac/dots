import './style.css';
import { STATES, validateStatus, statusAge } from './state.js';
import { createWorkshop } from './scene.js';

const $ = (id) => document.getElementById(id);
let snapshot = null;
let preview = null;
let workshop = null;
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let refreshFailed = false;
let touchMode = matchMedia('(pointer: coarse)').matches;
let interactive = !touchMode;
function syncInteraction() {
  $('scene').dataset.interactive=String(interactive);
  $('explore-button').hidden=!touchMode;
  $('explore-button').textContent=interactive?'Done':'Explore 3D';
  $('explore-button').setAttribute('aria-pressed',String(interactive));
  if(touchMode) $('scene-instructions').textContent=interactive?'Drag to orbit · pinch to zoom':'Scroll freely · tap Explore 3D to orbit';
  workshop?.setInteractive(interactive);
}
$('explore-button').addEventListener('click',()=>{interactive=!interactive;syncInteraction();});
syncInteraction();

function paintState(state, isPreview = false) {
  const info = STATES[state];
  document.body.dataset.state = state;
  $('state-title').textContent = info.title;
  $('state-description').textContent = info.description;
  $('state-symbol').textContent = info.symbol;
  $('activity').textContent = info.activity;
  $('status-source').textContent = isPreview ? 'STATE PREVIEW' : 'PUBLISHED STATUS';
  $('preview-label').textContent = isPreview ? `Previewing ${info.title.toLowerCase()}` : snapshot ? 'Showing the published snapshot' : 'Published status unavailable';
  $('return-button').hidden = !isPreview;
  for (const button of document.querySelectorAll('[data-state]')) if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset.state === state));
  if (isPreview) $('updated-at').textContent = 'Preview only • published status is unchanged';
  else if (snapshot) {
    const time = new Intl.DateTimeFormat(undefined, {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', timeZoneName:'short'}).format(new Date(snapshot.updatedAt));
    $('updated-at').textContent = `${statusAge(snapshot.updatedAt)} • ${time}${refreshFailed ? ' • refresh unavailable' : ''}`;
    $('updated-at').setAttribute('title', `Last updated: ${snapshot.updatedAt}`);
  } else $('updated-at').textContent = 'No current snapshot available • try a preview below';
  workshop?.setState(state);
}
async function refreshStatus() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}status.json`, {cache:'no-store'});
    if (!response.ok) throw new Error('Status unavailable');
    snapshot = validateStatus(await response.json());
    refreshFailed = false;
    if (!preview) paintState(snapshot.state);
  } catch {
    refreshFailed = true;
    if (snapshot && !preview) paintState(snapshot.state);
    else if (!preview) {
      $('state-title').textContent = 'A quiet moment';
      $('state-description').textContent = 'The published status could not be loaded. The room is still here to explore.';
      $('status-source').textContent = 'STATUS UNAVAILABLE';
      $('activity').textContent = 'Snapshot unavailable';
      $('updated-at').textContent = 'Choose a preview below to explore the room';
      $('preview-label').textContent = 'Published status unavailable';
    }
  }
}
function syncMotion() {
  $('motion-button').setAttribute('aria-label', paused ? 'Resume animation' : 'Pause animation');
  $('motion-button').setAttribute('title', paused ? 'Resume animation' : 'Pause animation');
  $('motion-button').firstElementChild.textContent = paused ? '▷' : 'Ⅱ';
  workshop?.setPaused(paused || document.hidden);
}
for (const button of document.querySelectorAll('.state-option')) button.addEventListener('click', () => { preview = button.dataset.state; paintState(preview, true); });
$('return-button').addEventListener('click', () => {
  preview = null;
  if (snapshot) paintState(snapshot.state);
  else { refreshStatus(); $('return-button').hidden = true; }
});
$('motion-button').addEventListener('click', () => { paused = !paused; syncMotion(); });
$('reset-button').addEventListener('click', () => workshop?.reset());
const about = $('about-dialog');
$('about-button').addEventListener('click', () => about.showModal());
$('close-about').addEventListener('click', () => about.close());
about.addEventListener('click', (event) => { if (event.target === about) { const rect=about.getBoundingClientRect(); if (event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom) about.close(); } });
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => { paused = event.matches; syncMotion(); });
document.addEventListener('visibilitychange', () => { syncMotion(); if (!document.hidden) refreshStatus(); });

syncMotion();
refreshStatus();
// Poll only the deliberately published JSON snapshot. This is not live internal telemetry.
setInterval(() => { if (!document.hidden) refreshStatus(); }, 60000);
try {
  workshop = await createWorkshop($('scene'), {
    onLoaded: () => { $('load-note').hidden=true; $('scene-fallback').hidden=true; document.body.dataset.sceneReady='true'; },
    onModelError: () => { $('asset-credit').textContent='Character AI-generated with Tencent HY 3D; refined in Blender. Its file could not load in this visit, so the room is showing a simpler, locally drawn stand-in.'; document.body.dataset.model='fallback'; },
    onModelLoaded: () => { document.body.dataset.model='hunyuan'; },
    onContextLost: () => { $('scene-fallback').hidden=false; $('load-note').hidden=false; $('load-note').textContent='3D paused by this device. Reload to return to the interactive room.'; },
  });
  workshop.setState(preview || snapshot?.state || 'resting');
  syncInteraction();
  syncMotion();
} catch {
  $('load-note').hidden = true;
  $('scene-fallback').hidden = false;
  $('scene').setAttribute('aria-label', 'Illustrated workshop. Interactive 3D is unavailable on this device.');
  $('scene-instructions').textContent = 'Illustrated view • 3D is unavailable on this device';
  $('explore-button').hidden=true;
  $('scene').dataset.interactive='false';
  $('motion-button').disabled=true;
  $('reset-button').disabled=true;
  document.body.dataset.sceneReady='fallback';
}
