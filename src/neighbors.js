const plain=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[<>\u0000-\u001f\u007f]/.test(v);
export function validateNeighbors(input){
  if(!Array.isArray(input)||input.length>16)throw new Error('Invalid neighbours');const ids=new Set();
  return input.map(entry=>{
    if(!entry||Object.getPrototypeOf(entry)!==Object.prototype||Object.keys(entry).sort().join(',')!=='id,invitation,name,repository,site')throw new Error('Invalid neighbour fields');
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)||entry.id.length>48||ids.has(entry.id)||!plain(entry.name,40))throw new Error('Invalid neighbour identity');ids.add(entry.id);
    if(!/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(entry.repository)||!/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9]\d*$/.test(entry.invitation))throw new Error('Invalid invitation link');
    const url=new URL(entry.site);if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||!url.hostname.includes('.')||/^(localhost|127\.|0\.|\[)|\.(local|internal)$/.test(url.hostname)||/^\d+(\.\d+){3}$/.test(url.hostname)||entry.site.length>240)throw new Error('Invalid home site');
    return Object.freeze({...entry,site:url.href});
  });
}
