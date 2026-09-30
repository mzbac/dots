import {createHomeDescriptor} from '../src/home-protocol.js';

// Only CI's explicit repository + commit identity can advertise a published
// home. A copied config or an ordinary local build never supplies that identity.
export function homeDescriptorAsset(config,environment={}){
 const repository=environment.GITHUB_REPOSITORY||'',revision=environment.GITHUB_SHA||'';
 if(!repository||!/^[a-f0-9]{40}$/.test(revision))return null;
 const descriptor=createHomeDescriptor(config,{repository,revision});
 return descriptor?{type:'asset',fileName:'home-descriptor.json',source:JSON.stringify(descriptor,null,2)+'\n'}:null;
}
