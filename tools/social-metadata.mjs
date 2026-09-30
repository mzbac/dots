import {resolveHomeContext} from '../src/home.js';

// Share cards belong to the same independently verified home as the mood feed.
export function socialMetadata(config,repository=''){
  if(typeof repository!=='string'||repository.split('/').length!==2)return[];
  const [owner,name]=repository.split('/');const hostname=`${owner.toLowerCase()}.github.io`;
  const pathname=name.toLowerCase()===hostname?'/':`/${name}/`;
  const context=resolveHomeContext(config,{repository,hostname,pathname});
  if(context.mode!=='live')return[];
  const url=`https://${hostname}${pathname}`;const title=`${context.home.name} • a little workshop`;
  const description=`${context.home.description} Visit the garden, bring a little gift, or make a home of your own.`;
  const image=`${url}assets/workshop-preview.png`;
  const entries=[['property','og:type','website'],['property','og:title',title],['property','og:description',description],['property','og:url',url],['property','og:image',image],['property','og:image:type','image/png'],['property','og:image:width','867'],['property','og:image:height','543'],['property','og:image:alt','A miniature workshop with a flame-headed character seated at a desk'],['name','twitter:card','summary_large_image'],['name','twitter:title',title],['name','twitter:description',description],['name','twitter:image',image],['name','twitter:image:alt','A real view of the miniature workshop']];
  return entries.map(([attribute,key,content])=>({tag:'meta',attrs:{[attribute]:key,content},injectTo:'head'}));
}
