import {decodeGroupShare,encodeGroupShare,MAX_GROUP_PAYLOAD_LENGTH} from './group-project-engine.js';
import {createGroupGift,createGroupGiftProvenance,getGiftPreviewCommunity} from './group-gift.js';

export const LOCAL_GIFT_KEY='dot.local-garden-gift.v1';
const prefix='#gift-project=';
export function decodeGiftProject(value){
  if(typeof value!=='string'||value.length>MAX_GROUP_PAYLOAD_LENGTH)throw new Error('This flower link is too large.');
  const project=decodeGroupShare(value);createGroupGift(project);return project;
}
export function giftHomeURL(project,base){const url=new URL('./',base),revision=new URL(base).searchParams.get('v');if(revision&&/^[a-f0-9]{7,40}$/.test(revision))url.searchParams.set('v',revision);url.hash=prefix.slice(1)+encodeGroupShare(project);return url.href;}
export function giftSourceURL(project,base){const url=new URL('group.html',base);url.search='';url.hash='project='+encodeGroupShare(project);return url.href;}
function download(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

// This controller changes only a bounded in-memory garden and an explicit local
// browser save. It never writes a public registry, mood, issue or pull request.
export function setupGiftPreview({community,homeContext,onChange}){
  const $=id=>document.getElementById(id),accepted=community;
  let project=null,current=accepted,saved=false;
  const key=LOCAL_GIFT_KEY+':'+location.pathname.replace(/index\.html$/,'');
  function notify(message){$('local-gift-message').textContent=message;}
  function paint(){
    $('local-gift-preview').hidden=!project;
    document.body.dataset.localGift=project?createGroupGift(project).id:'';
    if(!project)return;
    const provenance=createGroupGiftProvenance(project);
    $('local-gift-title').textContent=createGroupGift(project).title;
    $('local-gift-credit').textContent='Contributions by '+provenance.contributors.map(p=>p.name).join(', ')+'.';
    $('local-gift-source').href=giftSourceURL(project,location.href);
    $('save-local-gift').textContent=saved?'Saved in this browser':'Keep this display';
    $('save-local-gift').disabled=saved;
    $('gift-review-link').hidden=!homeContext.links?.contribute;
    if(homeContext.links?.contribute)$('gift-review-link').href=homeContext.links.contribute+'#bring-a-group-flower-home';
  }
  function open(encoded,{remembered=false}={}){
    const next=decodeGiftProject(encoded),gift=createGroupGift(next),candidate=getGiftPreviewCommunity(accepted,gift);
    project=next;current=candidate;saved=remembered;$('gift-preview-error').hidden=true;paint();
    notify(remembered?'Your saved flower is here.':'Your sculpture has a place here. Keep it in this browser to see it next time.');
  }
  function fromLocation(){
    if(location.hash.startsWith(prefix)){
      try{const encoded=location.hash.slice(prefix.length);let remembered=false;try{remembered=localStorage.getItem(key)===encoded;}catch{}open(encoded,{remembered});return true;}catch{project=null;current=accepted;paint();$('gift-preview-error').hidden=false;$('gift-preview-error').textContent='This flower could not be placed here. The usual garden is unchanged.';return false;}
    }
    return false;
  }
  if(!fromLocation()){
    if(!location.hash)try{const stored=localStorage.getItem(key);if(stored)open(stored,{remembered:true});}catch{/* A denied or invalid local save never replaces the public scene. */}
  }
  $('save-local-gift').addEventListener('click',()=>{
    if(!project)return;
    try{localStorage.setItem(key,encodeGroupShare(project));saved=true;paint();notify('Saved in this browser. This display is only yours to see here.');}catch{notify('Saving is unavailable. This display stays only in this tab; keep the flower’s link to open it again.');}
  });
  $('remove-local-gift').addEventListener('click',()=>{
    try{localStorage.removeItem(key);$('gift-preview-error').hidden=true;}catch{$('gift-preview-error').hidden=false;$('gift-preview-error').textContent='The display is hidden for this visit. Browser storage could not be cleared, so an earlier saved display may return after reload.';}
    if(location.hash.startsWith(prefix))history.replaceState(null,'',location.pathname+location.search);
    project=null;current=accepted;saved=false;paint();onChange(current,false);$('garden-button').focus();
  });
  $('download-local-gift').addEventListener('click',()=>{if(project){const gift=createGroupGift(project);download(gift.id+'.json',gift);notify('Sculpture downloaded. Offer it in a pull request; it becomes public once it passes the home’s gift checks.');}});
  $('download-gift-credit').addEventListener('click',()=>{if(project){const provenance=createGroupGiftProvenance(project);download(provenance.giftId+'.provenance.json',provenance);notify('Credits and the original recipe downloaded. Include these with the sculpture when you propose a gift.');}});
  window.addEventListener('hashchange',()=>{if(location.hash.startsWith(prefix)){const opened=fromLocation();onChange(current,opened);}else if(project){project=null;current=accepted;paint();onChange(current,false);}});
  return{get community(){return current;},get active(){return Boolean(project);}};
}
