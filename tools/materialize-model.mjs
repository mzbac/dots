import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
const m=JSON.parse(readFileSync('model-source/manifest.json','utf8'));
const model=Buffer.from(m.chunks.map(p=>readFileSync(p,'utf8')).join(''),'base64');
if(model.length!==m.bytes||createHash('sha256').update(model).digest('hex')!==m.sha256)throw new Error('Model integrity check failed');
if(model.subarray(0,4).toString()!=='glTF')throw new Error('Invalid GLB header');
mkdirSync(dirname(m.output),{recursive:true});writeFileSync(m.output,model);
console.log(`Verified and restored HY 3D / Blender character (${model.length} bytes)`);
