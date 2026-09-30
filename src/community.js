import worldRaw from '../community/world.json?raw';
import {parseWorldJson,loadCommunityWorld} from './gifts.js';
const files=import.meta.glob('../community/gifts/*.json',{query:'?raw',import:'default'});
export async function loadAcceptedCommunity(){
  const world=parseWorldJson(worldRaw);const accepted={};
  for(const entry of world.accepted){const importer=files[`../${entry.path}`];if(typeof importer!=='function')throw new Error('Missing accepted gift');accepted[entry.path]=await importer();}
  return loadCommunityWorld(worldRaw,accepted);
}
