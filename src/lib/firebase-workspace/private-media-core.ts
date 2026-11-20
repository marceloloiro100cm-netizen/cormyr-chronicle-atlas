/* eslint-disable @typescript-eslint/no-explicit-any -- Firestore Admin boundary. */
/**
 * Item 11: caminho e vínculos dos anexos, sem URLs públicas permanentes.
 * Um token só pode ser escrito se a imagem pertencer ao autor autenticado.
 */
import {createHash} from 'node:crypto';
export const PRIVATE_MEDIA_LIMIT=5*1024*1024;
export const PRIVATE_MEDIA_RE=/^private\/([a-f0-9]{64})\/([^/\u0000-\u001f\u007f]{1,128})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(png|jpg|webp|gif)$/i;
export const PRIVATE_MEDIA_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const privateMediaHash=(s:string)=>createHash('sha256').update(s).digest('hex');
export const privateMediaRef=(root:any,path:string)=>
 root.collection('privateMedia').doc(privateMediaHash('private-media:'+path));
export const privateMediaTokens=(content:string):string[]=>{
 if(typeof content!=='string')return [];
 const tokens=[...content.matchAll(/\[cormyr-image:([A-Za-z0-9_./-]+)\|[^\]\r\n]*\]/g)]
  .map(m=>m[1]??'').filter(Boolean);
 return [...new Set(tokens)];
};
export const privateMediaType=(type:string)=>({
 'image/jpeg':{ext:'jpg',magic:(b:Buffer)=>b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff},
 'image/png':{ext:'png',magic:(b:Buffer)=>b.length>=8&&b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))},
 'image/webp':{ext:'webp',magic:(b:Buffer)=>b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'},
 'image/gif':{ext:'gif',magic:(b:Buffer)=>b.length>=6&&['GIF87a','GIF89a'].includes(b.toString('ascii',0,6))},
} as Record<string,{ext:string;magic:(buffer:Buffer)=>boolean}>)[type]??null;

export class PrivateMediaError extends Error{
 constructor(readonly code:string,readonly status=403){super(code);}
}
export const privateMediaFail=(code:string,status=403):never=>{throw new PrivateMediaError(code,status);};
export function validatePrivateMediaSource(path:string,snapshot:string,uid?:string){
 const match=PRIVATE_MEDIA_RE.exec(path);
 if(!match||match[1]!==snapshot||(uid!==undefined&&match[2]!==uid))
  return privateMediaFail('private_media_path_invalid',400);
 return match;
}
export async function authorizeMediaTokens(tx:any,root:any,snapshot:string,
 uid:string,content:string,priorContent?:string){
 const paths=privateMediaTokens(content);
 if(paths.length>16)privateMediaFail('private_media_too_many',413);
 const reused=new Set(privateMediaTokens(priorContent??''));
 const fresh=paths.filter(p=>!reused.has(p));
 if(!fresh.length)return;
 const refs=fresh.map(path=>privateMediaRef(root,path));
 const docs=await Promise.all(refs.map(ref=>tx.get(ref)));
 for(let i=0;i<fresh.length;i++){
  validatePrivateMediaSource(fresh[i]!,snapshot,uid);
  const v=docs[i]?.data();
  if(!docs[i]?.exists||v?.path!==fresh[i]||
    v?.sourceSnapshotId!==snapshot||v?.ownerUid!==uid||
    v?.status!=='ready'||v?.contentType===undefined)
   privateMediaFail('private_media_reference_denied',403);
 }
}
export function privateMediaReferenced(content:string,path:string):boolean{
 return privateMediaTokens(content).includes(path);
}
