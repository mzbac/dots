import {writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseGiftJson,GIFT_PALETTE} from '../src/gifts.js';
import {readBoundedJson} from './validate-gifts.mjs';
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function giftPreviewSvg(gift){
  const scale=14;const project=(x,y,z)=>[(x-z)*.866*scale,(-y+(x+z)*.5)*scale];const faces=[];
  for(const [x,y,z,w,h,d,color]of gift.blocks){const a=x,b=x+w,l=y,t=y+h,n=z,f=z+d;const rgb=GIFT_PALETTE[color];
    for(const [points,light]of [[[[a,t,n],[a,t,f],[b,t,f],[b,t,n]],1],[[[a,l,f],[b,l,f],[b,t,f],[a,t,f]],.82],[[[b,l,n],[b,t,n],[b,t,f],[b,l,f]],.68]]){
      const shade='#'+[16,8,0].map(shift=>Math.round(((rgb>>shift)&255)*light).toString(16).padStart(2,'0')).join('');
      faces.push({depth:x+z+y*.01,points:points.map(p=>project(...p)),shade});
    }
  }
  const coords=faces.flatMap(f=>f.points),minX=Math.min(...coords.map(p=>p[0])),maxX=Math.max(...coords.map(p=>p[0])),minY=Math.min(...coords.map(p=>p[1])),maxY=Math.max(...coords.map(p=>p[1]));
  const width=Math.max(360,maxX-minX+64),height=maxY-minY+135,dx=(width-maxX-minX)/2,dy=55-minY;
  faces.sort((a,b)=>a.depth-b.depth);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"><title>${escape(gift.title)}</title><rect width="100%" height="100%" fill="#f3f2e9"/>${faces.map(f=>`<polygon points="${f.points.map(([x,y])=>`${(x+dx).toFixed(2)},${(y+dy).toFixed(2)}`).join(' ')}" fill="${f.shade}"/>`).join('')}<text x="${width/2}" y="${height-42}" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#263e31">${escape(gift.title)}</text><text x="${width/2}" y="${height-19}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#586956">by ${escape(gift.creator)}</text></svg>`;
}
export async function previewFile(input,output){const gift=parseGiftJson(await readBoundedJson(input));writeFileSync(output,giftPreviewSvg(gift));return gift;}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==4)throw new Error('Usage: node tools/preview-gift.mjs /path/to/gift.json /path/to/preview.svg');const gift=await previewFile(process.argv[2],process.argv[3]);console.log(`Previewed ${gift.id}: ${gift.blocks.length} blocks`);}catch(error){console.error(error.message);process.exitCode=1;}
}
